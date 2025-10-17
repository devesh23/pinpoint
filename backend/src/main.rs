use actix_web::{get, middleware, web, App, HttpServer, HttpResponse, Responder};
use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
struct QueryApiKey {
    // optional api key in query for demo
    api_key: Option<String>
}

#[get("/positions")]
async fn positions(q: web::Query<QueryApiKey>) -> impl Responder {
    // For demo, we just read a static file from disk (mock_positions.json)
    let content = fs::read_to_string("./mock_positions.json").unwrap_or_else(|_| "{}".into());
    HttpResponse::Ok().content_type("application/json").body(content)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    HttpServer::new(|| {
        App::new()
            .wrap(middleware::Logger::default())
            .service(positions)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
