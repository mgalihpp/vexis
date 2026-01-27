use crate::handlers::auth::{forgot_password, login, register, reset_password};
use crate::AppState;
use axum::{routing::post, Router};
use std::sync::Arc;

pub fn auth_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/forgot-password", post(forgot_password))
        .route("/reset-password", post(reset_password))
}
