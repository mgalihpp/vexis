use crate::models::attendance::{Attendance, GeoPoint};
use crate::models::user::{OfficeLocation, User};
use crate::utils::face::compare_landmarks;
use crate::utils::geofence::is_within_geofence;
use crate::utils::jwt::Claims;
use crate::AppState;
use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use futures::stream::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
pub struct AttendanceRequest {
    pub latitude: f64,
    pub longitude: f64,
    pub landmarks: Vec<f32>,
}

#[derive(Serialize)]
pub struct AttendanceResponse {
    pub message: String,
    pub r#type: String,
    pub timestamp: String,
}

pub async fn check_in_out(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<AttendanceRequest>,
) -> impl IntoResponse {
    let user_col = state.db.collection::<User>("users");
    let attendance_col = state.db.collection::<Attendance>("attendances");

    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    // 1. Fetch User
    let user = match user_col.find_one(doc! { "_id": user_id }).await {
        Ok(Some(u)) => u,
        Ok(None) => return (StatusCode::NOT_FOUND, "User not found").into_response(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    // 2. Check if user has registered face
    if user.face_landmarks.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "Face not registered. Please update profile.",
        )
            .into_response();
    }

    // 3. Validate Geofence (Monas)
    let user_loc = OfficeLocation {
        r#type: "Point".to_string(),
        coordinates: vec![payload.longitude, payload.latitude],
    };

    // Monas Coordinates: -6.175392, 106.827153
    let monas_loc = OfficeLocation {
        r#type: "Point".to_string(),
        coordinates: vec![106.58955212564815, -6.288265750819264],
    };

    if !is_within_geofence(&user_loc, &monas_loc, 200.0) {
        return (
            StatusCode::BAD_REQUEST,
            "You are outside the office radius (Monas)",
        )
            .into_response();
    }

    // 4. Validate Face
    let similarity = compare_landmarks(&payload.landmarks, &user.face_landmarks);
    if similarity < 0.8 {
        return (
            StatusCode::BAD_REQUEST,
            "Face verification failed. Please try again.",
        )
            .into_response();
    }

    // 5. Determine In/Out
    let now_utc = Utc::now();

    // WIB Timezone (UTC+7)
    let wib = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
    let now_wib = now_utc.with_timezone(&wib);
    let today_date = now_wib.date_naive();

    // Query all today's logs for this user (same approach as dashboard.rs)
    let filter = doc! { "user_id": user_id };

    let mut cursor = match attendance_col
        .find(filter)
        .sort(doc! { "timestamp": -1 })
        .limit(10) // Get recent logs
        .await
    {
        Ok(c) => c,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response();
        }
    };

    // Find the most recent log from today (in WIB)
    let mut last_log: Option<Attendance> = None;
    while let Ok(Some(att)) = cursor.try_next().await {
        let att_wib = att.timestamp.with_timezone(&wib);
        let att_date = att_wib.date_naive();

        if att_date == today_date {
            last_log = Some(att);
            break; // We want the most recent one, and cursor is sorted desc
        }
    }

    let attendance_type = match &last_log {
        Some(log) => {
            if log.r#type == "In" {
                "Out".to_string()
            } else {
                "In".to_string()
            }
        }
        None => {
            println!("DEBUG: No log found, defaulting to In");
            "In".to_string()
        }
    };

    // 6. Insert Attendance
    let new_attendance = Attendance {
        id: None,
        user_id,
        timestamp: now_utc,
        r#type: attendance_type.clone(),
        location: GeoPoint {
            r#type: "Point".to_string(),
            coordinates: vec![payload.longitude, payload.latitude],
        },
        face_verified: true,
    };

    match attendance_col.insert_one(new_attendance).await {
        Ok(_) => (),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to save attendance",
            )
                .into_response()
        }
    }

    Json(AttendanceResponse {
        message: format!("Successfully checked {}", attendance_type),
        r#type: attendance_type,
        timestamp: now_utc.to_rfc3339(),
    })
    .into_response()
}
