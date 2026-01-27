use mongodb::{Client, Database};
use std::env;

pub async fn init_db() -> Result<Database, mongodb::error::Error> {
    let uri = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db_name = env::var("DB_NAME").expect("DB_NAME must be set");
    
    let client = Client::with_uri_str(uri).await?;
    Ok(client.database(&db_name))
}
