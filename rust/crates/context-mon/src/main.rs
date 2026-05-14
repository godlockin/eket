use context_mon::ContextEstimator;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::process;

const WARN_THRESHOLD: usize = 70000;
const DANGER_THRESHOLD: usize = 85000;

#[derive(Serialize)]
struct OutputJson {
    tokens: usize,
    method: String,
    threshold: String,
}

#[derive(Serialize)]
struct LogEntry {
    timestamp: u64,
    tokens: usize,
    method: String,
    threshold: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<f64>,
}

fn get_threshold(tokens: usize) -> &'static str {
    if tokens >= DANGER_THRESHOLD {
        "danger"
    } else if tokens >= WARN_THRESHOLD {
        "warn"
    } else {
        "safe"
    }
}

fn main() {
    if let Err(e) = run() {
        eprintln!(
            "{}",
            serde_json::json!({
                "error": e.to_string()
            })
        );
        process::exit(3);
    }
}

fn run() -> anyhow::Result<()> {
    let estimator = ContextEstimator::new();
    let result = estimator.estimate()?;

    let threshold = get_threshold(result.tokens);

    // Write log entry
    let log_entry = LogEntry {
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis() as u64,
        tokens: result.tokens,
        method: result.method.clone(),
        threshold: threshold.to_string(),
        duration: result.duration,
    };

    let logs_dir = Path::new("logs");
    if !logs_dir.exists() {
        fs::create_dir_all(logs_dir)?;
    }

    let log_file = logs_dir.join("context-monitor.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file)?;
    writeln!(file, "{}", serde_json::to_string(&log_entry)?)?;

    // Output JSON to stdout
    let output = OutputJson {
        tokens: result.tokens,
        method: result.method,
        threshold: threshold.to_string(),
    };
    println!("{}", serde_json::to_string(&output)?);

    // Exit with appropriate code
    match threshold {
        "danger" => process::exit(2),
        "warn" => process::exit(1),
        _ => process::exit(0),
    }
}

