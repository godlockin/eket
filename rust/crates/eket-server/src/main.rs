use anyhow::Result;
use eket_core::config::EketConfig;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<()> {
    let log_format = std::env::var("EKET_LOG_FORMAT").unwrap_or_default();
    if log_format == "json" {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
            )
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
            )
            .with_target(false)
            .init();
    }

    let cfg = EketConfig::load().unwrap_or_default();

    let port: u16 = std::env::var("EKET_SERVER_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(cfg.api_port);

    let db_path = PathBuf::from(&cfg.sqlite.path);

    let tickets_dir = cfg.tickets_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("jira/tickets"));

    eket_server::start(port, db_path, tickets_dir).await
}
