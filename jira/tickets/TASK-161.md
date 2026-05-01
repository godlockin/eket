# TASK-161: Rust 编译警告清理 + tracing JSON formatter

## 元数据
- **类型**: chore
- **优先级**: P2
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 验收标准

- [ ] `cargo build --release 2>&1 | grep warning` 输出为空
- [ ] 特别处理：unused imports、dead_code、unused variables
- [ ] `tracing_subscriber` 支持 JSON formatter（`EKET_LOG_FORMAT=json`）
- [ ] 默认保留 pretty 格式（开发友好）
- [ ] CI 加 `RUSTFLAGS="-D warnings"` 阻止新警告引入

## 负责人
待认领（推荐：Rust 工程师）
