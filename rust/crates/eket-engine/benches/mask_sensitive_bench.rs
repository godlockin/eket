//! TASK-657: Regex precompilation benchmark
//!
//! Validates that pre-compiled regexes via once_cell are faster than
//! per-call regex compilation. 1000 iterations benchmark.

use criterion::{criterion_group, criterion_main, Criterion};

use eket_engine::dag::executor::sanitize_script;

/// Sample scripts with various sensitive patterns
const TEST_SCRIPTS: &[&str] = &[
    // Simple echo
    "echo hello world",
    // API key pattern
    "curl -H API_KEY=sk-1234567890abcdef http://api.example.com",
    // Bearer token
    "curl -H Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 http://api",
    // GitHub PAT
    "git clone https://ghp_1234567890abcdefABCDEF@github.com/user/repo",
    // Multiple patterns
    "API_KEY=key1 TOKEN=tok1 PASSWORD=pass1 Bearer secret123",
    // Slack token
    "curl -X POST -H Authorization: Bearer xoxb-123-456-abcdef https://slack.com/api",
    // Long script with mixed content
    "npm run build && API_KEY=prod-key-12345 node server.js --port 3000 --env production TOKEN=auth-token-xyz",
];

fn bench_mask_sensitive(c: &mut Criterion) {
    let mut group = c.benchmark_group("mask_sensitive");

    // Benchmark: Single script masking
    for (i, script) in TEST_SCRIPTS.iter().enumerate() {
        group.bench_function(format!("script_{}", i), |b| {
            b.iter(|| sanitize_script(script, 500))
        });
    }

    // Benchmark: Batch 1000 calls (mixed scripts)
    group.bench_function("batch_1000_mixed", |b| {
        b.iter(|| {
            for _ in 0..1000 {
                for script in TEST_SCRIPTS {
                    let _ = sanitize_script(script, 500);
                }
            }
        })
    });

    // Benchmark: Worst case (all patterns match)
    group.bench_function("worst_case_all_patterns", |b| {
        let script = "API_KEY=key1 PASSWORD=pass1 TOKEN=tok1 Bearer jwt123 Basic dXNlcjpwYXNz ghp_abcdef123456 xoxb-123-456-abc";
        b.iter(|| sanitize_script(script, 500))
    });

    group.finish();
}

criterion_group!(benches, bench_mask_sensitive);
criterion_main!(benches);
