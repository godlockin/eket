/// server — start axum HTTP API server
use anyhow::Result;
use std::path::PathBuf;

#[derive(clap::Args)]
pub struct ServerArgs {
    /// Port to listen on
    #[arg(long, env = "EKET_SERVER_PORT", default_value = "9877")]
    pub port: u16,

    /// Path to SQLite database
    #[arg(long, env = "EKET_DB_PATH")]
    pub db_path: Option<PathBuf>,

    /// Directory containing TASK-*.md ticket files
    #[arg(long, env = "EKET_TICKETS_DIR")]
    pub tickets_dir: Option<PathBuf>,
}

pub async fn run(args: ServerArgs) -> Result<()> {
    let db_path = args.db_path.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".eket")
            .join("eket.db")
    });

    let tickets_dir = args
        .tickets_dir
        .unwrap_or_else(|| PathBuf::from("jira/tickets"));

    eket_server::start(args.port, db_path, tickets_dir).await
}
