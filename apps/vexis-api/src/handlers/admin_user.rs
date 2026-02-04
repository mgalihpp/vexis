use axum::{
    extract::{State, Query, Path, Extension},
    Json,
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::user::User;
use crate::utils::jwt::Claims;
use serde::{Deserialize, Serialize};
use mongodb::bson::{doc, oid::ObjectId};
use futures::stream::TryStreamExt;
use crate::handlers::user::UserProfileResponse;

#[derive(Deserialize)]
pub struct ListUsersQuery {
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Serialize)]
pub struct UserListResponse {
    pub users: Vec<UserProfileResponse>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
}

pub async fn list_users(
    State(state): State<Arc<AppState>>,
    Extension(_claims): Extension<Claims>,
    Query(query): Query<ListUsersQuery>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(10);
    let skip = (page - 1) * limit;

    let total = match users_col.count_documents(doc! {}).await {
        Ok(count) => count,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    let mut cursor = match users_col
        .find(doc! {})
        .skip(skip)
        .limit(limit as i64)
        .await
    {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    let mut users = Vec::new();
    while let Ok(Some(user)) = cursor.try_next().await {
        users.push(UserProfileResponse {
            id: user.id.expect("User should have an ID").to_hex(),
            name: user.name,
            email: user.email,
            identifier: user.identifier,
            role: user.role,
            photo_url: user.photo_url,
            has_face_landmarks: !user.face_landmarks.is_empty(),
            office_location: user.office_location,
        });
    }

    Json(UserListResponse {
        users,
        total,
        page,
        limit,
    }).into_response()
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Extension(_claims): Extension<Claims>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let users_col = state.db.collection::<User>("users");
    let user_id = match ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    match users_col.delete_one(doc! { "_id": user_id }).await {
        Ok(result) if result.deleted_count > 0 => {
            (StatusCode::OK, "User deleted successfully").into_response()
        }
        Ok(_) => (StatusCode::NOT_FOUND, "User not found").into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    }
}
