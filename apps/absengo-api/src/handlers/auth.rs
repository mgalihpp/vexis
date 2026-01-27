use axum::{
    extract::State,
    Json,
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::user::{User, OfficeLocation};
use serde::Deserialize;
use bcrypt::{hash, DEFAULT_COST};
use mongodb::bson::doc;

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
    pub role: String,
    pub lat: f64,
    pub long: f64,
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");

    // Check if user already exists
    let filter = doc! { "email": &payload.email };
    if let Ok(Some(_)) = users_col.find_one(filter).await {
        return (StatusCode::BAD_REQUEST, "User already exists").into_response();
    }

    // Hash password
    let password_hash = match hash(payload.password, DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Error hashing password").into_response(),
    };

    let new_user = User {
        id: None,
        name: payload.name,
        email: payload.email,
        password_hash,
        role: payload.role,
        office_location: OfficeLocation {
            r#type: "Point".to_string(),
            coordinates: vec![payload.long, payload.lat],
        },
        face_embedding: vec![], // Will be updated during face registration
        photo_url: None,
    };

    match users_col.insert_one(new_user).await {
        Ok(_) => (StatusCode::CREATED, "User registered successfully").into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Error saving user").into_response(),
    }
}
