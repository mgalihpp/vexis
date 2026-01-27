use axum::{
    extract::{State, Extension, Multipart},
    Json,
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::user::{User, OfficeLocation};
use crate::utils::jwt::Claims;
use serde::{Deserialize, Serialize};
use serde_json::json;
use mongodb::bson::{doc, oid::ObjectId};
use mongodb::options::FindOneAndUpdateOptions;
use tokio::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Serialize)]
pub struct UserProfileResponse {
    pub id: String,
    pub name: String,
    pub email: String,
    pub identifier: String,
    pub role: String,
    pub photo_url: Option<String>,
    pub has_face_landmarks: bool,
    pub office_location: crate::models::user::OfficeLocation,
}

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub identifier: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateLocationRequest {
    pub lat: f64,
    pub long: f64,
}

#[derive(Deserialize)]
pub struct RegisterFaceRequest {
    pub landmarks: Vec<f32>,
}

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    let user = match users_col.find_one(doc! { "_id": user_id }).await {
        Ok(Some(u)) => u,
        _ => return (StatusCode::NOT_FOUND, "User not found").into_response(),
    };

    Json(UserProfileResponse {
        id: user.id.unwrap().to_hex(),
        name: user.name,
        email: user.email,
        identifier: user.identifier,
        role: user.role,
        photo_url: user.photo_url,
        has_face_landmarks: !user.face_landmarks.is_empty(),
        office_location: user.office_location,
    }).into_response()
}

pub async fn update_me(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<UpdateProfileRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    let mut update_doc = doc! {};
    if let Some(name) = payload.name {
        update_doc.insert("name", name);
    }
    if let Some(identifier) = payload.identifier {
        update_doc.insert("identifier", identifier);
    }

    if update_doc.is_empty() {
        return (StatusCode::BAD_REQUEST, "No changes provided").into_response();
    }

    match users_col
        .find_one_and_update(
            doc! { "_id": user_id },
            doc! { "$set": update_doc },
        )
        .return_document(mongodb::options::ReturnDocument::After)
        .await
    {
        Ok(Some(user)) => Json(UserProfileResponse {
            id: user.id.unwrap().to_hex(),
            name: user.name,
            email: user.email,
            identifier: user.identifier,
            role: user.role,
            photo_url: user.photo_url,
            has_face_landmarks: !user.face_landmarks.is_empty(),
            office_location: user.office_location,
        }).into_response(),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "Error updating profile").into_response(),
    }
}

pub async fn upload_photo(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    let mut photo_url = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "photo" {
            let data = match field.bytes().await {
                Ok(b) => b,
                Err(_) => return (StatusCode::BAD_REQUEST, "Error reading image data").into_response(),
            };

            // Create uploads directory if it doesn't exist
            let upload_dir = "uploads";
            if !Path::new(upload_dir).exists() {
                if let Err(_) = fs::create_dir(upload_dir).await {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Error creating upload directory").into_response();
                }
            }

            let file_name = format!("{}_{}.jpg", user_id.to_hex(), Uuid::new_v4());
            let file_path = format!("{}/{}", upload_dir, file_name);

            if let Err(_) = fs::write(&file_path, data).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Error saving image").into_response();
            }

            photo_url = Some(format!("/api/uploads/{}", file_name));
            break;
        }
    }

    let url = match photo_url {
        Some(u) => u,
        None => return (StatusCode::BAD_REQUEST, "No photo field found").into_response(),
    };

    match users_col
        .update_one(
            doc! { "_id": user_id },
            doc! { "$set": { "photo_url": &url } },
        )
        .await
    {
        Ok(_) => Json(json!({ "photo_url": url })).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Error updating user photo").into_response(),
    }
}

pub async fn update_location(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<UpdateLocationRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    let new_location = OfficeLocation {
        r#type: "Point".to_string(),
        coordinates: vec![payload.long, payload.lat],
    };

    match users_col
        .update_one(
            doc! { "_id": user_id },
            doc! { "$set": { "office_location": mongodb::bson::to_bson(&new_location).unwrap() } },
        )
        .await
    {
        Ok(_) => Json(json!({ "status": "success" })).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Error updating location").into_response(),
    }
}

pub async fn register_face(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<RegisterFaceRequest>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    // 478 landmarks * 3 coordinates (x, y, z) = 1434
    if payload.landmarks.len() != 1434 {
        return (StatusCode::BAD_REQUEST, "Invalid landmarks data").into_response();
    }

    match users_col
        .update_one(
            doc! { "_id": user_id },
            doc! { "$set": { "face_landmarks": payload.landmarks } },
        )
        .await
    {
        Ok(_) => Json(json!({ "status": "success" })).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Error registering face").into_response(),
    }
}
