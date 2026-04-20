use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::{fmt, EnvFilter};

mod commands;

#[derive(Parser)]
#[command(
    name = "eket",
    version = env!("CARGO_PKG_VERSION"),
    about = "EKET — AI Agent Collaboration Framework",
)]
struct Cli {
    #[arg(long, env = "EKET_LOG_LEVEL", default_value = "warn")]
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
        /// Specific ticket ID to claim (e.g. TASK-042). Omit to auto-pick highest priority.
        ticket_id: Option<String>,
    },

    /// Mark a ticket as complete
    #[command(name = "task:complete")]
    TaskComplete {
        /// Ticket ID to complete (e.g. TASK-042)
        ticket_id: String,

        /// Skip appending git commit trailer
        #[arg(long)]
        no_trailer: bool,
    },

    /// Create a new ticket
    #[command(name = "task:create")]
    TaskCreate(commands::task_create::TaskCreateArgs),
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

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
        Commands::TaskComplete { ticket_id, no_trailer } => {
            commands::task_complete::run(ticket_id, no_trailer).await
        }
        Commands::TaskCreate(args) => commands::task_create::run(args).await,
    }
}
