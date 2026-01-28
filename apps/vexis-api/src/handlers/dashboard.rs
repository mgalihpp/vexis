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
    // Simplified calculation to avoid timezone conversion issues
    let now_utc = Utc::now();
    let wib_offset = chrono::Duration::hours(7);
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();
    
    // Calculate today's date in WIB
    let now_wib = now_utc + wib_offset;
    let today_date = now_wib.date_naive();
    
    // Start of day in WIB (00:00:00)
    let start_of_day_wib = today_date.and_hms_opt(0, 0, 0).expect("Invalid time");
    // End of day in WIB (23:59:59)
    let end_of_day_wib = today_date.and_hms_opt(23, 59, 59).expect("Invalid time");

    // Convert back to UTC for query by subtracting offset
    // 00:00 WIB = 17:00 UTC previous day
    let today_start_utc = (start_of_day_wib - wib_offset).and_utc();
    let today_end_utc = (end_of_day_wib - wib_offset).and_utc();

    let today_filter = doc! {
        "user_id": user_id,
        "timestamp": {
            "$gte": mongodb::bson::DateTime::from_millis(today_start_utc.timestamp_millis()),
            "$lte": mongodb::bson::DateTime::from_millis(today_end_utc.timestamp_millis()),
        }
    };
    
    let mut today_cursor = match attendance_col.find(today_filter).await {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    let mut check_in_time: Option<String> = None;
    let mut check_out_time: Option<String> = None;

    while let Ok(Some(att)) = today_cursor.try_next().await {
        // Convert to WIB
        let local_time = att.timestamp.with_timezone(&wib);
        let time_str = local_time.format("%H:%M").to_string();

        if att.r#type == "In" {
            if check_in_time.is_none() || time_str < check_in_time.as_ref().unwrap().clone() {
                check_in_time = Some(time_str);
            }
        } else if att.r#type == "Out" {
            if check_out_time.is_none() || time_str > check_out_time.as_ref().unwrap().clone() {
                check_out_time = Some(time_str);
            }
        }
    }

    // 2. Get Recent Logs
    let recent_filter = doc! { "user_id": user_id };
    let mut recent_cursor = match attendance_col
        .find(recent_filter)
        .sort(doc! { "timestamp": -1 })
        .limit(20)
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
             if entry.check_in.is_none() || time_str < entry.check_in.as_ref().unwrap().clone() {
                 entry.check_in = Some(time_str);
             }
        } else {
             if entry.check_out.is_none() || time_str > entry.check_out.as_ref().unwrap().clone() {
                 entry.check_out = Some(time_str);
             }
        }
    }

    let mut recent_logs: Vec<AttendanceLog> = daily_logs.into_values().collect();
    recent_logs.sort_by(|a, b| b.date.cmp(&a.date));
    recent_logs.truncate(5);

    Json(DashboardStatsResponse {
        check_in: check_in_time,
        check_out: check_out_time,
        recent_logs,
    }).into_response()
}
