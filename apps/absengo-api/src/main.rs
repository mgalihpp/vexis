mod config;
mod models;
mod handlers;
mod routes;
mod utils;

use axum::{routing::get, Router};
use std::net::SocketAddr;
use dotenvy::dotenv;
use mongodb::Database;
use std::sync::Arc;

pub struct AppState {
    pub db: Database,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    
    let db = config::db::init_db().await?;
    let state = Arc::new(AppState { db });

    let app = Router::new()
        .nest("/api/auth", routes::auth::auth_routes())
        .route("/", get(|| async { "Hello, AbsenGo API with MongoDB!" }))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse()?;
    
    println!("listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}
