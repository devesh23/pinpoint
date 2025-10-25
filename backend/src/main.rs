// Backend server: provides a mock /positions endpoint for demo and testing.
// This file exposes a GET /positions endpoint which returns a generated
// `uwb_update`-style payload with per-router distances computed from a
// randomly chosen device position. This lets the frontend trilateration
// logic be exercised without external hardware.

use actix_web::{get, middleware, web, App, HttpServer, HttpResponse, Responder};
use actix_cors::Cors;
use serde::Deserialize;
use serde_json::json;
use rand::prelude::*;
use std::time::{SystemTime, UNIX_EPOCH};

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

#[get("/positions")]
async fn positions(_q: web::Query<QueryApiKey>) -> impl Responder {
    // Factory bounds — match with frontend defaults if possible
    let width = 20.0_f64;
    let height = 10.0_f64;
    let payload = generate_uwb_update(width, height);
    HttpResponse::Ok().json(payload)
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
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
