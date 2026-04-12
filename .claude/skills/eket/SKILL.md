---
name: eket
description: EKET AI 智能体协作框架 - Master-Slaver 多智能体开发框架
---

# EKET Framework

## Trigger
当用户提到以下内容时自动调用此 skill：
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
