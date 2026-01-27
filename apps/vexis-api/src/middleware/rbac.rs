use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use crate::utils::jwt::Claims;

pub async fn require_admin(
    req: Request,
    next: Next,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let claims = req.extensions().get::<Claims>().ok_or((
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Unauthorized" })),
    ))?;

    if claims.role != "admin" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Admin access required" })),
        ));
    }

    Ok(next.run(req).await)
}
