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
    /// Index a ticket into knowledge base
    #[command(name = "knowledge:index")]
    KnowledgeIndex(commands::knowledge::KnowledgeIndexArgs),

    /// Search knowledge base with FTS
    #[command(name = "knowledge:search")]
    KnowledgeSearch(commands::knowledge::KnowledgeSearchArgs),

    /// Recommend related tickets via TF-IDF
    #[command(name = "recommend")]
    Recommend(commands::knowledge::RecommendArgs),

    /// System health check (SQLite + Redis connectivity)
    #[command(name = "system:doctor")]
    SystemDoctor,

    /// Claim a ticket for execution
    #[command(name = "task:claim")]
    TaskClaim(commands::task_claim::TaskClaimArgs),

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

    /// Start HTTP API server
    #[command(name = "server")]
    Server(commands::server::ServerArgs),

    /// Register a Slaver instance
    #[command(name = "slaver:register")]
    SlaverRegister(commands::slaver_register::SlaverRegisterArgs),

    /// Poll mailbox for messages (long-running)
    #[command(name = "slaver:poll")]
    SlaverPoll(commands::slaver_poll::SlaverPollArgs),

    /// Run CI gate checks for a PR
    #[command(name = "gate:review")]
    GateReview(commands::gate_review::GateReviewArgs),

    /// Push branch and create GitHub PR
    #[command(name = "submit:pr")]
    SubmitPr(commands::submit_pr::SubmitPrArgs),

    /// Resume a ticket from checkpoint
    #[command(name = "task:resume")]
    TaskResume(commands::task_resume::TaskResumeArgs),

    /// Show all agent team status
    #[command(name = "team:status")]
    TeamStatus(commands::team_status::TeamStatusArgs),

    /// Show ticket progress and critical path
    #[command(name = "task:progress")]
    TaskProgress(commands::task_progress::TaskProgressArgs),

    /// Hand off a ticket to another slaver
    #[command(name = "task:handoff")]
    TaskHandoff(commands::handoff::HandoffArgs),

    /// Master heartbeat: scan ready tickets and assign to idle slavers (long-running)
    #[command(name = "master:heartbeat")]
    MasterHeartbeat(commands::master_heartbeat::MasterHeartbeatArgs),

    /// Master poll: read master mailbox and process slaver reports (long-running)
    #[command(name = "master:poll")]
    MasterPoll(commands::master_poll::MasterPollArgs),

    /// Run pending DB schema migrations
    #[command(name = "db:migrate")]
    DbMigrate(commands::db_commands::DbMigrateArgs),

    /// Show applied DB migration status
    #[command(name = "db:status")]
    DbStatus(commands::db_commands::DbStatusArgs),

    /// Show version info as JSON
    #[command(name = "version")]
    Version,

    /// Show project repository and ticket status
    #[command(name = "project:status")]
    ProjectStatus(commands::project_status::ProjectStatusArgs),

    /// Show workflow definition and step budgets
    #[command(name = "workflow:status")]
    WorkflowStatus(commands::workflow_status::WorkflowStatusArgs),
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
        Commands::KnowledgeIndex(args) => commands::knowledge::run_index(args).await,
        Commands::KnowledgeSearch(args) => commands::knowledge::run_search(args).await,
        Commands::Recommend(args) => commands::knowledge::run_recommend(args).await,
        Commands::SystemDoctor => commands::system_doctor::run().await,
        Commands::TaskClaim(args) => commands::task_claim::run(args).await,
        Commands::TaskComplete { ticket_id, no_trailer } => {
            commands::task_complete::run(ticket_id, no_trailer).await
        }
        Commands::TaskCreate(args) => commands::task_create::run(args).await,
        Commands::Server(args) => commands::server::run(args).await,
        Commands::SlaverRegister(args) => commands::slaver_register::run(args).await,
        Commands::SlaverPoll(args) => commands::slaver_poll::run(args).await,
        Commands::GateReview(args) => commands::gate_review::run(args).await,
        Commands::SubmitPr(args) => commands::submit_pr::run(args).await,
        Commands::TaskResume(args) => commands::task_resume::run(args).await,
        Commands::TeamStatus(args) => commands::team_status::run(args).await,
        Commands::TaskProgress(args) => commands::task_progress::run(args).await,
        Commands::TaskHandoff(args) => commands::handoff::run(args).await,
        Commands::MasterHeartbeat(args) => commands::master_heartbeat::run(args).await,
        Commands::MasterPoll(args) => commands::master_poll::run(args).await,
        Commands::DbMigrate(args) => commands::db_commands::run_migrate(args).await,
        Commands::DbStatus(args) => commands::db_commands::run_status(args).await,
        Commands::Version => {
            let info = serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
            });
            println!("{}", serde_json::to_string_pretty(&info).unwrap());
            Ok(())
        }
        Commands::ProjectStatus(args) => commands::project_status::run(args).await,
        Commands::WorkflowStatus(args) => commands::workflow_status::run(args).await,
    }
}
