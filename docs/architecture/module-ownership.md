# Module Ownership Map

**状态**: Draft v0.1（2026-04-17）
**维护**: 所有 `core/` / `commands/` / `api/` / `skills/` 模块必须归入下列之一
**用途**: 指导 Phase 0 夯基工作 — 共同核心要 Shell 对等实现，Node-only 无需

---

## 分类说明

| 标签 | 含义 | 要求 |
|------|------|------|
| `[shared-core]` | 跨引擎核心功能 | **必须**有 Shell 对应实现；FS 行为字节级等价 |
| `[node-only]` | Node 独有增强能力 | Shell 不需对应；下线时退化到"没此功能"而非"错误" |
| `[deprecated]` | 待删废弃模块 | 不允许在新代码中引用；到期直接删 |
| `[unclear]` | 归属未决 | **不允许超过 3 个**；必须尽快决策 |

---

## core/ 模块分类

### [shared-core] — 16 个（必须与 Shell 等价）

| 模块 | Shell 对应 | 说明 |
|------|-----------|------|
| `agent-mailbox.ts` | `scripts/manage.sh` (部分) | Agent 邮箱文件读写 |
| `agent-pool.ts` | `scripts/eket-start.sh` + slavers/ 目录 | 节点池管理 |
| `communication-protocol.ts` | `lib/state/message.sh` (待建) | 消息协议定义 |
| `conflict-resolver.ts` | `scripts/merge-validator.sh` | 冲突解决 |
| `context-snapshot.ts` | 待建 | 快照协议 |
| `file-queue-manager.ts` | `scripts/manage.sh` | 文件队列核心 |
| `heartbeat-monitor.ts` | `scripts/slaver-heartbeat.sh` `scripts/heartbeat-monitor.sh` | 心跳协议 |
| `instance-registry.ts` | `.eket/state/agents.json` 直写 | 节点注册 |
| `master-context.ts` | 待建 | Master 状态序列化 |
| `master-election.ts` | 待建（`lib/state/election.sh`） | 选举协议 |
| `message-bus.ts` | `scripts/manage.sh` | 消息总线 |
| `message-queue.ts` | `scripts/manage.sh` + inbox/outbox | 消息队列 |
| `mindset-loader.ts` | `scripts/load-agent-profile.sh` | 规则加载 |
| `optimized-file-queue.ts` | 同 `file-queue-manager` | **重复**，与 file-queue-manager 二选一 |
| `role-selector.ts` | `scripts/load-agent-profile.sh` | 角色匹配 |
| `slaver-rules.ts` | `template/docs/SLAVER-RULES.md` | 规则文本（应迁到 protocol/） |
| `task-assigner.ts` | `scripts/recommend-tasks.sh` | 任务分配 |

> `workflow-engine.ts` 原列为 [shared-core]，因 DAG 编排在纯 Shell 中难以等效实现，已重分类为 [node-only]。

### [node-only] — 15 个（Shell 无需对应）

| 模块 | 原因 |
|------|------|
| `alerting.ts` | 告警系统，外环增强 |
| `cache-layer.ts` | LRU 缓存，性能层 |
| `circuit-breaker.ts` | Node 进程内控制 |
| `connection-manager.ts` | Node 网络连接池 |
| `dependency-analyzer.ts` | 分析工具 |
| `event-bus.ts` | Node 进程内事件 |
| `event-graph.ts` | SQLite 图分析 |
| `history-tracker.ts` | 历史查询增强 |
| `knowledge-base.ts` | 向量/SQLite 知识库 |
| `recommender.ts` | 智能推荐 |
| `redis-client.ts` | Redis 加速层（Level 3） |
| `sessions-websocket.ts` | 实时 WebSocket |
| `sharding.ts` | 扩展性 |
| `skill-executor.ts` | Skill 执行引擎 |
| `skill-generator.ts` | Skill 代码生成 |
| `websocket-message-queue.ts` | WebSocket 传输 |
| `workflow-engine.ts` | DAG 工作流编排（Shell 难以等效实现） |

### [node-only] SQLite 家族（待合并）

| 模块 | 处置 |
|------|------|
| `sqlite-manager.ts` | **保留**（统一入口） |
| `sqlite-async-client.ts` | **保留**（Worker 异步） |
| `sqlite-sync-adapter.ts` | **保留**（向后兼容适配） |
| `sqlite-client.ts` | `[deprecated]` — 已打 `@deprecated`（见 TASK-005），待删 |
| `sqlite-shared.ts` | **保留**（工具函数） |

### [deprecated] — 待删

- `sqlite-client.ts`（见上）
- `optimized-file-queue.ts` **或** `file-queue-manager.ts`（二选一）

### [unclear] — 待决策（≤ 3）

目前 0 项。

---

## commands/ 模块分类

### [shared-core] — 核心命令（Shell 必须对等）

| 模块 | Shell 对应 |
|------|-----------|
| `claim.ts` | `scripts/` 待建 `claim-task.sh` |
| `submit-pr.ts` | 待建 `submit-pr.sh` |
| `set-role.ts` | `scripts/load-agent-profile.sh` |
| `slaver-register.ts` | `scripts/eket-start.sh` slaver 分支 |
| `slaver-poll.ts` | `scripts/slaver-heartbeat.sh` |
| `master-poll.ts` | `scripts/heartbeat-monitor.sh` |
| `master-heartbeat.ts` | 同上 |
| `start-instance.ts` | `scripts/eket-start.sh` |
| `ticket-index.ts` | 待建 `ticket-index.sh` |
| `team-status.ts` | `scripts/quick-stats.sh` |
| `handoff.ts` | 待建 |
| `task-resume.ts` | 待建 |
| `claim-helpers.ts` | `scripts/load-agent-profile.sh` + inbox 写入助手 |

### [node-only] — Node 增强命令

| 模块 | 说明 |
|------|------|
| `alerts.ts` | 告警（配合 `core/alerting.ts`） |
| `dependency-analyze.ts` | 图分析 |
| `gate-review.ts` | 自动门禁审查 |
| `graph-query.ts` | SQLite 图查询 |
| `init-wizard.ts` | 交互式初始化（Shell 有 `init-project.sh`，功能不完全对等） |
| `interactive-start.ts` | Inquirer 交互 |
| `recommend.ts` | 智能推荐 |
| `server-start.ts` | HTTP 服务启动 |
| `skill-extract.ts` | Skill 代码生成 |

---

## api/ 模块分类（全部 [node-only]）

所有 `api/` 下模块均为 Node 独有外环。Shell 无需对应，下线时用户失去 HTTP/WebSocket 能力但核心协作不受影响。

- `eket-server.ts` · `web-server.ts` · `openclaw-gateway.ts`
- `audit-logger.ts` · `data-access.ts` · `data-deletion.ts`
- `redis-helper.ts` · `bridge/*` · `middleware/*` · `routes/*` · `examples/*`

**约束**：api/ 层**不允许直写** `jira/` / `inbox/` / `outbox/`，必须通过 `core/state/writer.ts`（Task 0.4）。

---

## skills/ 分类

**整体归属**: `[node-only]`（Shell 不需对应）

**瘦身目标**（Phase 0 / Task 0.6）：19 子目录 → ≤ 8

保留候选（高使用率）：
- `requirements/` · `analysis/` · `design/` · `development/`
- `implementation/` · `review/` · `testing/` · `documentation/`

待删（使用率低 / 过度抽象）：
- `algorithm/` · `data/` · `devops/` · `hr/` · `llm/`
- `ops/` · `planning/` · `security/` · `ux/`

**决策**: Phase 0 末做使用率统计，< 3 次调用的子目录删除。

---

## 约束清单（Phase 0 执行期间）

1. **新增模块必须同时更新本文件**，否则 PR 拒合
2. **所有对共享 FS 目录的写入**（`jira/` / `inbox/` / `outbox/` / `shared/` / `.eket/state/`），无论 `[shared-core]` 还是 `[node-only]`，**必须通过** `lib/state/` (Shell) 或 `node/src/core/state/writer.ts` (Node)。直接 `fs.writeFile` / `cat >` 一律拒合。
3. **`[shared-core]` 模块额外要求**：双引擎（Shell + Node）必须产出字节等价的 FS 结果（由 `tests/dual-engine/` 验证）
4. **`[deprecated]` 模块不允许新引用**；CI 扫描新增 import 拒合
5. **`[unclear]` 超 3 个时**触发架构评审会议

> **例外标注**：确有必要绕过 writer 层时（如 init 脚手架首次创建空目录），必须在代码中加注释 `// allow: shared-fs-write reason: <...>` 并在下次 Phase 评审时讨论是否补入 writer。

---

## 决策日志

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-04-17 | v0.1 初稿 | Phase 0 启动，Task 0.1 产出 |
