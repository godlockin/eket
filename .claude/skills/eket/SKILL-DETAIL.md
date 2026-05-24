# EKET Framework — 详细文档

> 索引见 `SKILL-INDEX.md`（SessionStart 注入）。本文件按需读取。

## Preamble（深度分析模式）{#preamble}

当用户要求对**既存项目**进行深度分析时，先用 AskUserQuestion 询问两个问题：

**问题1 — 分析模式**：
- A) 借鉴研究：研究外部项目，产出"可借鉴点清单"
- B) 接手维护：全面了解，产出"风险清单+上手路径"
- C) 重构评估：产出"债务地图"
- D) 快速了解：5分钟项目快照

**问题2 — 团队配置**：
- A) 默认全栈专家组（推荐）：Master + 5专家
- B) 引导式定制：保留/裁剪默认专家

默认专家：🏗️架构师 / 🖥️后端 / 🎨前端 / 🖌️UX / 📋产品经理

执行流程：Phase1 架构师先行（全局扫描）→ Phase2 其余专家并行 → Phase3 Master汇总

---

## Current State（2026-04-21 Round25后）

Active Gaps：
- TASK-139：Hook Server全Rust化（P1 backlog）
- TASK-141：SSE 5态事件流补完（P0 Sprint1）
- TASK-142：task:resume降级+Redis角色ADR（P2 backlog）

---

## Rust CLI 完整命令详解

### 任务管理
```bash
eket task:claim [TASK-NNN]                              # 原子领取，<21ms
eket task:complete TASK-NNN [--no-trailer]              # Saga 5步完成+回滚
eket task:create "title" [--type feature] [--priority P1] [--blocked-by TASK-X]
eket task:test TASK-NNN                                 # 追加测试结果section
eket task:resume TASK-NNN                               # 从checkpoint恢复
eket task:progress                                      # DAG进度+关键路径
eket task:handoff TASK-NNN --to slaver_2               # 任务转交
```

### Master/Slaver
```bash
eket master:heartbeat      # 扫描ready→分发（长期运行）
eket master:poll           # 处理TaskResult/Heartbeat
eket slaver:register --role backend --skills rust,python
eket slaver:poll           # 长轮询mailbox（Ctrl+C退出）
eket slaver:set-role <role>
```

### EPIC / 文档
```bash
eket epic:create <EPIC-ID> "title"   # 创建EPIC + confluence/requirements/<EPIC>-analysis.md
eket epic:plan <EPIC-ID>             # 生成confluence/architecture/<EPIC>-plan.md
eket doc:status [--epic EPIC-NNN]    # 检查文档完整性，输出缺失清单JSON
eket doc:create <type>               # type: design|adr|runbook|onboarding
```

### 知识库 & 专家
```bash
eket knowledge:index --dir jira/tickets/
eket knowledge:search "tokio async"
eket recommend TASK-NNN
eket expert:compose --skills tdd,systematic-debugging
eket expert:compose --epic EPIC-001
eket expert:skills <expert-id>
eket expert:search "keyword" [--pkg default|extended] [--limit 10]
```

### 其他
```bash
eket roadmap:update
eket spike:create "title"
eket spike:complete SPIKE-NNN
eket gate:review TASK-NNN
eket gate:review --scan-all
eket gate:review TASK-NNN --dry-run
eket gate:review TASK-NNN --force-veto "原因"
eket gate:review TASK-NNN --auto-approve
eket submit:pr
eket skill:extract
eket alerts:list
eket db:migrate / eket db:status
eket ticket:index / eket dependency:analyze
eket team:status / eket project:status / eket workflow:status
eket system:doctor
eket server [--port 9877]
eket version
```

> Gate Review 死锁防止：同一ticket被否决≥2次，第3次自动强制通过。
> 审查报告：`confluence/audit/gate-review-reports/`
> 不可篡改日志：`confluence/audit/gate-review-log.jsonl`（SHA256 hash链）

---

## Node.js 完整命令

### 实例管理
```bash
node dist/index.js instance:start --auto
node dist/index.js instance:start --human --role frontend_dev
node dist/index.js instance:start --list-roles
node dist/index.js instance:set-role <role>
```

### 监控服务
```bash
node dist/index.js web:dashboard --port 3000
node dist/index.js hooks:start --port 8899
node dist/index.js gateway:start --port 8080
node dist/index.js heartbeat:start <slaverId>
node dist/index.js heartbeat:status
node dist/index.js queue:test
node dist/index.js pool:status
node dist/index.js pool:select -r <role>
```

### SQLite / Redis
```bash
node dist/index.js sqlite:check / sqlite:list-retros / sqlite:search "<kw>" / sqlite:report
node dist/index.js redis:check / redis:list-slavers
node dist/index.js system:doctor / system:check
node dist/index.js project:init
```

---

## 架构详解

### Rust Workspace（rust/crates/）

| Crate | 职责 | 关键模块 |
|---|---|---|
| `eket-core` | 类型/SQLite/DAG/Saga | `db.rs`、`ticket.rs`、`saga.rs`、`dag.rs` |
| `eket-engine` | 运行时引擎 | `event_bus.rs`、`workflow.rs`、`monitors.rs`、`mailbox.rs`、`agent_pool.rs`、`recommender.rs`、`knowledge.rs` |
| `eket-server` | axum HTTP API | `lib.rs`（/api/v1/* 路由）、`main.rs` |
| `eket-cli` | CLI+嵌入server | 单一二进制`eket` |

### Node.js 核心模块
- `core/master-election.ts` — 三级Master选举（Redis SETNX/SQLite/File）
- `core/message-queue.ts` — 消息队列（Redis Pub/Sub + 文件降级）
- `core/dual-track-router.ts` — 双轨制自适应降级运行引擎 (Track A: Rust Core, Track B: Node.js Fallback) (TASK-Z03)
- `core/state-reconciler.ts` — WAL 降级消息重放与状态自愈对齐 (TASK-Y01)
- `core/circuit-breaker.ts` — 断路器（closed/open/half_open）
- `core/cache-layer.ts` — LRU内存缓存 + Redis二级缓存
- `core/agent-pool.ts` — Agent Pool（负载均衡、角色选择）
- `core/workflow-engine.ts` — 工作流引擎
- `utils/semantic-validator.ts` — AI 语义级计划质量审查门禁 (TASK-Y02)

### 降级架构
```
Level 3: Redis + SQLite       # 生产级
    ↓ Redis不可用
Level 2: Node.js + 文件队列   # .eket/data/queue/*.json
    ↓ Node.js不可用
Level 1: Shell                # lib/adapters/hybrid-adapter.sh
```

---

## Setup

```bash
./scripts/setup.sh --level=2    # 推荐
cd rust && cargo build --release
./scripts/init-project.sh <project-name> /path/to/project
```

## Error Handling

Rust返回`Result<T, EketError>`，CLI输出JSON + exit(1)。
Node.js错误码：`node/src/types/index.ts → EketErrorCode`

## References

- `references/architecture.md` — 完整架构
- `references/dev-commands.md` — 构建/测试/发布
- `references/setup-guide.md` — 安装指南
