//! Fingerprint CLI commands for incremental change detection.
//!
//! Commands:
//! - fingerprint:build - Compute fingerprints for a directory
//! - fingerprint:diff - Compare against baseline
//! - fingerprint:stats - Show fingerprint statistics

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::Result;
use clap::Args;
use eket_core::db::create_pool;
use eket_core::fingerprint::{
    classify_change, compute_fingerprint, ChangeType, FingerprintBaseline, FingerprintStore,
};
use walkdir::WalkDir;

// ─── fingerprint:build ───────────────────────────────────────────────────────

#[derive(Args)]
pub struct FingerprintBuildArgs {
    /// Directory to scan
    pub path: PathBuf,

    /// Output JSON file (optional, defaults to .eket/fingerprints.json)
    #[arg(long, short)]
    pub output: Option<PathBuf>,

    /// Git commit SHA to tag fingerprints with
    #[arg(long)]
    pub commit: Option<String>,

    /// Maximum file size to process (bytes, default 10MB)
    #[arg(long, default_value = "10485760")]
    pub max_file_size: u64,

    /// File extensions to include (comma-separated, default: rs,ts,tsx,js,jsx,py,go)
    #[arg(long, default_value = "rs,ts,tsx,js,jsx,py,go")]
    pub extensions: String,
}

pub async fn run_build(args: FingerprintBuildArgs) -> Result<()> {
    let extensions: Vec<&str> = args.extensions.split(',').collect();

    // Get git commit if --commit HEAD
    let commit_sha = match args.commit.as_deref() {
        Some("HEAD") => get_git_head()?,
        Some(sha) => Some(sha.to_string()),
        None => None,
    };

    // Create store
    let db_path = get_db_path()?;
    let pool = create_pool(&db_path)?;
    let store = FingerprintStore::new(pool)?;

    // Scan directory
    let mut fingerprints = Vec::new();
    let mut skipped = 0;
    let mut errors = 0;

    println!("Scanning {}...", args.path.display());

    for entry in WalkDir::new(&args.path)
        .into_iter()
        .filter_entry(|e| !is_ignored(e.path()))
    {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();

        // Check extension
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        if !extensions.contains(&ext) {
            continue;
        }

        // Check file size
        if let Ok(meta) = entry.metadata() {
            if meta.len() > args.max_file_size {
                skipped += 1;
                continue;
            }
        }

        // Compute fingerprint
        match compute_fingerprint(path, None) {
            Ok(fp) => fingerprints.push(fp),
            Err(e) => {
                eprintln!("Warning: Failed to fingerprint {}: {}", path.display(), e);
                errors += 1;
            }
        }
    }

    // Store in SQLite
    let stored = store.put_batch(&fingerprints, commit_sha.as_deref())?;

    // Export to JSON
    let output_path = args.output.unwrap_or_else(|| {
        let eket_dir = args.path.join(".eket");
        std::fs::create_dir_all(&eket_dir).ok();
        eket_dir.join("fingerprints.json")
    });

    let mut baseline = FingerprintBaseline::new(commit_sha.clone());
    for fp in &fingerprints {
        baseline.add(fp);
    }
    baseline.save_to_file(&output_path)?;

    println!();
    println!("Fingerprint build complete:");
    println!("  Files processed: {}", fingerprints.len());
    println!("  Files skipped (size): {}", skipped);
    println!("  Errors: {}", errors);
    println!("  Stored in SQLite: {}", stored);
    println!("  Output: {}", output_path.display());
    if let Some(sha) = commit_sha {
        println!("  Commit: {}", sha);
    }

    Ok(())
}

// ─── fingerprint:diff ────────────────────────────────────────────────────────

#[derive(Args)]
pub struct FingerprintDiffArgs {
    /// Baseline JSON file or commit SHA
    #[arg(long)]
    pub baseline: String,

    /// Target directory to compare (default: current directory)
    #[arg(long, default_value = ".")]
    pub target: PathBuf,

    /// Output format: text, json
    #[arg(long, default_value = "text")]
    pub format: String,

    /// File extensions to include
    #[arg(long, default_value = "rs,ts,tsx,js,jsx,py,go")]
    pub extensions: String,
}

pub async fn run_diff(args: FingerprintDiffArgs) -> Result<()> {
    let extensions: Vec<&str> = args.extensions.split(',').collect();

    // Load baseline
    let baseline_fps = if args.baseline.ends_with(".json") {
        // Load from JSON file
        let path = PathBuf::from(&args.baseline);
        let baseline = FingerprintBaseline::load_from_file(&path)?;
        baseline.to_fingerprints()
    } else {
        // Load from SQLite by commit SHA
        let db_path = get_db_path()?;
        let pool = create_pool(&db_path)?;
        let store = FingerprintStore::new(pool)?;
        store.list_by_commit(Some(&args.baseline))?
    };

    // Build index of baseline
    let baseline_map: std::collections::HashMap<&str, _> = baseline_fps
        .iter()
        .map(|fp| (fp.path.as_str(), fp))
        .collect();

    // Scan target directory for current state
    let mut results = Vec::new();
    let mut summary = eket_core::fingerprint::classifier::ChangeSummary::default();

    for entry in WalkDir::new(&args.target)
        .into_iter()
        .filter_entry(|e| !is_ignored(e.path()))
    {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !extensions.contains(&ext) {
            continue;
        }

        let path_str = path.to_string_lossy().to_string();

        // Compute current fingerprint
        let new_fp = compute_fingerprint(path, None).ok();

        let old_fp = baseline_map.get(path_str.as_str()).copied();
        let change_type = classify_change(old_fp, new_fp.as_ref());

        summary.total += 1;
        match change_type {
            ChangeType::None => summary.none += 1,
            ChangeType::Cosmetic => summary.cosmetic += 1,
            ChangeType::Structural => summary.structural += 1,
            ChangeType::New => summary.new += 1,
            ChangeType::Deleted => summary.deleted += 1,
        }

        if change_type != ChangeType::None {
            results.push((path_str, change_type));
        }
    }

    // Check for deleted files
    for path in baseline_map.keys() {
        let target_path = args.target.join(path);
        if !target_path.exists() {
            summary.total += 1;
            summary.deleted += 1;
            results.push((path.to_string(), ChangeType::Deleted));
        }
    }

    // Output
    if args.format == "json" {
        let output = serde_json::json!({
            "summary": {
                "total": summary.total,
                "none": summary.none,
                "cosmetic": summary.cosmetic,
                "structural": summary.structural,
                "new": summary.new,
                "deleted": summary.deleted,
                "hit_rate": summary.hit_rate(),
            },
            "changes": results.iter().map(|(p, t)| {
                serde_json::json!({"path": p, "type": t.to_string()})
            }).collect::<Vec<_>>(),
        });
        println!("{}", serde_json::to_string_pretty(&output)?);
    } else {
        println!("Change Summary:");
        println!("  STRUCTURAL: {} (needs re-analysis)", summary.structural);
        println!("  COSMETIC:   {} (can skip)", summary.cosmetic);
        println!("  NEW:        {}", summary.new);
        println!("  DELETED:    {}", summary.deleted);
        println!("  UNCHANGED:  {}", summary.none);
        println!();
        println!("  Hit Rate: {:.1}%", summary.hit_rate());
        println!("  To Analyze: {}", summary.needs_reanalysis());
        println!("  Can Skip: {}", summary.can_skip());

        if !results.is_empty() {
            println!();
            println!("Changed files:");
            for (path, change_type) in &results {
                println!("  [{:10}] {}", change_type.to_string(), path);
            }
        }
    }

    Ok(())
}

// ─── fingerprint:stats ───────────────────────────────────────────────────────

#[derive(Args)]
pub struct FingerprintStatsArgs {
    /// Show stats since this date (ISO 8601, default: all time)
    #[arg(long)]
    pub since: Option<String>,

    /// Output format: text, json
    #[arg(long, default_value = "text")]
    pub format: String,
}

pub async fn run_stats(args: FingerprintStatsArgs) -> Result<()> {
    let db_path = get_db_path()?;
    let pool = create_pool(&db_path)?;
    let store = FingerprintStore::new(pool)?;

    let since_ts = match &args.since {
        Some(date) => chrono::DateTime::parse_from_rfc3339(date)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        None => 0,
    };

    let stats = store.get_stats(since_ts)?;
    let cache_stats = store.cache_stats();

    if args.format == "json" {
        let output = serde_json::json!({
            "fingerprints": {
                "total_files": stats.total_files,
                "total_bytes": stats.total_bytes,
                "total_lines": stats.total_lines,
            },
            "cache": {
                "entry_count": cache_stats.entry_count,
            }
        });
        println!("{}", serde_json::to_string_pretty(&output)?);
    } else {
        println!("Fingerprint Statistics:");
        println!("  Total files: {}", stats.total_files);
        println!("  Total size: {} bytes", stats.total_bytes);
        println!("  Total lines: {}", stats.total_lines);
        println!();
        println!("Cache (L1 DashMap):");
        println!("  Entries: {}", cache_stats.entry_count);
    }

    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn get_db_path() -> Result<String> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
    let eket_dir = home.join(".eket").join("data");
    std::fs::create_dir_all(&eket_dir)?;
    Ok(eket_dir.join("eket.db").to_string_lossy().to_string())
}

fn get_git_head() -> Result<Option<String>> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()?;

    if output.status.success() {
        let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(Some(sha))
    } else {
        Ok(None)
    }
}

fn is_ignored(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Common ignore patterns
    path_str.contains("node_modules")
        || path_str.contains("target")
        || path_str.contains(".git")
        || path_str.contains("__pycache__")
        || path_str.contains(".pyc")
        || path_str.contains("dist")
        || path_str.contains("build")
        || path_str.contains(".eket")
}
