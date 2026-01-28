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
use mongodb::bson::{doc, oid::ObjectId};
use chrono::{FixedOffset, Utc};
use futures::stream::TryStreamExt;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct DashboardStatsResponse {
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub recent_logs: Vec<AttendanceLog>,
}

#[derive(Serialize, Clone)]
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

    // WIB Timezone (UTC+7)
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    let now_utc = Utc::now();
    
    // Get today's date in WIB for comparison
    let now_wib = now_utc.with_timezone(&wib);
    let today_date_str = now_wib.format("%Y-%m-%d").to_string();

    // Get Recent Logs (fetch all attendance for this user, sorted by timestamp desc)
    let recent_filter = doc! { "user_id": user_id };
    let mut recent_cursor = match attendance_col
        .find(recent_filter)
        .sort(doc! { "timestamp": -1 })
        .limit(50) // Increased limit to ensure we get enough data
        .await 
    {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    let mut daily_logs: HashMap<String, AttendanceLog> = HashMap::new();

    while let Ok(Some(att)) = recent_cursor.try_next().await {
        // Convert to WIB
        let local_time = att.timestamp.with_timezone(&wib);
        let date_str = local_time.format("%Y-%m-%d").to_string();
        let time_str = local_time.format("%H:%M").to_string();
        
        let entry = daily_logs.entry(date_str.clone()).or_insert(AttendanceLog {
            date: date_str,
            check_in: None,
            check_out: None,
            status: "Hadir".to_string(),
        });

        if att.r#type == "In" {
            // For check_in, we want the EARLIEST time of the day
            match &entry.check_in {
                None => entry.check_in = Some(time_str),
                Some(existing) if &time_str < existing => entry.check_in = Some(time_str),
                _ => {}
            }
        } else if att.r#type == "Out" {
            // For check_out, we want the LATEST time of the day
            match &entry.check_out {
                None => entry.check_out = Some(time_str),
                Some(existing) if &time_str > existing => entry.check_out = Some(time_str),
                _ => {}
            }
        }
    }

    // Get today's check_in and check_out from daily_logs
    let (check_in_time, check_out_time) = daily_logs
        .get(&today_date_str)
        .map(|log| (log.check_in.clone(), log.check_out.clone()))
        .unwrap_or((None, None));

    let mut recent_logs: Vec<AttendanceLog> = daily_logs.into_values().collect();
    recent_logs.sort_by(|a, b| b.date.cmp(&a.date));
    recent_logs.truncate(5);

    Json(DashboardStatsResponse {
        check_in: check_in_time,
        check_out: check_out_time,
        recent_logs,
    }).into_response()
}
