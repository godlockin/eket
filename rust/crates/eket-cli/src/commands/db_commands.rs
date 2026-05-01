use anyhow::Result;
use clap::Args;
use eket_core::{config::EketConfig, db::create_pool, migrations::MigrationRunner};

#[derive(Args)]
pub struct DbMigrateArgs;

#[derive(Args)]
pub struct DbStatusArgs;

pub async fn run_migrate(_args: DbMigrateArgs) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();
    let pool = create_pool(&config.sqlite.path)?;
    let conn = pool.get()?;
    let runner = MigrationRunner::new(&conn);
    runner.run()?;
    println!("Migrations applied. Current version: {}", runner.current_version()?);
    Ok(())
}

pub async fn run_status(_args: DbStatusArgs) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();
    let pool = create_pool(&config.sqlite.path)?;
    let conn = pool.get()?;
    let runner = MigrationRunner::new(&conn);

    // ensure table exists before querying
    let applied = runner.status().unwrap_or_default();

    if applied.is_empty() {
        println!("No migrations applied yet.");
    } else {
        println!("{:<8} {:<30} APPLIED_AT", "VERSION", "NAME");
        println!("{}", "-".repeat(64));
        for (ver, name, applied_at) in &applied {
            println!("{:<8} {:<30} {}", ver, name, applied_at);
        }
    }
    Ok(())
}
