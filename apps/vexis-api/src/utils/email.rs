use reqwest::Client;
use serde::Serialize;
use std::env;

#[derive(Serialize)]
struct ResendEmail {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

pub async fn send_reset_email(to: &str, token: &str) -> Result<(), reqwest::Error> {
    let api_key = env::var("RESEND_API_KEY").unwrap_or_else(|_| "".to_string());
    let client = Client::new();
    
    // In production, use a verified domain. For testing with Resend default:
    let from = "Vexis <onboarding@resend.dev>".to_string();
    
    let reset_link = format!("http://localhost:5173/reset-password?token={}", token);
    
    let email = ResendEmail {
        from,
        to: vec![to.to_string()],
        subject: "Reset Your Password - Vexis".to_string(),
        html: format!(
            "<h1>Password Reset Request</h1>
             <p>You requested a password reset for your Vexis account.</p>
             <p>Click the link below to reset your password:</p>
             <a href='{}'>Reset Password</a>
             <p>If you didn't request this, please ignore this email.</p>",
            reset_link
        ),
    };

    client
        .post("https://api.resend.com/emails")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&email)
        .send()
        .await?;

    Ok(())
}
