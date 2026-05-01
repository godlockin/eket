use anyhow::Result;
use clap::Args;
use eket_engine::workflow::{WorkflowDefinition, WorkflowStep};

#[derive(Args)]
pub struct WorkflowStatusArgs {
    /// Workflow definition JSON file path
    pub file: String,
}

pub async fn run(args: WorkflowStatusArgs) -> Result<()> {
    let content = tokio::fs::read_to_string(&args.file).await?;
    let def: WorkflowDefinition = serde_json::from_str(&content)?;

    println!("Workflow: {} ({})", def.name, def.id);
    println!("Entry step: {}", def.entry_step_id);
    println!("Steps:");
    for step in &def.steps {
        print_step(step);
    }
    Ok(())
}

fn print_step(step: &WorkflowStep) {
    match &step.context_budget {
        Some(budget) => {
            let max_tokens = budget.max_tokens.map(|n| n.to_string()).unwrap_or_else(|| "∞".into());
            let keep_recent = budget.keep_recent_n.map(|n| n.to_string()).unwrap_or_else(|| "all".into());
            println!(
                "  Step: {} [budget: max_tokens={}, keep_recent={}]",
                step.name, max_tokens, keep_recent
            );
        }
        None => {
            println!("  Step: {}", step.name);
        }
    }
}
