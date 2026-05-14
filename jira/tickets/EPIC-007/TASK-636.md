# TASK-636: Rust Context Monitor - 高性能二进制实现

**Epic**: EPIC-007  
**Priority**: P2  
**Status**: 📋 Backlog  
**Estimate**: 6h  
**Agent Type**: backend  
**Category**: 🦀 Performance  

---

## Goal

使用 Rust 重写 context monitor 核心逻辑，编译为二进制，替换 Node.js 实现以提升性能。

---

## Acceptance Criteria

**AC-1**: 二进制启动 < 10ms  
- Given: 执行 `eket-context-monitor --check`
- When: 程序启动
- Then: 冷启动耗时 < 10ms（vs Node 200ms）

**AC-2**: Token 估算精度一致  
- Given: 对比 Node.js 实现
- When: 同样输入文件
- Then: 误差 < 5%

**AC-3**: 跨平台编译  
- Given: GitHub Actions CI
- When: 编译 Mac + Linux 二进制
- Then: 两平台均通过测试

**AC-4**: 向后兼容  
- Given: 现有 Shell Hook 调用
- When: 替换为 Rust 二进制
- Then: 接口不变（CLI 参数一致）

---

## Implementation Sketch

```rust
// rust/crates/context-mon/src/main.rs
use clap::Parser;
use tiktoken_rs::cl100k_base;
use walkdir::WalkDir;

#[derive(Parser)]
struct Args {
    #[arg(long)]
    check: bool,
}

struct ContextMonitor {
    rough_threshold: usize,
}

impl ContextMonitor {
    fn rough_estimate(&self) -> usize {
        let total_size: usize = WalkDir::new(".")
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension()
                    .and_then(|s| s.to_str())
                    .map(|ext| ["md", "ts", "js"].contains(&ext))
                    .unwrap_or(false)
            })
            .filter_map(|e| e.metadata().ok())
            .map(|m| m.len() as usize)
            .sum();
        
        (total_size * 3) / 10
    }
    
    fn precise_estimate(&self) -> usize {
        let bpe = cl100k_base().unwrap();
        let patterns = ["jira/tickets/**/*.md", "confluence/memory/**/*.md"];
        let mut total = 0;
        
        for pattern in patterns {
            for entry in glob::glob(pattern).unwrap().take(20) {
                if let Ok(path) = entry {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        total += bpe.encode_with_special_tokens(&content).len();
                    }
                }
            }
        }
        total
    }
    
    fn estimate(&self) -> (usize, &str) {
        let rough = self.rough_estimate();
        if rough < 40_000 {
            return (rough, "rough");
        }
        (self.precise_estimate(), "precise")
    }
}

fn main() {
    let args = Args::parse();
    if args.check {
        let monitor = ContextMonitor { rough_threshold: 40_000 };
        let (tokens, method) = monitor.estimate();
        println!("{{\"tokens\": {}, \"method\": \"{}\"}}", tokens, method);
    }
}
```

**Cargo.toml**:
```toml
[package]
name = "eket-context-monitor"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = { version = "4.5", features = ["derive"] }
tiktoken-rs = "0.5"
walkdir = "2.5"
glob = "0.3"
serde_json = "1.0"

[profile.release]
lto = true
codegen-units = 1
opt-level = 3
strip = true
```

---

## Observability

**Logs**: 兼容 Node.js JSONL 格式  
**Metrics**: 二进制大小（target: < 5MB）  
**Performance**: Benchmark vs Node.js（hiperfine）  

---

## Rollback Plan

保留 Node.js 实现，通过环境变量切换：
```bash
EKET_MONITOR_IMPL=node  # 降级为 Node.js
EKET_MONITOR_IMPL=rust  # 使用 Rust 二进制
```

---

## Test Strategy

**Unit**: Rust 单元测试（cargo test）  
**Integration**: 替换 Node，运行 TASK-635 完整测试套件  
**Benchmark**: `hyperfine 'node dist/context-monitor.js' './target/release/eket-context-monitor'`  

---

**Blocked By**: TASK-632（需要 Node 实现作为基准）  
**Blocks**: TASK-637  
**Created**: 2026-05-14
