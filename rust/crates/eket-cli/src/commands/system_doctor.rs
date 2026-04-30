/// system:doctor — 对应 TS: system:doctor command
/// 检查 SQLite + Redis 连通性，输出 JSON 诊断报告
use anyhow::Result;
use eket_core::{
    config::EketConfig,
    db::{create_pool, SqliteClient},
    redis::EketRedisClient,
};
use serde_json::json;

pub async fn run() -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();

    let mut checks = vec![];

    // ── SQLite check ──────────────────────────────────────────────────────────
    let sqlite_result = (|| -> Result<()> {
        let pool = create_pool(&config.sqlite.path)?;
        let client = SqliteClient::new(pool);
        client.ping()?;
        Ok(())
    })();

    let sqlite_ok = sqlite_result.is_ok();
    let sqlite_err = sqlite_result.err().map(|e| e.to_string());
    checks.push(json!({
        "name": "SQLite",
        "status": if sqlite_ok { "ok" } else { "fail" },
        "path": config.sqlite.path,
        "error": sqlite_err,
    }));

    // ── Redis check ───────────────────────────────────────────────────────────
    let redis_client = EketRedisClient::connect(
        &config.redis.host,
        config.redis.port,
        config.redis.password.as_deref(),
    )
    .await;

    let redis_ok = redis_client.is_available() && redis_client.ping().await.unwrap_or(false);
    checks.push(json!({
        "name": "Redis",
        "status": if redis_ok { "ok" } else { "degraded" },
        "host": format!("{}:{}", config.redis.host, config.redis.port),
        "note": if !redis_ok { "Will use file queue fallback (Level 2)" } else { "" },
    }));

    // ── Summary ───────────────────────────────────────────────────────────────
    let all_critical_ok = sqlite_ok; // Redis degraded is acceptable
    let report = json!({
        "eket_version": env!("CARGO_PKG_VERSION"),
        "status": if all_critical_ok { "healthy" } else { "unhealthy" },
        "level": if redis_ok { 3 } else { 2 },
        "checks": checks,
    });

    println!("{}", serde_json::to_string_pretty(&report)?);

    if !all_critical_ok {
        std::process::exit(1);
    }

    Ok(())
}
