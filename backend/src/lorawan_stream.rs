//! LoRaWAN ingestion + local SSE stream.
//!
//! Endpoints registered when NOT using `USE_REMOTE_UWB` (i.e. local ingestion mode):
//! - `POST /v1/uwb`: Accepts an encrypted uplink frame `{ content: { data, devEui, fPort, timestamp? } }`.
//!     * Decrypt & parse via `decode_frame`.
//!     * If message type == 0x05 (location report) -> convert to `uwb_update` JSON and broadcast.
//!     * If message type == 0x01 (registration) -> build downlink response, encrypt, optionally POST to `DOWNLINK_URL`.
//! - `GET /proxy/uwbStream`: Local SSE emitting broadcast updates (mirrors legacy naming for frontend compatibility).
//!
//! Broadcasting strategy:
//! A `tokio::sync::broadcast::Sender<String>` fan-out distributes JSON strings to all SSE clients.
//! This avoids per-connection mutex contention and offers backpressure: lagging receivers get a
//! `Lagged` error which we translate into a comment frame.
//!
//! Downlink Posting (0x01):
//! If `DOWNLINK_URL` env var is present, the encrypted downlink frame (base64) is POST'ed to that URL
//! with body: `{ data, devEui, fPort, modeEnum, priority, timestamp, useClassA }` mirroring the Node implementation.
//! Errors in downstream HTTP are captured and returned in the `downlink` field but do not prevent 0x05 broadcasts.
use actix_web::{get, post, web, HttpResponse, Error, HttpRequest};
use serde_json::{json, Value};
use bytes::Bytes;
use async_stream::stream;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast::Sender;
use crate::lorawan_codec::{decode_frame, as_uwb_update, build_downlink_hex, encrypt_downlink};
use std::env;
use metrics::{counter, histogram};
use tracing::{error, warn, info, debug};

fn sse_block_from_value(v: &Value) -> String {
    let data = v.to_string();
    // default event name is uwb_update for compatibility with frontend
    format!(
        "event: uwb_update\n{}\n\n",
        data
            .split('\n')
            .map(|l| format!("data: {}", l))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

/// Ingest encrypted uplink frame, decode, broadcast (0x05) and optionally produce + send downlink (0x01).
#[post("/v1/uwb")]
pub async fn post_uwb(req: HttpRequest, body: web::Json<Value>, tx: web::Data<Sender<String>>) -> Result<HttpResponse, Error> {
    let req_start = std::time::Instant::now();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    // Expect { content: { data: <base64>, devEui, fPort, timestamp? } } similar to server.ts
    let content = body.get("content").cloned().unwrap_or(Value::Null);
    let data_b64 = content.get("data").and_then(|v| v.as_str()).unwrap_or("");
    let secret_key = env::var("LORA_SECRET_KEY").unwrap_or_else(|_| "A60C3263B832E551EEBDDDB93D8B05EA".to_string());
    let sign_token = env::var("LORA_SIGN_TOKEN").unwrap_or_else(|_| "3E3D4BEE7FE182D8".to_string());
    let log_keys_full = env::var("LOG_KEYS_FULL").ok().map(|s| s=="1" || s.to_lowercase()=="true").unwrap_or(false);
    let peer = req
        .connection_info()
        .peer_addr()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let sk_masked = if log_keys_full { secret_key.clone() } else { format!("{}..{}", &secret_key[..4.min(secret_key.len())], &secret_key[secret_key.len().saturating_sub(4)..]) };
    let tk_masked = if log_keys_full { sign_token.clone() } else { format!("{}..{}", &sign_token[..4.min(sign_token.len())], &sign_token[sign_token.len().saturating_sub(4)..]) };
    info!(peer = %peer, data_b64_len = data_b64.len(), dev_eui = content.get("devEui").and_then(|v| v.as_str()).unwrap_or(""), f_port = content.get("fPort").and_then(|v| v.as_i64()).unwrap_or(-1), sk = %sk_masked, tk = %tk_masked, full_keys = log_keys_full, "POST /v1/uwb received");
    let mut downlink_response: Option<Value> = None; // JSON detail about constructed/sent downlink
    if !data_b64.is_empty() {
        match decode_frame(data_b64, &secret_key, &sign_token) {
            Ok(df) => {
                info!(msg_type = format!("0x{:02x}", df.message_type), "decode ok");
                // If message type 0x01: build and encrypt a downlink and (optionally) send it to external server via reqwest
                if df.message_type == 0x01 {
                    if let Ok(down_hex) = build_downlink_hex(&df) {
                        if let Ok(encrypted_b64) = encrypt_downlink(now, &down_hex, &sign_token, &secret_key) {
                            // Attempt optional external POST if DOWNLINK_URL is configured.
                            let downlink_url = env::var("DOWNLINK_URL").ok();
                            let mut sent_obj = json!({ "sentData": encrypted_b64 });
                            if let Some(url) = downlink_url {
                                info!(url = %url, "posting downlink");
                                // Fire-and-await; failures captured but do not abort response.
                                match reqwest::Client::new().post(&url)
                                    .json(&json!({
                                        "data": encrypted_b64,
                                        "devEui": content.get("devEui").and_then(|v| v.as_str()).unwrap_or(""),
                                        "fPort": content.get("fPort").and_then(|v| v.as_i64()).unwrap_or(0),
                                        "modeEnum": "DEFAULT_MODE",
                                        "priority": false,
                                        "timestamp": now,
                                        "useClassA": true
                                    }))
                                    .send().await {
                                    Ok(resp) => {
                                        let status = resp.status().as_u16();
                                        let body_json = resp.json::<Value>().await.unwrap_or(json!({"error":"invalid-json"}));
                                        sent_obj["downlinkHttp"] = json!({ "status": status, "body": body_json });
                                        counter!("uwb.downlink.http.ok", "status" => status.to_string()).increment(1);
                                        info!(status, "downlink http ok");
                                    },
                                    Err(e) => {
                                        sent_obj["downlinkHttpError"] = json!(e.to_string());
                                        counter!("uwb.downlink.http.err").increment(1);
                                        warn!(error = %e, "downlink http failed");
                                    }
                                }
                            }
                            downlink_response = Some(sent_obj);
                        }
                    }
                }
                // If message type 0x05: convert to uwb_update and broadcast
                if let Some(update) = as_uwb_update(&df, now) {
                    match tx.send(update.to_string()) {
                        Ok(subs) => { info!(subs, "broadcast sent uwb_update"); },
                        Err(e) => { warn!(error = %e, "broadcast send failed"); }
                    }
                    counter!("uwb.broadcast.sent").increment(1);
                }
            },
            Err(e) => {
                counter!("uwb.decode.err").increment(1);
                error!(error = %e, "decode failed");
                let _ = tx.send(json!({"type":"decode_error","error":e,"ts":now}).to_string());
            }
        }
    }
    histogram!("uwb.ingest.latency_ms").record(req_start.elapsed().as_secs_f64()*1000.0);
    Ok(HttpResponse::Ok().json(json!({"ok": true, "downlink": downlink_response })))
}

/// Local SSE stream of decoded location updates plus occasional comment heartbeats.
#[get("/proxy/uwbStream")]
pub async fn local_stream(tx: web::Data<Sender<String>>) -> Result<HttpResponse, Error> {
    // Subscribe to broadcast; each client gets its own receiver
    let mut rx = tx.subscribe();
    let s = stream! {
        // send hello
        yield Ok::<Bytes, Error>(Bytes::from_static(b": hello\n\n"));
        // heartbeat ticker
        let mut hb = tokio::time::interval(Duration::from_secs(15));
        loop {
            tokio::select! {
                _ = hb.tick() => {
                    yield Ok(Bytes::from_static(b": ping\n\n"));
                    counter!("uwb.sse.heartbeat").increment(1);
                }
                recv = rx.recv() => {
                    match recv {
                        Ok(s) => {
                            // s is a JSON string; wrap into SSE block
                            let v: Value = serde_json::from_str(&s).unwrap_or(json!({"type":"uwb_update","payload":null}));
                            let block = sse_block_from_value(&v);
                            yield Ok(Bytes::from(block));
                            counter!("uwb.sse.sent").increment(1);
                        },
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                            // If lagged, send a note and continue
                            yield Ok(Bytes::from_static(b": lagged\n\n"));
                            counter!("uwb.sse.lagged").increment(1);
                        },
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                            break;
                        }
                    }
                }
            }
        }
    };

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(s))
}

/// Register ingestion + SSE endpoints and attach broadcast sender to app data.
pub fn config(cfg: &mut web::ServiceConfig, tx: Sender<String>) {
    cfg.app_data(web::Data::new(tx));
    cfg.service(post_uwb);
    cfg.service(local_stream);
}
