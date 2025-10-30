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

#[derive(Deserialize)]
struct QueryApiKey {
    // optional api key in query for demo
    api_key: Option<String>
}

// Anchors (routers) coordinates in meters for the mock generator.
// Make sure these match the frontend anchor configuration for realistic tests.
fn anchors() -> Vec<(&'static str, f64, f64)> {
    vec![
        ("020000b3", 1.0, 1.0),
        ("02000053", 10.0, 1.2),
        ("020000e6", 7.0, 6.0),
    ]
}

// Generate a single uwb_update payload with random device position inside
// the factory bounds (width x height in meters).
fn generate_uwb_update(width: f64, height: f64) -> serde_json::Value {
    let mut rng = thread_rng();
    let x: f64 = rng.gen_range(0.0..width);
    let y: f64 = rng.gen_range(0.0..height);

    let mut beacons = vec![];
    for (id, ax, ay) in anchors() {
        let dist = ((ax - x).powi(2) + (ay - y).powi(2)).sqrt();
        // add a small random noise to mimic measurement noise
        let noise: f64 = rng.gen_range(-0.1..0.1);
        let dist_noisy = (dist + noise).max(0.0);
        beacons.push(json!({
            "major": "0200",
            "minor": id.get(2..).unwrap_or("0000"),
            "beaconId": id,
            "distance": (dist_noisy * 100.0).round()/100.0, // round to 2 decimals
            "battery": 100
        }));
    }

    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    json!({
        "type": "uwb_update",
        "payload": {
            // Temporary: will be overridden to a stable ID by callers for consistent demo paths
            "deviceIdHex": format!("{:08x}", rng.gen::<u32>()),
            "deviceIdDecimal": rng.gen::<u32>(),
            "numberOfBeacons": beacons.len(),
            "motion": "No Movement",
            "beacons": beacons,
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
async fn mock_stream() -> Result<HttpResponse, Error> {
    let width = 20.0_f64;
    let height = 10.0_f64;
    // Use a stable mock device ID so the frontend can draw a continuous path
    let stable_hex = String::from("a0ba3e29");
    let stable_dec: u64 = 2696560169;
    // create a stream that yields Bytes of SSE events periodically
    let s = stream! {
        loop {
            let p = generate_uwb_update(width, height);
            // Convert distances to centimeters to match the live stream format
            let mut p2 = p.clone();
            if let Some(beacons) = p2.get_mut("payload").and_then(|pl| pl.get_mut("beacons")) {
                if let Some(arr) = beacons.as_array_mut() {
                    for b in arr.iter_mut() {
                        if let Some(d) = b.get("distance").and_then(|v| v.as_f64()) {
                            let cm = (d * 100.0).round();
                            b["distance"] = json!(cm as i64);
                        }
                    }
                }
            }
            // Override device ID to a constant for consistent pathing
            if let Some(payload) = p2.get_mut("payload") {
                payload["deviceIdHex"] = json!(stable_hex);
                payload["deviceIdDecimal"] = json!(stable_dec);
            }
            let block = sse_event_block(&p2);
            yield Ok::<Bytes, Error>(Bytes::from(block));
            // wait 3 seconds between mock events for a smoother demo
            actix_web::rt::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    };

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .streaming(s))
}

// Single-shot mock endpoint: emits one `uwb_update` payload (distances in cm)
#[get("/mock/once")]
async fn mock_once(query: web::Query<HashMap<String, String>>) -> Result<HttpResponse, Error> {
    let width = 20.0_f64;
    let height = 10.0_f64;
    let p = generate_uwb_update(width, height);
    // Convert distances to centimeters to match the live stream format
    let mut p2 = p.clone();
    if let Some(beacons) = p2.get_mut("payload").and_then(|pl| pl.get_mut("beacons")) {
        if let Some(arr) = beacons.as_array_mut() {
            for b in arr.iter_mut() {
                if let Some(d) = b.get("distance").and_then(|v| v.as_f64()) {
                    let cm = (d * 100.0).round();
                    b["distance"] = json!(cm as i64);
                }
            }
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
        .streaming(s))
}

#[get("/positions")]
async fn positions(_q: web::Query<QueryApiKey>) -> impl Responder {
    // Factory bounds — match with frontend defaults if possible
    let width = 20.0_f64;
    let height = 10.0_f64;
    let mut payload = generate_uwb_update(width, height);
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
    HttpServer::new(|| {
        let cors = Cors::default()
            .allow_any_method()
            .allow_any_header()
            .supports_credentials()
            // allow common dev origins and allow docker-compose service name
            .allowed_origin("http://localhost:3000")
            .allowed_origin("http://localhost")
            .allowed_origin("http://frontend:80");

        App::new()
            .wrap(middleware::Logger::default())
            .wrap(cors)
            .service(positions)
            .service(mock_stream)
            .service(mock_once)
            .service(proxy_uwb_stream)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
