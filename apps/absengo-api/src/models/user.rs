use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub email: String,
    pub password_hash: String,
    pub role: String, // "admin" | "karyawan"
    pub office_location: OfficeLocation,
    pub face_embedding: Vec<f64>,
    pub photo_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OfficeLocation {
    pub r#type: String,        // "Point"
    pub coordinates: Vec<f64>, // [long, lat]
}
