---
name: eket
description: EKET AI 智能体协作框架 - Master-Slaver 多智能体开发框架 (v2.9.2 / Node.js ≥20 / EPIC-004 完成)
---

# EKET Framework

## Preamble

当用户要求对**既存项目**进行深度分析时，在执行任何分析前，**必须**先用 AskUserQuestion 询问团队加载方式：

```
项目：[当前项目名]
检测到既存项目，需要组建分析团队。请选择加载方式：
```

选项：
- **A) 默认组合（推荐）** — Master + 3 Slaver（fullstack / frontend / backend），立即开始
- **B) 引导式加载** — 逐步选择角色、专长、并发数

**If A：** 直接用默认配置初始化团队，执行分析。

**If B：** 依次用 AskUserQuestion 询问（每次一个问题）：
1. 需要几个 Slaver？（1 / 2 / 3 / 自定义）
2. 每个 Slaver 的角色？（从 `instance:start --list-roles` 列表选）
3. 专长方向？（fullstack / frontend / backend / devops / qa / 自定义）
4. 确认配置后初始化团队，开始分析。

> 此 Preamble 仅在「深度分析既存项目」场景触发，普通命令查询跳过。

---

## Trigger
当用户提到以下内容时自动调用此 skill：
- 启动 eket / 初始化框架 / 配置 Master
- 领取任务 / slaver 注册 / task:claim
- 系统诊断 / Redis 检查 / system:doctor
- Master-Slaver 协作 / 多智能体开发
- eket 命令 / instance:start / web:dashboard
- 心跳监控 / heartbeat / Agent Pool
- 消息队列 / queue:test / circuit-breaker
- gate review / gate:review / 执行前关卡 / ticket 审查 / veto / 否决

## Current State (2026-04-21, Round 25 后)

EKET 当前是 **Hybrid 架构**：

| 层 | 实现 | 路径 |
|---|---|---|
| Core 控制面 / CLI / SQLite / EventBus | **Rust** (axum + tokio) | `rust/crates/eket-{core,engine,server,cli}` |
| Hook Server (28 种 Agent 生命周期事件 + PermissionChecker) | **Node.js** | `node/src/hooks/http-hook-server.ts` |
| Dashboard / Web UI | **Node.js** | `node/src/api/eket-server.ts` |
| 三级降级（Redis/SQLite/File）| **Node.js**（Rust 端走 SQLite-first） | `node/src/core/` |

### Toolchain 要求

- **Node.js**：必装 (`cd node && npm install && npm run build` → 产出 `node/dist/`)
- **Rust**：1.75+ (推荐 stable)，安装 `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **首次编译**：`cd rust && cargo build --release` → 产出单一二进制 `rust/target/release/eket`（CLI + server 子命令二合一）
- 不装 Rust 也能用旧 Node 命令；用新 Rust CLI 必须先编

### Active Gaps（Round 25 后待修复，已立卡）

| 卡号 | 主题 | 优先级 | 状态 |
|---|---|---|---|
| TASK-139 | Hook Server 全 Rust 化（两阶段） | P1 | backlog |
| TASK-140 | DAG 中间件能力重建 | P3 暂缓 | blocked-by-real-use-case |
| TASK-141 | SSE 5态事件流补完 | **P0** | Sprint 1 |
| TASK-142 | task:resume 降级 + Redis 角色 ADR | P2 | backlog |

详见 `jira/decisions/2026-04-21-round25-gap-resolution.md`（专家组综合决策）

---

## Quick Start（外部项目使用）

### 选项 A：旧 Node 路径（稳定）

1. 安装：`./scripts/setup.sh --level=2`
2. 启动 Master：`node dist/index.js instance:start --auto`
3. 领取任务：`node dist/index.js task:claim`
4. 系统诊断：`node dist/index.js system:doctor`
5. Web 仪表盘：`node dist/index.js web:dashboard --port 3000`

### 选项 B：新 Rust CLI（Round 25 起可用）

```bash
cd rust && cargo build --release           # 首次编译（~2.5 分钟）
./target/release/eket --help               # 列出全部子命令
./target/release/eket task:claim           # 领取任务
./target/release/eket task:complete        # 完成任务（Saga + 回滚）
./target/release/eket slaver:register      # 注册 Slaver
./target/release/eket slaver:poll          # Slaver 长轮询邮箱
./target/release/eket master:heartbeat     # Master 心跳（扫 ready ticket 派发）
./target/release/eket master:poll          # Master 处理 Slaver 上报
./target/release/eket system:doctor        # 系统诊断
./target/release/eket server               # 启动 axum HTTP API（/api/v1/*）
./target/release/eket knowledge:search "keyword"  # FTS 搜索
./target/release/eket recommend <ticket>   # TF-IDF 推荐
```

可用子命令完整列表：`./target/release/eket --help` 或看 `rust/crates/eket-cli/src/commands/`

### Rust CLI 完整命令速查

```bash
# 任务
eket task:claim [TASK-NNN]
eket task:complete TASK-NNN [--no-trailer]
eket task:create "title" [--type feature] [--priority P1] [--blocked-by TASK-X]
eket task:test TASK-NNN
eket task:resume TASK-NNN
eket task:progress
eket task:handoff TASK-NNN --to slaver_2

# Master
eket master:heartbeat
eket master:poll

# Slaver
eket slaver:register --role backend --skills rust,python
eket slaver:poll
eket slaver:set-role <role>

# 知识库
eket knowledge:index --dir jira/tickets/
eket knowledge:search "keyword"
eket recommend TASK-NNN

# 团队 & 项目
eket team:status
eket project:status
eket workflow:status

# 数据库
eket db:migrate
eket db:status

# 票据 & 依赖
eket ticket:index
eket dependency:analyze

# 文档体系
eket doc:status [--epic EPIC-NNN]   # 检查 EPIC 文档完整性
eket doc:create <type>              # type: design|adr|runbook|onboarding

# EPIC / Sprint
eket epic:create <EPIC-ID> "title"  # 创建 EPIC + confluence/requirements/<EPIC>-analysis.md
eket epic:plan <EPIC-ID>            # 生成/刷新架构计划 confluence/architecture/<EPIC>-plan.md

# Roadmap / Spike
eket roadmap:update
eket spike:create "title"
eket spike:complete SPIKE-NNN

# 专家系统
eket expert:compose --skills tdd,systematic-debugging
eket expert:compose --epic EPIC-001
eket expert:skills <expert-id>
eket expert:search "keyword" [--pkg default|extended] [--limit 10]

# 其他
eket gate:review TASK-NNN
eket submit:pr
eket skill:extract
eket alerts:list
eket system:doctor
eket server [--port 9877]
eket version
```

## Commands

### 实例管理

```bash
# AI 自动模式（自动选择角色）
node dist/index.js instance:start --auto

# 人工模式（手动指定角色）
node dist/index.js instance:start --human --role frontend_dev

# 列出所有可用角色
node dist/index.js instance:start --list-roles

# 设置当前实例角色
node dist/index.js instance:set-role <role>
```

### 任务管理

```bash
# 领取任务（自动匹配角色）
node dist/index.js task:claim

# 领取指定 ticket
node dist/index.js task:claim <ticket-id>

# 初始化项目
node dist/index.js project:init
```

### 系统诊断

```bash
# 完整系统诊断（推荐首次运行）
node dist/index.js system:doctor

# 快速系统检查
node dist/index.js system:check
```

### Redis 操作

```bash
# 检查 Redis 连接状态
node dist/index.js redis:check

# 列出所有已注册 Slaver
node dist/index.js redis:list-slavers
```

### SQLite 操作

```bash
# 检查 SQLite 连接
node dist/index.js sqlite:check

# 列出所有回顾记录
node dist/index.js sqlite:list-retros

# 搜索知识库
node dist/index.js sqlite:search "<keyword>"

# 生成项目报告
node dist/index.js sqlite:report
```

### 监控服务

```bash
# 启动 Web 仪表盘
node dist/index.js web:dashboard --port 3000

# 启动 HTTP Hook 服务器（Agent 生命周期事件）
node dist/index.js hooks:start --port 8899

# 启动 OpenCLAW API 网关（需要 OPENCLAW_API_KEY）
node dist/index.js gateway:start --port 8080
```

### 心跳

```bash
# 启动心跳（保持 Slaver 在线状态）
node dist/index.js heartbeat:start <slaverId>

# 查看心跳状态
node dist/index.js heartbeat:status
```

### 消息队列 & Agent Pool

```bash
# 测试消息队列连通性
node dist/index.js queue:test

# 查看 Agent Pool 状态
node dist/index.js pool:status

# 按角色选择 Agent
node dist/index.js pool:select -r <role>
```

### Gate Review（执行前关卡）

```bash
# 审查指定 ticket（gate_review 状态才会触发）
node dist/index.js gate:review <ticket-id>

# 扫描所有待审查 ticket
node dist/index.js gate:review --scan-all

# 预演审查，不写文件
node dist/index.js gate:review <ticket-id> --dry-run

# 强制否决（填入否决原因）
node dist/index.js gate:review <ticket-id> --force-veto "依赖未完成"

# 强制通过（跳过所有检查）
node dist/index.js gate:review <ticket-id> --auto-approve
```

> **死锁防止**：同一 ticket 被否决 ≥ 2 次，第 3 次 gate:review 自动强制通过。
> 审查报告写入 `confluence/audit/gate-review-reports/`，
> 不可篡改审计日志写入 `confluence/audit/gate-review-log.jsonl`（SHA256 hash 链）。

## Development（内部开发）

参考 [references/dev-commands.md](references/dev-commands.md)

快速：

```bash
# 构建（TypeScript → dist/）
cd node && npm run build

# 运行所有测试
cd node && npm test

# 运行单个测试文件
npm test -- --testPathPattern=<pattern>

# 开发模式（无需构建）
npm run dev -- <command>

# 代码检查
npm run lint
npm run lint:fix

# 格式化
npm run format

# 清理构建产物
npm run clean
```

## Architecture

参考 [references/architecture.md](references/architecture.md)

三级降级：Level 3(Redis+SQLite) → Level 2(Node+文件队列) → Level 1(Shell)

```
Level 3: Redis + SQLite     # 生产级高并发，完整功能
    ↓ Redis 不可用
Level 2: Node.js + 文件队列  # .eket/data/queue/*.json（去重+归档）
    ↓ Node.js 不可用
Level 1: Shell 脚本          # lib/adapters/hybrid-adapter.sh 基础模式
```

**核心模块**：
- `core/master-election.ts` — 三级 Master 选举（Redis SETNX / SQLite / File mkdir）
- `core/connection-manager.ts` — 四级降级连接管理
- `core/message-queue.ts` — 消息队列（Redis Pub/Sub + 文件降级）
- `core/circuit-breaker.ts` — 断路器（closed/open/half_open）
- `core/cache-layer.ts` — LRU 内存缓存 + Redis 二级缓存
- `core/agent-pool.ts` — Agent Pool 管理（负载均衡、角色选择）
- `core/workflow-engine.ts` — 工作流引擎（预定义协作流程）
- `core/event-bus.ts` — 事件总线（DomainEvent、死信队列）
- `core/alerting.ts` — 四级告警 + 多渠道通知

## Setup Guide

参考 [references/setup-guide.md](references/setup-guide.md)

```bash
./scripts/setup.sh           # 交互式安装
./scripts/setup.sh --all     # 全部安装
./scripts/setup.sh --level=2 # 只装到 Node.js（推荐）
./scripts/setup.sh --level=1 # 仅 Shell 基础版
```

**初始化新项目**：

```bash
# 从框架初始化新项目
./scripts/init-project.sh <project-name> /path/to/project

# 初始化三仓库（需 Git 平台 token）
./scripts/init-three-repos.sh <project-name> <org> <github|gitlab|gitee>

# 启用 Node.js 高级功能
./scripts/enable-advanced.sh
```

## Environment Variables

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_API_KEY` | OpenCLAW Gateway API Key（≥16 字符） | 无 |
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_SQLITE_PATH` | SQLite 数据库路径 | `~/.eket/data/sqlite/eket.db` |
| `EKET_REMOTE_REDIS_HOST` | 远程 Redis | 无 |
| `EKET_LOG_LEVEL` | 日志级别（debug/info/warn/error） | `info` |

## Error Handling

所有命令返回 `Result<T>` 类型，失败时输出错误码并以非零退出：

```typescript
// 错误码定义：node/src/types/common.ts → EketErrorCode 枚举（barrel re-export via index.ts）
// 失败示例：[ERROR] REDIS_CONNECTION_FAILED: Cannot connect to Redis at localhost:6379
```

## Branch Strategy

```
feature/{ticket-id}-{desc}  →  PR  →  testing  →  main  →  miao
```

- `main`：稳定主干，长期集成，PR + CI 必须
- `testing`：测试集成，CI 覆盖
- `miao`：发布快照，接收 main 同步（`git merge -X ours`）
- `feature/*`：开放，Slaver 开发使用

**三分支同步**：`bash scripts/sync-branches.sh`（main→testing→miao 一键对齐）
**Drift 检测**：`bash scripts/check-branch-drift.sh`（内容感知，非 commit 计数）

## References

- [architecture.md](references/architecture.md) — 三级降级架构、核心模块表、Master-Slaver 协作流程
- [dev-commands.md](references/dev-commands.md) — 构建/测试/发布完整命令参考
- [setup-guide.md](references/setup-guide.md) — 四层安装详细说明、环境变量表、常见问题

## Rust Workspace（rust/crates/）

| Crate | 职责 | 关键模块 |
|---|---|---|
| `eket-core` | 类型 / SQLite / DAG / Saga | `db.rs`、`ticket.rs`、`saga.rs`、`dag.rs` |
| `eket-engine` | 运行时引擎 | `event_bus.rs` (broadcast)、`workflow.rs`、`monitors.rs` (StaleCleaner)、`mailbox.rs`、`agent_pool.rs`、`recommender.rs`、`knowledge.rs` |
| `eket-server` | axum HTTP API | `lib.rs`（/api/v1/* 路由）、`main.rs` |
| `eket-cli` | CLI + 嵌入式 server | 编译产物：单一二进制 `eket`。子命令：task:claim/complete/create/resume/progress/handoff、slaver:register/poll、master:heartbeat/poll、gate:review、submit:pr、knowledge:index/search、recommend、team:status、system:doctor、server |

**测试**：`cd rust && cargo test --workspace`；e2e: `bash rust/tests/e2e_smoke.sh`；bench: `bash rust/tests/bench_claim.sh`
