/// task:claim — Phase 1 stub
/// 完整实现在 Phase 3（需要 eket-engine 的 MasterElection）
use anyhow::Result;
use eket_core::config::EketConfig;
use serde_json::json;

pub async fn run(ticket_id: Option<String>) -> Result<()> {
    let _config = EketConfig::load().unwrap_or_default();

    // Phase 1 stub: 输出 JSON 告知 CLI 可运行
    let report = json!({
        "status": "stub",
        "message": "task:claim will be fully implemented in Phase 3 (eket-engine)",
        "requested": ticket_id,
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
