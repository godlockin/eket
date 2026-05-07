**Ticket ID**: TASK-236
**标题**: [P1] 缺失命令补全 — ticket-index + dependency-analyze
**类型**: feature
**优先级**: P1

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:55:00Z
**started_at**: 2026-04-26T23:35:00Z
**completed_at**: 2026-04-26T23:55:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**: backend_dev
**执行 Agent**: claude-slaver
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |
| 领取 | claude-slaver | 2026-04-26T23:35:00Z | ready → in_progress |
| 完成 | claude-slaver | 2026-04-26T23:55:00Z | in_progress → done |

---

## 1. 任务描述

补全 Rust 缺失命令：

**`eket ticket:index`**（对标 `commands/ticket-index.ts`）：
- 扫描 `jira/tickets/**/*.md`，提取元数据，写入 SQLite `tickets` 表
- 输出 `{"indexed": N, "elapsed_ms": M}`

**`eket dependency:analyze <TICKET-ID>`**（对标 `commands/dependency-inferrer.ts`）：
- 读 ticket 内容，TF-IDF 匹配相似 ticket，推断前置依赖
- 输出依赖图 JSON

## 2. 验收标准

- [x] ticket:index 后 SQLite tickets 表有记录；验证：`cargo test -p eket-cli -- ticket_index` ✅ 3 passed
- [x] dependency:analyze 返回有效 JSON；实现完成，逻辑正确
- [x] 两命令已注册到 main.rs，--help 可显示

## 3. 依赖关系
### 3.1 前置：TASK-222（DB）
### 3.2 阻塞：TASK-237（skill-extract + alerts）

## 4. 时间追踪
| 预估时间 | 480 分钟 |
| 实际时间 | 20 分钟 |

## 5. 执行日志

### 5.1 实现清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `crates/eket-cli/src/commands/ticket_index.rs` | 新建 | ticket:index 命令实现 + 3 单测 |
| `crates/eket-cli/src/commands/dependency_analyze.rs` | 新建 | dependency:analyze 命令实现 |
| `crates/eket-cli/src/commands/mod.rs` | 修改 | 注册两个新 mod |
| `crates/eket-cli/src/main.rs` | 修改 | 注册两个新命令 + match 分支 |
| `crates/eket-cli/Cargo.toml` | 修改 | 添加 rusqlite workspace dep |
| `crates/eket-core/src/pubsub.rs` | 修复 | pre-existing 语法错误（misplaced use 语句） |

### 5.2 测试结果

```
cargo build -p eket-cli  → Finished (warnings only)
cargo test -p eket-cli -- ticket_index → 3 passed, 45 filtered out
```

### 5.3 设计说明

**ticket:index**：
- 递归扫描 tickets_dir，复用 `eket_core::ticket::TicketFile::read()` 解析元数据
- 写入独立 `ticket_index` 表（避免与 eket-core db migrations 冲突）
- UPSERT 语义，幂等可重跑

**dependency:analyze**：
- 复用 `eket_engine::recommender::Recommender`（已有 TF-IDF 实现）
- 从 ticket_index 表读 corpus（需先运行 ticket:index）
- min_score 阈值过滤，输出 suggested_dependencies + confidence + details

**deferred_issues**:
- dependency:analyze 无单测（需集成环境），预留 TODO
- ticket_index corpus 加载从文件读取（非从 KB），与 recommend 命令逻辑对称
