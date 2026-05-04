//! trust_engine.rs
//! 多维 TrustScore 引擎 — 基于历史行为对 slaver 进行信誉评分。
//! 来源：ruflo 借鉴研究（TASK-251）。
//!
//! 评分公式：
//!   score = 0.4×success_rate + 0.2×uptime + 0.2×latency_norm + 0.2×(1 - error_rate)
//! 权重通过 `.eket/config/scoring_weights.toml` 可配置。

use std::path::Path;

// ─── Structs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct TrustFactors {
    pub success_rate_7d: f32,   // 0.0~1.0
    pub uptime_30d: f32,        // 0.0~1.0
    pub avg_latency_norm: f32,  // 0.0~1.0（低延迟 = 高分）
    pub error_rate: f32,        // 0.0~1.0（反向：越低越好）
}

#[derive(Debug, Clone)]
pub struct ScoreWeights {
    pub success: f32,  // 默认 0.4
    pub uptime: f32,   // 默认 0.2
    pub latency: f32,  // 默认 0.2
    pub error: f32,    // 默认 0.2
}

impl Default for ScoreWeights {
    fn default() -> Self {
        Self { success: 0.4, uptime: 0.2, latency: 0.2, error: 0.2 }
    }
}

// ─── Core compute ─────────────────────────────────────────────────────────────

/// 加权求和；error_rate 取反（越低越好）。
pub fn compute_trust(factors: &TrustFactors, weights: &ScoreWeights) -> f32 {
    (weights.success * factors.success_rate_7d
        + weights.uptime * factors.uptime_30d
        + weights.latency * factors.avg_latency_norm
        + weights.error * (1.0 - factors.error_rate))
        .clamp(0.0, 1.0)
}

// ─── Factors builder ─────────────────────────────────────────────────────────

/// 从 DB 原始计数构建 TrustFactors。
/// 新 slaver（completed=0, failed=0）使用乐观默认值，避免饿死。
pub fn factors_from_stats(completed: i64, failed: i64, total_latency_ms: i64) -> TrustFactors {
    if completed == 0 && failed == 0 {
        return TrustFactors {
            success_rate_7d: 0.5,
            uptime_30d: 1.0,
            avg_latency_norm: 0.8,
            error_rate: 0.0,
        };
    }
    let total = (completed + failed) as f32;
    let success_rate = completed as f32 / total;
    let avg_ms = if completed > 0 {
        total_latency_ms as f32 / completed as f32
    } else {
        60_000.0
    };
    let latency_norm = 1.0 - (avg_ms / 60_000.0).clamp(0.0, 1.0);
    let error_rate = failed as f32 / total;
    TrustFactors {
        success_rate_7d: success_rate,
        uptime_30d: 1.0, // TODO: track actual uptime
        avg_latency_norm: latency_norm,
        error_rate,
    }
}

// ─── Config loader ────────────────────────────────────────────────────────────

/// 从 `.eket/config/scoring_weights.toml` 加载权重。
/// 文件不存在或解析失败时返回默认值（不报错）。
pub fn load_weights(project_root: &Path) -> ScoreWeights {
    let path = project_root.join(".eket/config/scoring_weights.toml");
    if !path.exists() {
        return ScoreWeights::default();
    }
    let Ok(content) = std::fs::read_to_string(&path) else {
        return ScoreWeights::default();
    };
    parse_weights_toml(&content).unwrap_or_default()
}

fn parse_weights_toml(content: &str) -> Option<ScoreWeights> {
    let mut in_weights = false;
    let mut w = ScoreWeights::default();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "[weights]" {
            in_weights = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_weights = false;
        }
        if in_weights {
            if let Some((k, v)) = trimmed.split_once('=') {
                let val: f32 = v.trim().parse().ok()?;
                match k.trim() {
                    "success" => w.success = val,
                    "uptime"  => w.uptime  = val,
                    "latency" => w.latency = val,
                    "error"   => w.error   = val,
                    _ => {}
                }
            }
        }
    }
    Some(w)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_compute_trust_high_success_scores_higher() {
        let weights = ScoreWeights::default();
        let high = TrustFactors { success_rate_7d: 0.95, uptime_30d: 1.0, avg_latency_norm: 0.9, error_rate: 0.05 };
        let low  = TrustFactors { success_rate_7d: 0.30, uptime_30d: 0.5, avg_latency_norm: 0.3, error_rate: 0.50 };
        assert!(compute_trust(&high, &weights) > compute_trust(&low, &weights));
    }

    #[test]
    fn test_compute_trust_new_slaver_gets_neutral_score() {
        let factors = factors_from_stats(0, 0, 0);
        let score = compute_trust(&factors, &ScoreWeights::default());
        // 0.4×0.5 + 0.2×1.0 + 0.2×0.8 + 0.2×1.0 = 0.76
        assert!(score > 0.5 && score <= 1.0, "neutral score expected, got {score}");
    }

    #[test]
    fn test_default_weights_sum_to_one() {
        let w = ScoreWeights::default();
        let sum = w.success + w.uptime + w.latency + w.error;
        assert!((sum - 1.0).abs() < 1e-6, "weights must sum to 1.0, got {sum}");
    }

    #[test]
    fn test_scoring_weights_loads_default_when_config_missing() {
        let dir = TempDir::new().unwrap();
        let w = load_weights(dir.path());
        let d = ScoreWeights::default();
        assert!((w.success - d.success).abs() < 1e-6);
        assert!((w.uptime  - d.uptime).abs()  < 1e-6);
    }

    #[test]
    fn test_scoring_weights_loads_from_file() {
        let dir = TempDir::new().unwrap();
        let cfg_dir = dir.path().join(".eket/config");
        std::fs::create_dir_all(&cfg_dir).unwrap();
        std::fs::write(
            cfg_dir.join("scoring_weights.toml"),
            "[weights]\nsuccess = 0.5\nuptime = 0.2\nlatency = 0.15\nerror = 0.15\n",
        ).unwrap();
        let w = load_weights(dir.path());
        assert!((w.success - 0.5).abs() < 1e-6);
        assert!((w.latency - 0.15).abs() < 1e-6);
    }
}
