use crate::handlers::admin_attendance::{export_attendance_csv, list_attendance};
use crate::middleware::auth::require_auth;
use crate::middleware::rbac::require_admin;
use crate::AppState;
use axum::{middleware, routing::get, Router};

use std::sync::Arc;

pub fn admin_attendance_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_attendance))
        .route("/export", get(export_attendance_csv))
        .layer(middleware::from_fn(require_admin))
        .layer(middleware::from_fn(require_auth))
}
