use axum::{
    extract::{State, Extension},
    Json,
    http::StatusCode,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::attendance::Attendance;
use crate::utils::jwt::Claims;
use serde::Serialize;
use mongodb::bson::{doc, oid::ObjectId, DateTime as BsonDateTime};
use chrono::Utc;

#[derive(Serialize)]
pub struct DashboardStatsResponse {
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub recent_logs: Vec<AttendanceLog>,
}

#[derive(Serialize)]
pub struct AttendanceLog {
    pub date: String,
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub status: String,
}

pub async fn get_dashboard_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
) -> impl IntoResponse {
    let attendance_col = state.db.collection::<Attendance>("attendances");
    let user_id = match ObjectId::parse_str(&claims.sub) {
        Ok(oid) => oid,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid user ID").into_response(),
    };

    // Get today's start (00:00:00) and end (23:59:59)
    let now = Utc::now();
    let today_start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("Valid time")
        .and_utc();
    let today_end = now
        .date_naive()
        .and_hms_opt(23, 59, 59)
        .expect("Valid time")
        .and_utc();

    // For now, return empty data (no attendances in DB yet)
    // This will be populated when Feature 1 (check-in/out) is implemented
    
    Json(DashboardStatsResponse {
        check_in: None,
        check_out: None,
        recent_logs: vec![],
    }).into_response()
}
