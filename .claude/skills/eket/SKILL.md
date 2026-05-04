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
| `eket task:claim [TASK-NNN]` | 原子领取任务，自动创建 git worktree (.worktrees/TASK-NNN/) |
| `eket task:complete TASK-NNN` | Saga完成：标记done + 清理worktree + 通知依赖解除 |
| `eket task:create "title" --expertise rust,devops --effort 2d` | 创建ticket（专家标签必填，effort支持2d/0.5d/3h/480） |
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
| `eket expert:summon --role rust` | 按角色召唤/注册 Slaver 实例 |
| `eket expert:summon --from-waiting` | 批量召唤 waiting-for-expert 队列中缺失的专家 |
| `eket gate:review TASK-NNN` | 执行前关卡审查 |
| `eket team:status` | 团队状态 |
| `eket system:doctor` | 系统诊断 |
| `eket server [--port 9877]` | 启动axum HTTP API |

## 团队协作特性

| 特性 | 说明 |
|------|------|
| **worktree 隔离** | `task:claim` 自动 `git worktree add .worktrees/TASK-NNN`，`task:complete` 自动清理 |
| **专家标签** | `task:create` 必须传 `--expertise rust,devops`（或 `any`），`task:claim --role rust` 精准匹配 |
| **依赖解除通知** | `task:complete` 后扫描 `blocked_by`，依赖全解除时写 `.eket/state/unblocked-queue.json`，heartbeat 优先分发 |
| **expertise 精准派送** | heartbeat 读 `required_expertise` 匹配 slaver `role`/`skills`；无匹配时写 `waiting-for-expert.json` + inbox 提示 |
| **按需专家召唤** | `expert:summon --role <tag>` 自动注册匹配 slaver；`--from-waiting` 批量处理等待队列 |
| **专家 persona scaffold** | `task:create` 遇到未知 expertise tag 自动生成骨架文件到 `~/.claude/skills/eket/experts/extended/` |
| **knowledge 飞轮** | `task:claim` 自动推送相关 pitfalls/patterns；`task:complete` 触发 Curator 质量门；每5次 complete 重建索引 |

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
