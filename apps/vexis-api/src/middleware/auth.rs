use axum::{
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use crate::utils::jwt;

pub async fn require_auth(
    mut req: Request,
    next: Next,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            &header[7..]
        }
        _ => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Missing or invalid authorization token" })),
            ));
        }
    };

    match jwt::decode_jwt(token) {
        Ok(claims) => {
            req.extensions_mut().insert(claims);
            Ok(next.run(req).await)
        }
        Err(_) => Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid or expired token" })),
        )),
    }
}
