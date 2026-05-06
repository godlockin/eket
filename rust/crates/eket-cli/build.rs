/// TASK-159: 注入构建时元数据
use std::process::Command;

fn main() {
    // Git SHA（fallback to "unknown"）
    let git_sha = Command::new("git")
        .args(["rev-parse", "--short=8", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Build timestamp（ISO 8601）
    let build_time = chrono::Utc::now().to_rfc3339();

    // Rust version
    let rust_version = rustc_version::version()
        .map(|v| v.to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    println!("cargo:rustc-env=GIT_SHA={}", git_sha);
    println!("cargo:rustc-env=BUILD_TIME={}", build_time);
    println!("cargo:rustc-env=RUST_VERSION={}", rust_version);
    println!("cargo:rerun-if-changed=.git/HEAD");
}
