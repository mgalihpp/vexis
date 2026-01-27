use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Attendance {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub user_id: ObjectId,
    pub timestamp: DateTime<Utc>,
    pub r#type: String, // "In" | "Out"
    pub location: GeoPoint,
    pub face_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeoPoint {
    pub r#type: String,        // "Point"
    pub coordinates: Vec<f64>, // [long, lat]
}
