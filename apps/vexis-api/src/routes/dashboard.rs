use crate::handlers::dashboard;
use crate::middleware::auth::require_auth;
use crate::AppState;
use axum::Router;
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/stats", axum::routing::get(dashboard::get_dashboard_stats))
        .layer(axum::middleware::from_fn(require_auth))
}
