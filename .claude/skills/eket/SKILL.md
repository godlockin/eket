---
name: eket
description: EKET AI 智能体协作框架 - Master-Slaver 多智能体开发框架 (v2.9.2 / Node.js ≥20)
---

# EKET Framework — 命令索引

> 详细说明见 `SKILL-DETAIL.md`。搜索：`eket skill:search <keyword>`

## Trigger
启动eket / 领取任务 / slaver注册 / 系统诊断 / Master-Slaver协作 / gate review / 多智能体开发

## 架构快照

Hybrid: Rust(Core/CLI/SQLite/EventBus) + Node.js(Hook Server/Dashboard) + Shell(L0降级)

## Rust CLI 命令速查

| 命令 | 说明 |
|------|------|
| `eket task:claim [TASK-NNN]` | 原子领取任务 |
| `eket task:complete TASK-NNN` | Saga 5步完成 |
| `eket task:create "title"` | 创建 ticket |
| `eket task:test TASK-NNN` | 追加测试结果 |
| `eket task:resume TASK-NNN` | checkpoint 恢复 |
| `eket task:progress` | DAG进度+关键路径 |
| `eket task:handoff TASK-NNN --to slaver_2` | 任务转交 |
| `eket master:heartbeat` | Master心跳扫描派发 |
| `eket master:poll` | 处理Slaver上报 |
| `eket slaver:register --role backend` | 注册Slaver |
| `eket slaver:poll` | Slaver长轮询邮箱 |
| `eket epic:create <EPIC-ID> "title"` | 创建EPIC+需求文档 |
| `eket epic:plan <EPIC-ID>` | 生成架构计划文档 |
| `eket doc:status [--epic EPIC-NNN]` | 文档完整性检查 |
| `eket knowledge:index --dir jira/tickets/` | 索引知识库 |
| `eket knowledge:search "keyword"` | FTS搜索 |
| `eket recommend TASK-NNN` | TF-IDF推荐相关ticket |
| `eket expert:compose --skills tdd` | 组建专家组 |
| `eket gate:review TASK-NNN` | 执行前关卡审查 |
| `eket team:status` | 团队状态 |
| `eket system:doctor` | 系统诊断 |
| `eket server [--port 9877]` | 启动axum HTTP API |

## Node.js 命令速查

| 命令 | 说明 |
|------|------|
| `node dist/index.js instance:start --auto` | AI自动模式 |
| `node dist/index.js task:claim [id]` | 领取任务 |
| `node dist/index.js system:doctor` | 系统诊断 |
| `node dist/index.js web:dashboard --port 3000` | Web仪表盘 |
| `node dist/index.js gate:review <ticket-id>` | Gate审查 |
| `node dist/index.js redis:check` | Redis状态 |
| `node dist/index.js queue:test` | 消息队列测试 |

## 环境变量

`EKET_REDIS_HOST`(localhost) / `EKET_SQLITE_PATH` / `EKET_LOG_LEVEL`(info) / `OPENCLAW_API_KEY`

## 分支策略

`feature/*` → testing → main → miao（三分支同步：`bash scripts/sync-branches.sh`）

## 深度分析既存项目

检测到「分析/接手/重构评估/借鉴」需求时，先用 AskUserQuestion 询问分析模式（借鉴/接手/重构/快照）和团队配置（默认全栈/引导式定制），再执行。详见 `SKILL-DETAIL.md#preamble`。
