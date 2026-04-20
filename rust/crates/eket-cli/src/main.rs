use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::{fmt, EnvFilter};

mod commands;

#[derive(Parser)]
#[command(
    name = "eket",
    version = env!("CARGO_PKG_VERSION"),
    about = "EKET — AI Agent Collaboration Framework",
    long_about = None,
)]
struct Cli {
    /// Log level (trace, debug, info, warn, error)
    #[arg(long, env = "EKET_LOG_LEVEL", default_value = "info")]
    log_level: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// System health check (SQLite + Redis connectivity)
    #[command(name = "system:doctor")]
    SystemDoctor,

    /// Claim a ticket for execution
    #[command(name = "task:claim")]
    TaskClaim {
        /// Optional ticket ID to claim directly
        ticket_id: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Init tracing
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&cli.log_level)),
        )
        .with_target(false)
        .init();

    match cli.command {
        Commands::SystemDoctor => commands::system_doctor::run().await,
        Commands::TaskClaim { ticket_id } => commands::task_claim::run(ticket_id).await,
    }
}
