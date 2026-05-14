use context_mon::ContextEstimator;
use serde::Serialize;
use std::process;

#[derive(Serialize)]
struct Output {
    tokens: usize,
    method: String,
    threshold: String,
}

const WARN_THRESHOLD: usize = 70_000;
const DANGER_THRESHOLD: usize = 85_000;

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
    let estimator = ContextEstimator::new();
    let result = estimator.estimate();

    let output = Output {
        tokens: result.tokens,
        method: match result.method {
            context_mon::EstimateMethod::Rough => "rough".to_string(),
            context_mon::EstimateMethod::Precise => "precise".to_string(),
        },
        threshold: get_threshold(result.tokens).to_string(),
    };

    match serde_json::to_string(&output) {
        Ok(json) => println!("{}", json),
        Err(e) => {
            eprintln!("{{\"error\": \"{}\"}}", e);
            process::exit(3);
        }
    }

    // Exit codes matching Node.js implementation
    let exit_code = match get_threshold(result.tokens) {
        "danger" => 2,
        "warn" => 1,
        _ => 0,
    };
    process::exit(exit_code);
}
