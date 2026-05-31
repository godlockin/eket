#![allow(clippy::redundant_field_names)]
#![allow(clippy::empty_line_after_doc_comments)]
#![allow(clippy::bind_instead_of_map)]
#![allow(clippy::manual_strip)]
#![allow(clippy::manual_is_multiple_of)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::manual_pattern_char_comparison)]
#![allow(clippy::manual_unwrap_or_default)]
#![allow(clippy::redundant_closure)]
#![allow(clippy::collapsible_match)]
#![allow(clippy::map_clone)]
use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::{fmt, EnvFilter};

mod commands;
pub mod guardrail_middleware;
pub mod slaver_rules;

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

    /// Record test results for a ticket
    #[command(name = "task:test")]
    TaskTest(commands::task_test::TaskTestArgs),

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

    /// Recover DB from MD files or vice versa
    #[command(name = "db:recover")]
    DbRecover(commands::db_recover::DbRecoverArgs),

    /// Show version info as JSON
    #[command(name = "version")]
    Version,

    /// Show project repository and ticket status
    #[command(name = "project:status")]
    ProjectStatus(commands::project_status::ProjectStatusArgs),

    /// Show workflow definition and step budgets
    #[command(name = "workflow:status")]
    WorkflowStatus(commands::workflow_status::WorkflowStatusArgs),

    /// Scan tickets dir and index metadata into SQLite ticket_index table
    #[command(name = "ticket:index")]
    TicketIndex(commands::ticket_index::TicketIndexArgs),

    /// Analyze ticket dependencies via TF-IDF similarity
    #[command(name = "dependency:analyze")]
    DependencyAnalyze(commands::dependency_analyze::DependencyAnalyzeArgs),

    /// Set slaver role (writes to .eket/slaver-role + SQLite)
    #[command(name = "slaver:set-role")]
    SlaverSetRole(commands::slaver_set_role::SlaverSetRoleArgs),

    /// Extract skills/domain from active ticket context
    #[command(name = "skill:extract")]
    SkillExtract,

    /// List alerts from SQLite alerts table
    #[command(name = "alerts:list")]
    AlertsList,

    /// Check EPIC document completeness (epic.md, analysis, plan, retros)
    #[command(name = "doc:status")]
    DocStatus(commands::doc_status::DocStatusArgs),

    /// Create a new epic with scaffold docs
    #[command(name = "epic:create")]
    EpicCreate(commands::epic_create::EpicCreateArgs),

    /// Generate / refresh architecture plan for an epic
    #[command(name = "epic:plan")]
    EpicPlan(commands::epic_plan::EpicPlanArgs),

    /// Create or update project roadmap quarter section
    #[command(name = "roadmap:update")]
    RoadmapUpdate(commands::roadmap_update::RoadmapUpdateArgs),

    /// Create a spike ticket and plan document
    #[command(name = "spike:create")]
    SpikeCreate(commands::spike_create::SpikeCreateArgs),

    /// Complete a spike and write findings document
    #[command(name = "spike:complete")]
    SpikeComplete(commands::spike_complete::SpikeCompleteArgs),

    /// Create a design/adr/runbook/onboarding document
    #[command(name = "doc:create")]
    DocCreate(commands::doc_create::DocCreateArgs),

    /// Compose expert team by skills or epic type
    #[command(name = "expert:compose")]
    ExpertCompose(commands::expert_compose::ExpertComposeArgs),

    /// Search experts across default+extended packages
    #[command(name = "expert:search")]
    ExpertSearch {
        keyword: String,
        #[arg(long)]
        pkg: Option<String>,
        #[arg(long, default_value = "10")]
        limit: usize,
    },

    /// Show skills for an expert
    #[command(name = "expert:skills")]
    ExpertSkills { expert_id: String },

    /// Knowledge Curator: review a memory entry for quality before committing to library
    #[command(name = "memory:review")]
    MemoryReview(commands::memory_review::MemoryReviewArgs),

    /// 按专家角色召唤或注册 Slaver 实例
    #[command(name = "expert:summon")]
    ExpertSummon(commands::expert_summon::ExpertSummonArgs),

    /// Webhook management (add / list / remove / events / retry)
    #[command(name = "webhook", subcommand_required = true)]
    Webhook(commands::webhook::WebhookArgs),

    /// Compute batches for large codebase analysis
    #[command(name = "batch:compute")]
    BatchCompute(commands::batch::BatchComputeArgs),

    /// Show batch file info and statistics
    #[command(name = "batch:info")]
    BatchInfo(commands::batch::BatchInfoArgs),

    /// Build fingerprints for incremental change detection
    #[command(name = "fingerprint:build")]
    FingerprintBuild(commands::fingerprint::FingerprintBuildArgs),

    /// Diff current state against fingerprint baseline
    #[command(name = "fingerprint:diff")]
    FingerprintDiff(commands::fingerprint::FingerprintDiffArgs),

    /// Show fingerprint statistics
    #[command(name = "fingerprint:stats")]
    FingerprintStats(commands::fingerprint::FingerprintStatsArgs),

    /// Analyze code structure using tree-sitter (TASK-E11-001)
    #[command(name = "analyze:structure")]
    AnalyzeStructure(commands::analyze_structure::AnalyzeStructureArgs),
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // TASK-161: 支持 JSON formatter
    let log_format = std::env::var("EKET_LOG_FORMAT").unwrap_or_default();
    if log_format == "json" {
        fmt()
            .json()
            .with_env_filter(
                EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| EnvFilter::new(&cli.log_level)),
            )
            .with_target(false)
            .init();
    } else {
        fmt()
            .with_env_filter(
                EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| EnvFilter::new(&cli.log_level)),
            )
            .with_target(false)
            .init();
    }

    match cli.command {
        Commands::KnowledgeIndex(args) => commands::knowledge::run_index(args).await,
        Commands::KnowledgeSearch(args) => commands::knowledge::run_search(args).await,
        Commands::Recommend(args) => commands::knowledge::run_recommend(args).await,
        Commands::SystemDoctor => commands::system_doctor::run().await,
        Commands::TaskClaim(args) => commands::task_claim::run(args).await,
        Commands::TaskComplete {
            ticket_id,
            no_trailer,
        } => commands::task_complete::run(ticket_id, no_trailer).await,
        Commands::TaskCreate(args) => commands::task_create::run(args).await,
        Commands::TaskTest(args) => commands::task_test::run(args).await,
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
        Commands::DbRecover(args) => commands::db_recover::run(args).await,
        Commands::Version => {
            let info = serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "git_sha": env!("GIT_SHA"),
                "build_time": env!("BUILD_TIME"),
                "rust_version": env!("RUST_VERSION"),
            });
            println!("{}", serde_json::to_string_pretty(&info).unwrap());
            Ok(())
        }
        Commands::ProjectStatus(args) => commands::project_status::run(args).await,
        Commands::WorkflowStatus(args) => commands::workflow_status::run(args).await,
        Commands::TicketIndex(args) => commands::ticket_index::run(args).await,
        Commands::DependencyAnalyze(args) => commands::dependency_analyze::run(args).await,
        Commands::SlaverSetRole(args) => commands::slaver_set_role::run(args).await,
        Commands::SkillExtract => commands::skill_extract::run().await,
        Commands::AlertsList => commands::alerts_list::run().await,
        Commands::DocStatus(args) => commands::doc_status::run(args).await,
        Commands::EpicCreate(args) => commands::epic_create::run(args).await,
        Commands::EpicPlan(args) => commands::epic_plan::run(args).await,
        Commands::RoadmapUpdate(args) => commands::roadmap_update::run(args).await,
        Commands::SpikeCreate(args) => commands::spike_create::run(args).await,
        Commands::SpikeComplete(args) => commands::spike_complete::run(args).await,
        Commands::DocCreate(args) => commands::doc_create::run(args).await,
        Commands::ExpertCompose(args) => commands::expert_compose::run(args).await,
        Commands::ExpertSearch {
            keyword,
            pkg,
            limit,
        } => commands::expert_compose::run_search(keyword, pkg, limit).await,
        Commands::ExpertSkills { expert_id } => {
            commands::expert_compose::run_skills(expert_id).await
        }
        Commands::MemoryReview(args) => commands::memory_review::run(args).await,
        Commands::ExpertSummon(args) => commands::expert_summon::run(args).await,
        Commands::Webhook(args) => commands::webhook::run(args).await,
        Commands::BatchCompute(args) => commands::batch::run_compute(args).await,
        Commands::BatchInfo(args) => commands::batch::run_info(args).await,
        Commands::FingerprintBuild(args) => commands::fingerprint::run_build(args).await,
        Commands::FingerprintDiff(args) => commands::fingerprint::run_diff(args).await,
        Commands::FingerprintStats(args) => commands::fingerprint::run_stats(args).await,
        Commands::AnalyzeStructure(args) => commands::analyze_structure::run(args).await,
    }
}
