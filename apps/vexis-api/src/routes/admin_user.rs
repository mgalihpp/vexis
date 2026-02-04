use crate::handlers::admin_user::{delete_user, list_users};
use crate::middleware::auth::require_auth;
use crate::middleware::rbac::require_admin;
use crate::AppState;
use axum::{middleware, routing::get, Router};

use std::sync::Arc;

pub fn admin_user_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_users))
        .route("/:id", axum::routing::delete(delete_user))
        .layer(middleware::from_fn(require_admin))
        .layer(middleware::from_fn(require_auth))
}
