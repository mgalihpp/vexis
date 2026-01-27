use crate::handlers::auth::register;
use crate::AppState;
use axum::{routing::post, Router};
use std::sync::Arc;

pub fn auth_routes() -> Router<Arc<AppState>> {
    Router::new().route("/register", post(register))
}
