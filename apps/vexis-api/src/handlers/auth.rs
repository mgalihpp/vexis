use axum::{
    extract::State,
    Json,
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::user::{User, OfficeLocation};
use crate::models::auth::PasswordReset;
use crate::utils::jwt::create_jwt;
use crate::utils::email::send_reset_email;
use serde::{Deserialize, Serialize};
use bcrypt::{hash, verify, DEFAULT_COST};
use mongodb::bson::doc;
use chrono::{Utc, Duration};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub identifier: String,
    pub password: String,
    pub role: String,
    pub lat: f64,
    pub long: f64,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email_or_id: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    pub name: String,
    pub email: String,
    pub identifier: String,
    pub role: String,
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");

    // Check if user already exists
    let filter = doc! { 
        "$or": [
            { "email": &payload.email },
            { "identifier": &payload.identifier }
        ]
    };
    if let Ok(Some(_)) = users_col.find_one(filter).await {
        return (StatusCode::BAD_REQUEST, "User with this email or ID already exists").into_response();
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
        identifier: payload.identifier,
        password_hash,
        role: payload.role,
        office_location: OfficeLocation {
            r#type: "Point".to_string(),
            coordinates: vec![payload.long, payload.lat],
        },
        face_embedding: vec![],
        photo_url: None,
    };

    match users_col.insert_one(new_user).await {
        Ok(_) => (StatusCode::CREATED, "User registered successfully").into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Error saving user").into_response(),
    }
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");

    let filter = doc! {
        "$or": [
            { "email": &payload.email_or_id },
            { "identifier": &payload.email_or_id }
        ]
    };

    let user = match users_col.find_one(filter).await {
        Ok(Some(u)) => u,
        Ok(None) => return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    if !verify(payload.password, &user.password_hash).unwrap_or(false) {
        return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
    }

    let token = match create_jwt(&user.id.unwrap().to_hex(), &user.role) {
        Ok(t) => t,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Token generation error").into_response(),
    };

    Json(AuthResponse {
        token,
        user: UserResponse {
            id: user.id.unwrap().to_hex(),
            name: user.name,
            email: user.email,
            identifier: user.identifier,
            role: user.role,
        },
    }).into_response()
}

pub async fn forgot_password(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let resets_col = state.db.collection::<PasswordReset>("password_resets");

    let user = match users_col.find_one(doc! { "email": &payload.email }).await {
        Ok(Some(u)) => u,
        _ => return (StatusCode::OK, "If that email exists, a reset link has been sent.").into_response(),
    };

    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + Duration::hours(1);

    let reset_doc = PasswordReset {
        user_id: user.id.unwrap(),
        email: payload.email.clone(),
        token: token.clone(),
        expires_at,
    };

    // Clean up old tokens for this user
    let _ = resets_col.delete_many(doc! { "user_id": user.id.unwrap() }).await;

    if let Err(_) = resets_col.insert_one(reset_doc).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Error saving reset token").into_response();
    }

    match send_reset_email(&payload.email, &token).await {
        Ok(_) => (StatusCode::OK, "Reset link sent").into_response(),
        Err(e) => {
            eprintln!("Email error: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Error sending email").into_response()
        }
    }
}

pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ResetPasswordRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let resets_col = state.db.collection::<PasswordReset>("password_resets");

    let reset = match resets_col.find_one(doc! { "token": &payload.token }).await {
        Ok(Some(r)) => r,
        _ => return (StatusCode::BAD_REQUEST, "Invalid or expired token").into_response(),
    };

    if reset.expires_at < Utc::now() {
        let _ = resets_col.delete_one(doc! { "token": &payload.token }).await;
        return (StatusCode::BAD_REQUEST, "Token expired").into_response();
    }

    let password_hash = match hash(payload.password, DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Error hashing password").into_response(),
    };

    match users_col.update_one(
        doc! { "_id": reset.user_id },
        doc! { "$set": { "password_hash": password_hash } }
    ).await {
        Ok(_) => {
            let _ = resets_col.delete_one(doc! { "token": &payload.token }).await;
            (StatusCode::OK, "Password updated successfully").into_response()
        },
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Error updating password").into_response(),
    }
}
