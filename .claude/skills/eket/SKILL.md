---
name: eket
description: EKET AI 智能体协作框架 - Master-Slaver 多智能体开发框架
---

# EKET Framework

## Preamble

当用户要求对**既存项目**进行深度分析时，在执行任何分析前，**必须**先用 AskUserQuestion 询问两个问题（依次，每次一个）：

---

### 问题 1：分析模式

```
项目：[当前项目名]
请选择分析模式：
```

| 选项 | 说明 | 专家组重点 |
|------|------|-----------|
| **A) 借鉴研究** | 研究外部项目，提炼可借鉴点 | 架构师 + 后端为主，产出"可借鉴点清单" |
| **B) 接手维护** | 全面了解既存项目，准备开发 | 全专家组，产出"风险清单 + 上手路径" |
| **C) 重构评估** | 评估技术债务和重构可行性 | 架构师 + 后端 + DevOps，产出"债务地图" |
| **D) 快速了解** | 5 分钟项目快照 | 仅架构师，产出简要全局视图 |

---

### 问题 2：团队配置

```
请选择团队加载方式：
```

| 选项 | 说明 |
|------|------|
| **A) 默认全栈专家组（推荐）** | Master + 5 专家，立即开始 |
| **B) 引导式定制** | 保留/裁剪默认专家，按需引入领域专家 |

**默认专家组**：

| 专家 | 职责 |
|------|------|
| 🏗️ 架构师 | 整体架构、模块划分、技术选型、依赖关系、系统边界 |
| 🖥️ 后端工程师 | 服务层、API 设计、数据模型、性能、安全、可扩展性 |
| 🎨 前端工程师 | 页面结构、组件拆分、状态管理、构建工具、框架使用 |
| 🖌️ UI/UX 设计师 | 交互逻辑、用户体验、设计一致性、可访问性 |
| 📋 产品经理 | 业务价值、功能完整性、用户故事、优先级合理性 |

**If B（引导式）：** 依次询问：

1. **保留哪些默认专家？**（多选）
   - ✅ 架构师（强烈建议保留）
   - ✅ 后端工程师
   - ✅ 前端工程师
   - ✅ UI/UX 设计师
   - ✅ 产品经理

2. **是否引入领域专家？**（多选，可选）
   - 🔒 安全专家 — 漏洞扫描、鉴权、数据安全
   - 📊 数据工程师 — 数据管道、存储、分析模型
   - ⚙️ DevOps 工程师 — CI/CD、部署、监控、基础设施
   - 🧪 QA 工程师 — 测试覆盖率、质量风险、边界场景
   - 💼 业务分析师 — 业务规则、合规、行业背景
   - 🤖 AI/ML 工程师 — 模型集成、推理链路、向量存储
   - 不引入，继续

---

### 执行流程（两问确认后）

```
Phase 1 — 架构师先行（全局扫描）
  └─ 产出：模块地图、技术栈、系统边界、核心依赖

Phase 2 — 其余专家并行（基于架构师报告各自展开）
  ├─ 后端工程师
  ├─ 前端工程师
  ├─ UI/UX 设计师
  ├─ 产品经理
  └─ [可选领域专家...]

Phase 3 — Master 汇总综合报告
```

### 专家 Persona 加载

每位专家有独立 persona 文件（存于 `~/.claude/skills/eket/experts/`），包含 personality、thinking_framework、analysis_focus 等详细设定。**执行分析时，读取对应专家文件以获得完整人物设定**：

| 专家 | 文件路径 |
|------|---------|
| 🏗️ 架构师 | `~/.claude/skills/eket/experts/default/architect.md` |
| 🖥️ 后端工程师 | `~/.claude/skills/eket/experts/default/backend.md` |
| 🎨 前端工程师 | `~/.claude/skills/eket/experts/default/frontend.md` |
| 🖌️ UI/UX 设计师 | `~/.claude/skills/eket/experts/default/ux.md` |
| 📋 产品经理 | `~/.claude/skills/eket/experts/default/product.md` |
| 🔒 安全专家 | `~/.claude/skills/eket/experts/optional/security.md` |
| 📊 数据工程师 | `~/.claude/skills/eket/experts/optional/data.md` |
| ⚙️ DevOps | `~/.claude/skills/eket/experts/optional/devops.md` |
| 🧪 QA | `~/.claude/skills/eket/experts/optional/qa.md` |
| 💼 业务分析师 | `~/.claude/skills/eket/experts/optional/business.md` |
| 🤖 AI/ML | `~/.claude/skills/eket/experts/optional/aiml.md` |

### 每位专家固定输出格式

```
## [专家角色] 分析报告

### 亮点（2-3条）
- ...

### 风险 / 问题（2-3条）
- ...

### 改进建议（按优先级）
1. [P0] ...
2. [P1] ...
3. [P2] ...
```

### Master 汇总报告结构

```
## 综合分析报告 — [项目名]

### 架构全景图
### 各维度亮点汇总
### 风险矩阵（影响 × 概率）
### 优先级改进路线图
```

> 此 Preamble 仅在「深度分析既存项目」场景触发，普通命令查询（如 task:claim、system:doctor）跳过。

---

## Trigger
当用户提到以下内容时自动调用此 skill：

**分析类（触发 Preamble）**：
- 分析项目 / 看看这个项目 / 研究一下 / 帮我了解
- 借鉴 / 调研 / 这个项目怎么样 / 深度分析
- 接手 / 熟悉代码库 / 看一下代码 / 项目审查
- 重构评估 / 技术债 / 快速了解

**命令类（直接执行，跳过 Preamble）**：
- 启动 eket / 初始化框架 / 配置 Master
- 领取任务 / slaver 注册 / task:claim
- 系统诊断 / Redis 检查 / system:doctor
- Master-Slaver 协作 / 多智能体开发
- eket 命令 / instance:start / web:dashboard
- 心跳监控 / heartbeat / Agent Pool
- 消息队列 / queue:test / circuit-breaker

## Quick Start（外部项目使用）

### Rust CLI（推荐，~21ms/cmd）

1. 检查环境：`bash scripts/setup.sh --check-rust` 或手动 `rustc --version`
   若无 Rust：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. 编译安装：`cd rust && cargo build --release && cp target/release/eket ~/.local/bin/`
3. 系统诊断：`eket system:doctor`
4. 注册 Slaver：`eket slaver:register --role backend --skills rust`
5. 领取任务：`eket task:claim`
6. 完成任务：`eket task:complete TASK-NNN`
7. 启动 API server：`eket server`（:9877）

### Node.js（Web Dashboard / LLM）

1. 安装：`./scripts/setup.sh --level=2`
2. 启动全栈：`node dist/index.js server:start`（自动拉起 Rust server）
3. Web 仪表盘：`node dist/index.js web:dashboard --port 3000`

## Commands

### Rust CLI（eket binary）

```bash
# 系统诊断
eket system:doctor

# 任务管理
eket task:create "ticket title" [--type feature] [--priority P1] [--blocked-by TASK-X]
eket task:claim [TASK-NNN]           # 原子领取，<21ms
eket task:complete TASK-NNN          # Saga 5步完成
eket task:resume TASK-NNN            # 从 checkpoint 恢复
eket task:progress                   # DAG 进度 + 关键路径

# Master 命令
eket master:heartbeat                # 扫描 ready → 分发（长期运行）
eket master:poll                     # 处理 TaskResult/Heartbeat

# Slaver 命令
eket slaver:register --role backend --skills rust,python
eket slaver:poll                     # 长轮询 mailbox（Ctrl+C 退出）

# 知识库
eket knowledge:index --dir jira/tickets/
eket knowledge:search "tokio async"
eket recommend TASK-NNN

# 团队 & 任务
eket team:status
eket task:handoff TASK-NNN --to slaver_2
eket gate:review TASK-NNN
eket submit:pr

# HTTP API
eket server [--port 9877] [--db-path ~/.eket/eket.db]
```

### Node.js（Web 层）

```bash
# AI 自动模式
node dist/index.js instance:start --auto

# 人工模式
node dist/index.js instance:start --human --role frontend_dev
node dist/index.js instance:set-role <role>
```

### 任务管理（Node.js 兼容层）

```bash
node dist/index.js task:claim [ticket-id]
node dist/index.js project:init
```

### 系统诊断

```bash
eket system:doctor                           # Rust 诊断
node dist/index.js system:doctor             # 整合诊断（含 Rust 状态）
node dist/index.js system:check
```

### Redis / SQLite 操作

```bash
node dist/index.js redis:check
node dist/index.js redis:list-slavers
node dist/index.js sqlite:check
node dist/index.js sqlite:list-retros
node dist/index.js sqlite:search "<keyword>"
node dist/index.js sqlite:report
```

### 监控服务

```bash
# Web 仪表盘（需 Rust server 已启动）
node dist/index.js web:dashboard --port 3000

# HTTP Hook 服务器（Agent 生命周期事件）
node dist/index.js hooks:start --port 8899

# OpenCLAW API 网关（需要 OPENCLAW_API_KEY）
node dist/index.js gateway:start --port 8080
```

### 心跳（Rust 推荐）

```bash
# Rust：长期运行 Master 心跳（扫描+分发）
eket master:heartbeat

# Node.js 兼容
node dist/index.js heartbeat:start <slaverId>
node dist/index.js heartbeat:status
```

### 消息队列 & Agent Pool（Node.js 层）

```bash
node dist/index.js queue:test
node dist/index.js pool:status
node dist/index.js pool:select -r <role>
```

## Development（内部开发）

参考 [references/dev-commands.md](references/dev-commands.md)

```bash
# Rust
cd rust && cargo build --release
cargo test --workspace
bash tests/e2e_smoke.sh

# Node.js
cd node && npm run build
npm test
npm run lint && npm run format
```

## Architecture

参考 [references/architecture.md](references/architecture.md)

四级降级：Shell(L0) → Rust(L1) → Node.js(L2) → Shell fallback(L3)

```
Level 0: Shell   lib/adapters/hybrid-adapter.sh    ← 100% 可用
Level 1: Rust    eket binary + axum :9877           ← 高性能核心 NEW
Level 2: Node.js web-server → 代理 Rust API         ← Web UI / LLM
Level 3: Shell fallback（Node 不可用时）
```

**Rust 核心模块**：
- `eket-core/election.rs` — 三级 Master 选举（Redis SETNX / SQLite / File）
- `eket-core/queue.rs` — 消息队列（Redis + 文件降级）
- `eket-core/circuit_breaker.rs` — 断路器（closed/open/half_open）
- `eket-core/cache.rs` — L1 moka + L2 Redis 二级缓存
- `eket-engine/workflow.rs` — 工作流状态机（tokio async）
- `eket-engine/agent_pool.rs` — Agent Pool（轮询/角色匹配）
- `eket-engine/event_bus.rs` — 事件总线（broadcast，死信队列）
- `eket-engine/monitors.rs` — HeartbeatMonitor + StaleCleaner
- `eket-server/lib.rs` — axum HTTP API（/health /api/v1/*）

## Setup Guide

参考 [references/setup-guide.md](references/setup-guide.md)

```bash
# Rust（推荐）
cd rust && cargo build --release
cp target/release/eket ~/.local/bin/

# Node.js（Web 层）
./scripts/setup.sh --level=2

# Skill 更新
./scripts/install-skill.sh --update
```

**初始化新项目**：

```bash
./scripts/init-project.sh <project-name> /path/to/project
./scripts/init-three-repos.sh <project-name> <org> <github|gitlab|gitee>
```

## Environment Variables

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_SQLITE_PATH` | SQLite 数据库路径 | `~/.eket/data/sqlite/eket.db` |
| `EKET_TICKETS_DIR` | Ticket 目录 | `./jira/tickets` |
| `EKET_MAILBOX_DIR` | Mailbox 目录 | `~/.eket/mailbox` |
| `EKET_SERVER_PORT` | Rust HTTP server 端口 | `9877` |
| `OPENCLAW_API_KEY` | OpenCLAW Gateway API Key（≥16 字符） | 无 |
| `EKET_REMOTE_REDIS_HOST` | 远程 Redis | 无 |
| `EKET_LOG_LEVEL` | 日志级别（debug/info/warn/error） | `warn` |

## Error Handling

**Rust**：返回 `Result<T, EketError>`，CLI 输出 JSON + exit(1)：

```rust
// 失败示例：{"success": false, "error": "ticket TASK-042 not found"}
```

**TypeScript（保留层）**：

```typescript
// 错误码定义：node/src/types/index.ts → EketErrorCode 枚举
// 失败示例：[ERROR] REDIS_CONNECTION_FAILED: Cannot connect to Redis at localhost:6379
```

## Branch Strategy

```
feature/{ticket-id}-{desc}  →  PR  →  testing  →  测试通过  →  PR  →  miao  →  main
```

- `main`：严格保护，仅 Master 合并
- `testing`：保护，PR 合并需测试通过
- `miao`：预发布分支
- `feature/*`：开放，Slaver 开发使用

## References

- [architecture.md](references/architecture.md) — 四级降级架构、Rust/Node 模块表、Master-Slaver 协作流程
- [dev-commands.md](references/dev-commands.md) — Rust + Node.js 构建/测试/发布完整命令参考
- [setup-guide.md](references/setup-guide.md) — 四层安装详细说明、环境变量表、常见问题
