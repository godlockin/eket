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

1. 安装：`./scripts/setup.sh --level=2`
2. 启动 Master：`node dist/index.js instance:start --auto`
3. 领取任务：`node dist/index.js task:claim`
4. 系统诊断：`node dist/index.js system:doctor`
5. Web 仪表盘：`node dist/index.js web:dashboard --port 3000`

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
// 错误码定义：node/src/types/index.ts → EketErrorCode 枚举
// 失败示例：[ERROR] REDIS_CONNECTION_FAILED: Cannot connect to Redis at localhost:6379
```

## Branch Strategy

```
feature/{ticket-id}-{desc}  →  PR  →  testing  →  测试通过  →  PR  →  main
```

- `main`：严格保护，仅 Master 合并
- `testing`：保护，PR 合并需测试通过
- `feature/*`：开放，Slaver 开发使用

## References

- [architecture.md](references/architecture.md) — 三级降级架构、核心模块表、Master-Slaver 协作流程
- [dev-commands.md](references/dev-commands.md) — 构建/测试/发布完整命令参考
- [setup-guide.md](references/setup-guide.md) — 四层安装详细说明、环境变量表、常见问题
