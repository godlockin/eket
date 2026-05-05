/// CLI commands for webhook management.
///
/// webhook:add    — register a new webhook endpoint
/// webhook:list   — list all registered endpoints
/// webhook:remove — delete an endpoint by ID
/// webhook:events — show delivery history (optional status filter)
/// webhook:retry  — reset a failed record for immediate re-delivery
use anyhow::{bail, Result};
use clap::{Args, Subcommand};
use eket_core::{config::EketConfig, db::create_pool, webhook::WebhookStore};

// ─── Args ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Args)]
pub struct WebhookArgs {
    #[command(subcommand)]
    pub cmd: WebhookCmd,
}

#[derive(Debug, Subcommand)]
pub enum WebhookCmd {
    /// Register a new webhook endpoint
    #[command(name = "add")]
    Add {
        /// Target URL
        url: String,
        /// Comma-separated event list (e.g. task.completed,epic.completed or *)
        #[arg(long, default_value = "*")]
        events: String,
        /// HMAC signing secret (optional)
        #[arg(long)]
        secret: Option<String>,
    },
    /// List all registered webhook endpoints
    #[command(name = "list")]
    List,
    /// Remove a webhook endpoint by ID
    #[command(name = "remove")]
    Remove {
        /// Webhook URL ID (from webhook:list)
        id: String,
    },
    /// Show webhook delivery event history
    #[command(name = "events")]
    Events {
        /// Filter by status: failed | pending | completed
        #[arg(long)]
        status: Option<String>,
    },
    /// Reset a failed delivery record for immediate retry
    #[command(name = "retry")]
    Retry {
        /// Event record ID (from webhook:events)
        event_record_id: String,
    },
}

// ─── Runners ──────────────────────────────────────────────────────────────────

pub async fn run(args: WebhookArgs) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();
    let pool = create_pool(&config.sqlite.path)?;
    let store = WebhookStore::new(pool);

    match args.cmd {
        WebhookCmd::Add { url, events, secret } => {
            let event_list: Vec<String> =
                events.split(',').map(|s| s.trim().to_string()).collect();

            let wh = store.add_url(&url, &event_list, secret.as_deref())?;
            println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                "status": "created",
                "id": wh.id,
                "url": wh.url,
                "events": wh.events,
                "created_at": wh.created_at,
            }))?);
        }

        WebhookCmd::List => {
            let list = store.list_urls()?;
            // Mask secret for display
            let display: Vec<_> = list.iter().map(|wh| serde_json::json!({
                "id": wh.id,
                "url": wh.url,
                "events": wh.events,
                "secret_set": wh.secret.is_some(),
                "created_at": wh.created_at,
            })).collect();
            println!("{}", serde_json::to_string_pretty(&display)?);
        }

        WebhookCmd::Remove { id } => {
            let n = store.remove_url(&id)?;
            if n == 0 {
                bail!("No webhook found with id={id}");
            }
            println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                "status": "removed",
                "id": id,
            }))?);
        }

        WebhookCmd::Events { status } => {
            let records = store.list_records(status.as_deref())?;
            println!("{}", serde_json::to_string_pretty(&records)?);
        }

        WebhookCmd::Retry { event_record_id } => {
            store.reset_for_retry(&event_record_id)?;
            println!("{}", serde_json::to_string_pretty(&serde_json::json!({
                "status": "queued_for_retry",
                "event_record_id": event_record_id,
            }))?);
        }
    }

    Ok(())
}
