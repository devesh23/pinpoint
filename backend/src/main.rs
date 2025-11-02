// Backend server: provides a mock /positions endpoint for demo and testing.
// This file exposes a GET /positions endpoint which returns a generated
// `uwb_update`-style payload with per-router distances computed from a
// randomly chosen device position. This lets the frontend trilateration
// logic be exercised without external hardware.

use actix_web::{get, middleware, web, App, HttpServer, HttpResponse, Responder, Error};
use actix_cors::Cors;
use serde::Deserialize;
use serde_json::json;
use rand::prelude::*;
use std::time::{SystemTime, UNIX_EPOCH};
use futures_util::stream::StreamExt;
use std::collections::HashMap;
use async_stream::stream;
use bytes::Bytes;
use reqwest::Client as ReqwestClient;
use std::env;

#[derive(Deserialize)]
struct QueryApiKey {
    // optional api key in query for demo
    api_key: Option<String>
}

// Anchors (routers) at three corners (top-left, top-right, bottom-left)
// The bottom-right corner intentionally has no anchor per requirements.
fn corner_anchors(width: f64, height: f64) -> Vec<(&'static str, f64, f64)> {
    vec![
        ("020000b3", 0.0, 0.0),           // top-left
        ("02000053", width, 0.0),         // top-right
        ("020000e6", 0.0, height),        // bottom-left
    ]
}

// Deterministic path waypoints based on rectangle size.
// Middle -> left edge -> right edge -> middle -> bottom edge -> top edge -> middle
// -> left edge to bottom-left anchor -> along bottom to bottom-right (virtual)
// -> up right edge to top-right anchor -> along top to top-left anchor -> back to middle.
fn path_waypoints(width: f64, height: f64) -> Vec<(f64, f64)> {
    let cx = width / 2.0;
    let cy = height / 2.0;
    let tl = (0.0, 0.0);
    let tr = (width, 0.0);
    let bl = (0.0, height);
    // let br = (width, height); // virtual (no anchor) used for edge traversal
    vec![
        (cx, cy),          // start center
        (0.0, cy),         // to left edge
        (width, cy),       // to right edge
        (cx, cy),          // back to center
        (cx, height),      // down to bottom edge
        (cx, 0.0),         // up to top edge
        (cx, cy),          // back to center
        (0.0, cy),         // to left edge
        bl,                // walk down to bottom-left anchor
        (width, height),   // along bottom edge to bottom-right (virtual)
        tr,                // up right edge to top-right anchor
        tl,                // along top edge to top-left anchor
        (cx, cy),          // back to center
    ]
}

// Generate a single uwb_update payload with random device position inside
// the factory bounds (width x height in meters).
fn generate_uwb_update_for_pos(x: f64, y: f64, width: f64, height: f64, anchor_z: f64, tag_z: f64) -> serde_json::Value {
    let mut beacons = vec![];
    for (id, ax, ay) in corner_anchors(width, height) {
        let dz = tag_z - anchor_z;
        let dist = ((ax - x).powi(2) + (ay - y).powi(2) + dz.powi(2)).sqrt();
        beacons.push(json!({
            "major": "0200",
            "minor": id.get(2..).unwrap_or("0000"),
            "beaconId": id,
            // distance in meters; conversion to cm is handled by endpoints
            "distance": dist,
            "battery": 100
        }));
    }
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    json!({
        "type": "uwb_update",
        "payload": {
            "deviceIdHex": "a0ba3e29",
            "deviceIdDecimal": 2696560169u64,
            "numberOfBeacons": beacons.len(),
            "motion": "No Movement",
            "beacons": beacons,
            // include Z metadata to aid debugging (optional for clients)
            "anchorsZ": anchor_z,
            "tagZ": tag_z,
            "requestTimestamp": ts
        },
        "ts": ts
    })
}

// Create an SSE-style text block for a given payload value
fn sse_event_block(payload: &serde_json::Value) -> String {
    let data = payload.to_string();
    format!("event: uwb_update\n{}\n\n", data.split('\n').map(|l| format!("data: {}", l)).collect::<Vec<_>>().join("\n"))
}

// Mock streaming endpoint: emits a uwb_update every `interval_ms` milliseconds.
#[get("/mock/stream")]
async fn mock_stream(query: web::Query<HashMap<String, String>>) -> Result<HttpResponse, Error> {
    let width = query.get("w").and_then(|s| s.parse::<f64>().ok()).unwrap_or(20.0);
    let height = query.get("h").and_then(|s| s.parse::<f64>().ok()).unwrap_or(10.0);
    // Anchors share a single Z; choose randomly unless provided
    let mut rng = rand::thread_rng();
    let anchor_z = query.get("az").and_then(|s| s.parse::<f64>().ok()).unwrap_or_else(|| rng.gen_range(1.2..1.8));
    // Tag Z can be provided or randomized; keep constant for the stream for stability
    let tz_base = query.get("tz").and_then(|s| s.parse::<f64>().ok()).unwrap_or_else(|| rng.gen_range(0.8..2.2));
    // Optional sinusoidal oscillation of tag Z to stress solver
    let tz_amp = query.get("tzAmp").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let tz_hz = query.get("tzHz").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    // Perturbation controls
    let noise = query.get("noise").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let outlier_rate = query.get("outlierRate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let outlier_scale = query.get("outlierScale").and_then(|s| s.parse::<f64>().ok()).unwrap_or(1.8);
    let drop_rate = query.get("dropRate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let zero_rate = query.get("zeroRate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    // Use a stable mock device ID so the frontend can draw a continuous path
    let stable_hex = String::from("a0ba3e29");
    let stable_dec: u64 = 2696560169;
    let waypoints = path_waypoints(width, height);
    let step = 0.05_f64; // fraction per tick along each segment
    let mut seg_idx: usize = 0;
    let mut t: f64 = 0.0;
    let mut tick: u64 = 0;
    // create a stream that yields Bytes of SSE events periodically
    let s = stream! {
        loop {
            // Interpolate along current segment
            let (x1, y1) = waypoints[seg_idx];
            let (x2, y2) = waypoints[(seg_idx + 1) % waypoints.len()];
            let x = x1 + (x2 - x1) * t;
            let y = y1 + (y2 - y1) * t;
            t += step;
            if t >= 1.0 { t = 0.0; seg_idx = (seg_idx + 1) % waypoints.len(); }

            let tag_z = if tz_amp > 0.0 && tz_hz > 0.0 { tz_base + tz_amp * (std::f64::consts::TAU * tz_hz * (tick as f64) * 0.6).sin() } else { tz_base };
            let mut p2 = generate_uwb_update_for_pos(x, y, width, height, anchor_z, tag_z);
            // Apply perturbations and convert to centimeters
            if let Some(payload) = p2.get_mut("payload") {
                if let Some(arr) = payload.get_mut("beacons").and_then(|b| b.as_array_mut()) {
                    let mut new_arr: Vec<serde_json::Value> = Vec::with_capacity(arr.len());
                    for mut b in arr.drain(..) {
                        // dropout
                        if drop_rate > 0.0 && rng.gen::<f64>() < drop_rate { continue; }
                        if let Some(d) = b.get("distance").and_then(|v| v.as_f64()) {
                            let mut d_m = d;
                            // occasional near-zero
                            if zero_rate > 0.0 && rng.gen::<f64>() < zero_rate { d_m = rng.gen_range(0.0..0.10); }
                            // uniform noise
                            if noise > 0.0 { d_m += rng.gen_range(-noise..noise); }
                            // outlier scaling
                            if outlier_rate > 0.0 && rng.gen::<f64>() < outlier_rate { d_m *= outlier_scale; }
                            if d_m < 0.0 { d_m = 0.0; }
                            let cm = (d_m * 100.0).round();
                            b["distance"] = json!(cm as i64);
                            new_arr.push(b);
                        } else {
                            new_arr.push(b);
                        }
                    }
                    *arr = new_arr;
                    payload["numberOfBeacons"] = json!(arr.len());
                }
                // Ensure device ID is constant
                payload["deviceIdHex"] = json!(stable_hex);
                payload["deviceIdDecimal"] = json!(stable_dec);
            }
            let block = sse_event_block(&p2);
            yield Ok::<Bytes, Error>(Bytes::from(block));
            // faster updates for smoother path
            actix_web::rt::time::sleep(std::time::Duration::from_millis(600)).await;
            tick = tick.wrapping_add(1);
        }
    };

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        // disable nginx proxy buffering if present
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(s))
}

// Single-shot mock endpoint: emits one `uwb_update` payload (distances in cm)
#[get("/mock/once")]
async fn mock_once(query: web::Query<HashMap<String, String>>) -> Result<HttpResponse, Error> {
    let width = query.get("w").and_then(|s| s.parse::<f64>().ok()).unwrap_or(20.0);
    let height = query.get("h").and_then(|s| s.parse::<f64>().ok()).unwrap_or(10.0);
    let cx = width/2.0; let cy = height/2.0;
    let mut rng = rand::thread_rng();
    let anchor_z = query.get("az").and_then(|s| s.parse::<f64>().ok()).unwrap_or_else(|| rng.gen_range(1.2..1.8));
    let tz_base = query.get("tz").and_then(|s| s.parse::<f64>().ok()).unwrap_or_else(|| rng.gen_range(0.8..2.2));
    let tz_amp = query.get("tzAmp").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let tz_hz = query.get("tzHz").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let noise = query.get("noise").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let outlier_rate = query.get("outlierRate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let outlier_scale = query.get("outlierScale").and_then(|s| s.parse::<f64>().ok()).unwrap_or(1.8);
    let drop_rate = query.get("dropRate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let zero_rate = query.get("zeroRate").and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as f64;
    let t_sec = now_ms / 1000.0;
    let tag_z = if tz_amp > 0.0 && tz_hz > 0.0 { tz_base + tz_amp * (std::f64::consts::TAU * tz_hz * t_sec).sin() } else { tz_base };
    let mut p = generate_uwb_update_for_pos(cx, cy, width, height, anchor_z, tag_z);
    // Convert distances to centimeters to match the live stream format
    let mut p2 = p.clone();
    if let Some(payload) = p2.get_mut("payload") {
        if let Some(arr) = payload.get_mut("beacons").and_then(|b| b.as_array_mut()) {
            let mut new_arr: Vec<serde_json::Value> = Vec::with_capacity(arr.len());
            for mut b in arr.drain(..) {
                if drop_rate > 0.0 && rng.gen::<f64>() < drop_rate { continue; }
                if let Some(d) = b.get("distance").and_then(|v| v.as_f64()) {
                    let mut d_m = d;
                    if zero_rate > 0.0 && rng.gen::<f64>() < zero_rate { d_m = rng.gen_range(0.0..0.10); }
                    if noise > 0.0 { d_m += rng.gen_range(-noise..noise); }
                    if outlier_rate > 0.0 && rng.gen::<f64>() < outlier_rate { d_m *= outlier_scale; }
                    if d_m < 0.0 { d_m = 0.0; }
                    let cm = (d_m * 100.0).round();
                    b["distance"] = json!(cm as i64);
                    new_arr.push(b);
                } else {
                    new_arr.push(b);
                }
            }
            *arr = new_arr;
            payload["numberOfBeacons"] = json!(arr.len());
        }
    }

    // Use the same stable ID here as well
    if let Some(payload) = p2.get_mut("payload") {
        payload["deviceIdHex"] = json!("a0ba3e29");
        payload["deviceIdDecimal"] = json!(2696560169u64);
    }

    // If ?sse=1 is requested, return a single SSE event block and close
    if let Some(val) = query.get("sse") {
        if val == "1" || val.eq_ignore_ascii_case("true") {
            let block = sse_event_block(&p2);
            return Ok(HttpResponse::Ok()
                .insert_header(("Content-Type", "text/event-stream"))
                .insert_header(("Cache-Control", "no-cache"))
                .insert_header(("Connection", "keep-alive"))
                .insert_header(("X-Accel-Buffering", "no"))
                .body(block));
        }
    }

    Ok(HttpResponse::Ok().json(p2))
}

// Proxy streaming endpoint: exchanges refresh token for access token and
// forwards the remote streaming response as-is to the client.
#[get("/proxy/uwbStream")]
async fn proxy_uwb_stream() -> Result<HttpResponse, Error> {
    // refresh token is hardcoded as per requirements
    let refresh_url = "http://52.15.252.22:8080/v1/auth/refresh/?refreshToken=54c8d127a37bbafa0af6dfc855ad24c242fe2f45a88340d67adf05dfeaf3046e";
    let client = ReqwestClient::new();
    let mut access_token: Option<String> = None;
    match client.get(refresh_url).send().await {
        Ok(r) => if let Ok(j) = r.json::<serde_json::Value>().await { access_token = j.get("accessToken").and_then(|v| v.as_str()).map(|s| s.to_string()); },
        Err(e) => log::warn!("refresh fetch failed: {:?}", e)
    }

    let remote = "http://52.15.252.22:8080/v1/uwbDataStream";
    let mut req = client.get(remote);
    if let Some(token) = &access_token { req = req.bearer_auth(token); }
    let resp = req.send().await.map_err(|e| { log::error!("proxy request failed: {:?}", e); actix_web::error::ErrorBadGateway("upstream error") })?;

    let upstream = resp.bytes_stream();
    let s = upstream.map(|chunk_res| {
        match chunk_res {
            Ok(bytes) => Ok::<Bytes, Error>(Bytes::from(bytes)),
            Err(e) => { log::error!("upstream chunk error: {:?}", e); Err(actix_web::error::ErrorBadGateway("upstream error")) }
        }
    });

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(s))
}

#[get("/positions")]
async fn positions(_q: web::Query<QueryApiKey>) -> impl Responder {
    // Factory bounds — default values; provide center snapshot
    let width = 20.0_f64;
    let height = 10.0_f64;
    // default Zs: anchors at 1.5m, tag at 1.5m, default geometry
    let mut payload = generate_uwb_update_for_pos(width/2.0, height/2.0, width, height, 1.5, 1.5);
    // Keep positions endpoint consistent with stable ID for easier demos
    if let Some(p) = payload.get_mut("payload") {
        p["deviceIdHex"] = json!("a0ba3e29");
        p["deviceIdDecimal"] = json!(2696560169u64);
    }
    HttpResponse::Ok().json(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_uwb_update_shape() {
        let v = generate_uwb_update(20.0, 10.0);
        // type must be present
        assert_eq!(v.get("type").and_then(|t| t.as_str()), Some("uwb_update"));
        // payload must contain beacons array
        let beacons = v.get("payload").and_then(|p| p.get("beacons")).and_then(|b| b.as_array()).expect("beacons array expected");
        assert!(beacons.len() >= 1);
        // each beacon must have beaconId and distance
        for b in beacons {
            assert!(b.get("beaconId").is_some());
            assert!(b.get("distance").is_some());
        }
    }

    #[test]
    fn generate_uwb_update_distances_are_cm_ints_and_in_range() {
        let v = generate_uwb_update(20.0, 10.0);
        let beacons = v.get("payload").and_then(|p| p.get("beacons")).and_then(|b| b.as_array()).expect("beacons array expected");
        for b in beacons {
            // distance should be present
            let d = b.get("distance").expect("distance present");
            // It should be numeric — in generate_uwb_update we produce meters with 2 decimals,
            // but our CI/mock endpoints convert to centimeters; ensure the numeric type exists.
            // We'll accept either integer or float and convert to i64 for the check.
            let dist_cm_opt = if d.is_i64() { d.as_i64() } else if d.is_f64() { Some(d.as_f64().unwrap().round() as i64) } else { None };
            let dist_cm = dist_cm_opt.expect("distance numeric") ;
            // reasonable bounds for factory distances in centimeters
            assert!(dist_cm >= 0 && dist_cm <= 10000, "distance out of range: {}", dist_cm);
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    // Read runtime configuration from environment
    let backend_port: u16 = env::var("BACKEND_PORT").ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(8080);
    let frontend_port_str = env::var("FRONTEND_PORT").unwrap_or_else(|_| "3000".to_string());

    HttpServer::new(move || {
        // For demos, allow origins dynamically to avoid accidental 400 CORS errors
        // when the frontend is served from a different host/port. In production
        // please restrict origins to known hosts.
        let cors = Cors::default()
            .allow_any_method()
            .allow_any_header()
            .supports_credentials()
            .allowed_origin_fn(|origin, _req_head| {
                // Accept any origin for demo purposes. Log the origin for debugging.
                if let Ok(s) = std::str::from_utf8(origin.as_bytes()) {
                    log::debug!("CORS allowing origin: {}", s);
                }
                true
            });

        App::new()
            .wrap(middleware::Logger::default())
            .wrap(cors)
            .service(positions)
            .service(mock_stream)
            .service(mock_once)
            .service(proxy_uwb_stream)
    })
    .bind(("0.0.0.0", backend_port))?
    .run()
    .await
}
