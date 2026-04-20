use anyhow::Result;
use std::env;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .with_target(false)
        .init();

    let port: u16 = env::var("EKET_SERVER_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9877);

    let db_path = env::var("EKET_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".eket")
                .join("eket.db")
        });

    let tickets_dir = env::var("EKET_TICKETS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("jira/tickets"));

    eket_server::start(port, db_path, tickets_dir).await
}
