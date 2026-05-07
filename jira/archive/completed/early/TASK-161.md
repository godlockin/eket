# TASK-161: Rust 编译警告清理 + tracing JSON formatter

## 元数据
- **类型**: chore
- **优先级**: P2
- **状态**: done
- **创建**: 2026-04-21
- **依赖**: 无
- **完成**: 2026-05-06

## 验收标准

- [x] `cargo build --release 2>&1 | grep warning` 输出为空
- [x] 特别处理：unused imports、dead_code、unused variables
- [x] `tracing_subscriber` 支持 JSON formatter（`EKET_LOG_FORMAT=json`）
- [x] 默认保留 pretty 格式（开发友好）
- [x] CI 加 `RUSTFLAGS="-D warnings"` 阻止新警告引入

## 负责人
Rust Slaver（已完成）

## 实现细节

### 警告修复
```rust
// db_recover.rs L32
#[derive(Debug)]
#[allow(dead_code)]  // 未使用字段暂时保留，未来可能用到
struct TicketMetadata {
    assignee: Option<String>,
    created_at: Option<String>,
    // ...
}
```

### JSON formatter
```rust
// main.rs L226-246
let log_format = std::env::var("EKET_LOG_FORMAT").unwrap_or_default();
if log_format == "json" {
    fmt()
        .json()
        .with_env_filter(...)
        .init();
} else {
    fmt()  // 默认 pretty 格式
        .with_env_filter(...)
        .init();
}
```

## 测试结果

```bash
$ cargo build --release 2>&1 | grep warning
# (无输出，编译通过)

$ EKET_LOG_FORMAT=json EKET_LOG_LEVEL=info eket version
{"timestamp":"2026-05-06T...","level":"INFO",...}
{
  "version": "0.1.0",
  ...
}
```

## 知识沉淀

- `#[allow(dead_code)]` 可临时抑制警告，但应附注释说明保留原因
- `tracing_subscriber::fmt().json()` 输出结构化日志，便于 ELK/Loki 解析
- `EKET_LOG_FORMAT` 环境变量支持 `json` / 空（默认 pretty）
- 建议 CI 加 `RUSTFLAGS="-D warnings"` 将警告升级为错误

