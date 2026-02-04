use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use crate::AppState;
use crate::models::attendance::Attendance;
use mongodb::bson::{doc, oid::ObjectId, DateTime};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use futures::stream::TryStreamExt;
use chrono::{TimeZone, Utc, FixedOffset};

#[derive(Deserialize)]
pub struct AttendanceQuery {
    pub page: Option<u64>,
    pub limit: Option<u64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Serialize)]
pub struct AdminAttendanceResponse {
    pub data: Vec<AttendanceAdminDetail>,
    pub total: u64,
    pub page: u64,
    pub limit: u64,
}

#[derive(Serialize, Deserialize)]
pub struct AttendanceAdminDetail {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub user_id: ObjectId,
    pub user_name: String,
    pub user_email: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub r#type: String,
    pub latitude: f64,
    pub longitude: f64,
}

pub async fn list_attendance(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AttendanceQuery>,
) -> impl IntoResponse {
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(10);
    let skip = (page - 1) * limit;

    let filter = build_attendance_filter(&query);

    let pipeline = vec![
        doc! { "$match": filter.clone() },
        doc! {
            "$lookup": {
                "from": "users",
                "localField": "user_id",
                "foreignField": "_id",
                "as": "user_info"
            }
        },
        doc! { "$unwind": "$user_info" },
        doc! {
            "$project": {
                "_id": 1,
                "user_id": 1,
                "user_name": "$user_info.name",
                "user_email": "$user_info.email",
                "timestamp": 1,
                "type": 1,
                "latitude": { "$arrayElemAt": ["$location.coordinates", 1] },
                "longitude": { "$arrayElemAt": ["$location.coordinates", 0] }
            }
        },
        doc! { "$sort": { "timestamp": -1 } },
        doc! { "$skip": skip as i64 },
        doc! { "$limit": limit as i64 },
    ];

    let attendance_col = state.db.collection::<Attendance>("attendances");
    
    let mut cursor = match attendance_col.aggregate(pipeline).await {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    let mut data = Vec::new();
    while let Ok(Some(doc)) = cursor.try_next().await {
        match mongodb::bson::from_document::<AttendanceAdminDetail>(doc) {
            Ok(detail) => data.push(detail),
            Err(e) => {
                eprintln!("Error decoding attendance detail: {}", e);
                continue;
            },
        }
    }

    let total = match attendance_col.count_documents(filter).await {
        Ok(t) => t,
        Err(_) => 0,
    };

    Json(AdminAttendanceResponse {
        data,
        total,
        page,
        limit,
    }).into_response()
}

pub async fn export_attendance_csv(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AttendanceQuery>,
) -> impl IntoResponse {
    let filter = build_attendance_filter(&query);

    let pipeline = vec![
        doc! { "$match": filter },
        doc! {
            "$lookup": {
                "from": "users",
                "localField": "user_id",
                "foreignField": "_id",
                "as": "user_info"
            }
        },
        doc! { "$unwind": "$user_info" },
        doc! {
            "$project": {
                "_id": 1,
                "user_id": 1,
                "user_name": "$user_info.name",
                "user_email": "$user_info.email",
                "timestamp": 1,
                "type": 1,
                "latitude": { "$arrayElemAt": ["$location.coordinates", 1] },
                "longitude": { "$arrayElemAt": ["$location.coordinates", 0] }
            }
        },
        doc! { "$sort": { "timestamp": -1 } },
    ];

    let attendance_col = state.db.collection::<Attendance>("attendances");
    let mut cursor = match attendance_col.aggregate(pipeline).await {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response(),
    };

    let mut wtr = csv::Writer::from_writer(vec![]);
    
    // Header
    if let Err(_) = wtr.write_record(&["Date", "Time", "User Name", "User Email", "Type", "Location Lat", "Location Lng"]) {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate CSV").into_response();
    }

    // WIB offset (UTC+7)
    let wib = FixedOffset::east_opt(7 * 3600).unwrap();

    while let Ok(Some(doc)) = cursor.try_next().await {
        if let Ok(detail) = mongodb::bson::from_document::<AttendanceAdminDetail>(doc) {
            let local_dt = detail.timestamp.with_timezone(&wib);
            let _ = wtr.write_record(&[
                local_dt.format("%Y-%m-%d").to_string(),
                local_dt.format("%H:%M:%S").to_string(),
                detail.user_name,
                detail.user_email,
                detail.r#type,
                detail.latitude.to_string(),
                detail.longitude.to_string(),
            ]);
        }
    }

    let csv_data = match wtr.into_inner() {
        Ok(data) => data,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate CSV").into_response(),
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"attendance.csv\"")
        .body(axum::body::Body::from(csv_data))
        .unwrap()
        .into_response()
}

fn build_attendance_filter(query: &AttendanceQuery) -> mongodb::bson::Document {
    let mut filter = doc! {};

    if let Some(user_id_str) = &query.user_id {
        if let Ok(oid) = ObjectId::parse_str(user_id_str) {
            filter.insert("user_id", oid);
        }
    }

    if query.start_date.is_some() || query.end_date.is_some() {
        let mut time_filter = doc! {};
        
        if let Some(start) = &query.start_date {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(start) {
                time_filter.insert("$gte", DateTime::from_millis(dt.timestamp_millis()));
            } else if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(start, "%Y-%m-%d") {
                 let dt = Utc.from_local_datetime(&naive_date.and_hms_opt(0, 0, 0).unwrap()).unwrap();
                 time_filter.insert("$gte", DateTime::from_millis(dt.timestamp_millis()));
            }
        }
        
        if let Some(end) = &query.end_date {
             if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(end) {
                time_filter.insert("$lte", DateTime::from_millis(dt.timestamp_millis()));
            } else if let Ok(naive_date) = chrono::NaiveDate::parse_from_str(end, "%Y-%m-%d") {
                 let dt = Utc.from_local_datetime(&naive_date.and_hms_opt(23, 59, 59).unwrap()).unwrap();
                 time_filter.insert("$lte", DateTime::from_millis(dt.timestamp_millis()));
            }
        }
        
        if !time_filter.is_empty() {
            filter.insert("timestamp", time_filter);
        }
    }

    filter
}
