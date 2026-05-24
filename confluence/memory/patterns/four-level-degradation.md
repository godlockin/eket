# 四级降级模式（Shell → Rust → Node.js → Shell fallback）

> **迁移提示**：架构设计部分已迁移至 `docs/architecture/degradation.md`，本文档保留实现细节和实战经验。

> 2026-05-04 更新：Rust binary 作为 Level 1 插入，原 Node.js 降为 Level 2，原三级升为四级。

**场景**：框架需要在不同环境（仅 bash、有 Rust binary、有 Node.js、有 Redis）下都能运行  
**方案**：  
1. **Level 0 — Shell**：纯 bash 脚本，零依赖，任何 POSIX 环境可用  
   - 读写 `jira/tickets/*.md` 文件作为任务队列  
   - 用文件锁（`flock`）防止并发冲突  
   - 文件：`lib/adapters/hybrid-adapter.sh`、`lib/state/*.sh`（**永不改动**）
2. **Level 1 — Rust binary** (`eket`)：高性能核心，~21ms 启动，SQLite+Redis  
   - 覆盖所有核心 CLI 命令（claim/complete/heartbeat/…）  
   - 内置 axum HTTP API（`:9877`），Node.js Dashboard 通过代理调用  
   - 自动降级到 Level 0 Shell 文件队列当 SQLite 不可达
3. **Level 2 — Node.js**：Web Dashboard / LLM Gateway / 交互向导  
   - 不再含核心业务逻辑，仅 UI + HTTP 代理层  
   - 不可用时系统仍可通过 Rust binary 正常运行
4. **Level 3 — Redis+SQLite（通过 Rust 访问）**：分布式任务队列 + 持久化状态  
   - 仅在 `EKET_REDIS_HOST` 可达时激活  
   - 断路器（`eket-core/circuit_breaker.rs`）防止 Redis 故障级联  

**关键规则**：  
- 每级必须在上级不可用时优雅降级，不抛出异常  
- Level 0 Shell 永远可用（不依赖任何外部服务）  
- `eket system:doctor` 命令反映当前实际运行级别  
- Node.js 层数据全部通过 Rust API 获取，不直接操作 DB

**来源**：EKET 架构设计（CLAUDE.md §架构快照、SKILL.md §架构）
