use crate::handlers::attendance;
use crate::middleware::auth::require_auth;
use crate::AppState;
use axum::Router;
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/check", axum::routing::post(attendance::check_in_out))
        .layer(axum::middleware::from_fn(require_auth))
}
