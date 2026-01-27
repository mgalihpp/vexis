use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordReset {
    pub user_id: ObjectId,
    pub email: String,
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshToken {
    pub user_id: ObjectId,
    pub token: String,
    pub expires_at: DateTime<Utc>,
}
