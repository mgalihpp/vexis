use crate::handlers::user::{get_me, register_face, update_location, update_me, upload_photo};
use crate::middleware::auth::require_auth;
use crate::AppState;
use axum::{
    middleware,
    routing::{get, post, put},
    Router,
};

use std::sync::Arc;

pub fn user_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/me", get(get_me).put(update_me))
        .route("/me/photo", post(upload_photo))
        .route("/me/location", put(update_location))
        .route("/me/face", post(register_face))
        .layer(middleware::from_fn(require_auth))
}
