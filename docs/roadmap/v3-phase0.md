# EKET v3 Phase 0 — 夯基路线图

**状态**: Draft
**创建**: 2026-04-17
**目标期限**: 6 周（硬截止）
**原则**: 冻结新功能，专注架构收口

---

## 背景

当前 EKET 已出现结构性风险：
- **Node/Shell 各写各的 FS 状态**：审计发现 Node 58 处 `writeFile`，Shell 51 处 `cat >`，**无共享 writer**
- **无权威协议**：ticket/message/heartbeat 格式靠约定俗成
- **无等价性测试**：三级降级是口号，非验证事实
- **文档/代码膨胀**：根目录 14 个 MD、`core/` 40 个 ts、`skills/` 19 子目录

继续加功能只会加深漂移。Phase 0 的唯一工作：**把"双引擎 + 同心圆"架构落地到代码与测试**。

---

## 架构心智图（冻结为 v3 设计基准）

```
           Human / IM / Webhook / IDE / AI
                        ↓
       ┌────────────────────────────────────┐
       │ Node 独有外环 (Node-only)          │
       │ Web UI · API Gateway · IM Adapters │
       │ 实时推送 · 向量搜索 · 智能推荐       │
       └────────────────────────────────────┘
                        ↓
       ┌────────────────────────────────────┐
       │ 共同核心 (Shared Core Protocol)    │
       │ ticket 状态机 · 消息队列 · 心跳      │
       │ 选举 · 节点身份 · 审计              │
       └────────────────────────────────────┘
             ↑ (Shell)          ↑ (Node)
       lib/state/*.sh     node/src/core/*.ts
         两套实现，行为等价，FS 字节级一致
                        ↓
       可选共享缓存：Redis · SQLite（FS 的投影）
```

---

## 六项硬任务

### Task 0.1 — 模块归属分类 `OWNERSHIP.md`
**产出**: [`node/src/OWNERSHIP.md`](../../node/src/OWNERSHIP.md)
**验收**: 所有 `core/` + `commands/` + `api/` 模块明确归入 `[shared-core]` / `[node-only]` / `[deprecated]`；`[unclear]` ≤ 3
**当前状态**: 初稿已出

### Task 0.2 — 协议 Schema 化
**产出**: `protocol/` 目录
```
protocol/
├── VERSION                               # 协议版本号（Shell + Node 启动校验）
├── schemas/
│   ├── ticket.meta.schema.yml            # ticket Markdown 元数据块
│   ├── message.schema.json               # 消息队列消息
│   ├── node.profile.schema.json          # 节点身份（为 Phase 1 预留）
│   └── heartbeat.schema.json
├── state-machines/
│   └── ticket-status.yml                 # 状态转移表（唯一真相）
└── conventions/
    ├── atomic-write.md                   # tmp + rename 协议
    ├── file-locking.md                   # flock 协议
    └── node-id.md                        # 节点 ID 生成规则
```
**验收**: Shell / Node 所有读写必须通过 schema 校验；`protocol/VERSION` 不匹配时启动报错
**当前状态**: 目录骨架已出

### Task 0.3 — Shell 权威写入层 `lib/state/`
**产出**:
```
lib/state/
├── writer.sh       # state_write_ticket / state_transition_ticket / ...
├── reader.sh       # state_read_ticket / state_list_tickets / ...
├── schema.sh       # 读 protocol/schemas/ 校验
├── lock.sh         # flock 封装
├── atomic.sh       # tmp + rename 封装
└── audit.sh        # 审计日志
```
**验收**:
- 所有 `scripts/*.sh` 的写操作 `source` 此库，不再直接 `cat >` / `echo >`
- CI 加 forbidden-pattern 扫描拒绝绕过
- ≥ 20 个 `state_*` 函数覆盖全部状态写操作

### Task 0.4 — Node 写入收口
**产出**: `node/src/core/state/`
```
state/
├── writer.ts       # writeTicket / transitionTicket / ...
├── reader.ts
├── schema.ts       # 读同一份 protocol/schemas/
├── lock.ts         # proper-lockfile
├── atomic.ts
└── audit.ts
```
**验收**:
- 所有 `node/src/` 对 `jira/` / `inbox/` / `outbox/` / `shared/` / `.eket/state/` 的写入必须走 `state/writer.ts`
- 其他模块对这些目录的直接 `fs.writeFile` → ESLint 自定义规则禁止
- 保留的例外：初始化脚手架（`init-wizard.ts`）可豁免，加显式标注

### Task 0.5 — 等价性测试框架
**产出**: `tests/dual-engine/`
```
tests/dual-engine/
├── framework.sh              # 工具函数（setup/snapshot/diff-ignore-time）
├── scenarios/
│   ├── 01-claim-ticket.sh
│   ├── 02-submit-pr.sh
│   ├── 03-ticket-transition.sh
│   ├── 04-heartbeat-write.sh
│   └── 05-master-election.sh
└── run-all.sh
```
**验收**:
- 每个 scenario 跑 3 遍（Shell-only / Node-only / 混合），FS 快照除时间戳外必须 byte-equal
- 加入 CI，失败则 PR 拒合
- ≥ 5 个 scenario 覆盖核心状态转移

### Task 0.6 — 代码瘦身
**量化目标**:
| 指标 | 当前 | 目标 |
|------|------|------|
| 根目录 MD | 14 | ≤ 4 |
| `node/src/core/` 文件数 | 40 | ≤ 25 |
| `node/src/skills/` 子目录 | 19 | ≤ 8 |
| SQLite 客户端实现 | 3+ | 1 |
| 文件队列实现 | 2 | 1 |
| 重复的 `CLAUDE.*.md` | 4 | 1 |

**手段**:
- `[deprecated]` 分类的模块直接删
- 重复实现合并（保留一个 `@deprecated` 旧的作为过渡，下版本删）
- 未被使用的 Skill 子目录删除
- `CLAUDE.master.md` / `CLAUDE.slaver.md` 合并进 `AGENTS.md`
- `CLAUDE.md.bak` / `README_TEMPLATE.md` 删

---

## 纪律

1. **Phase 0 期间禁止新功能 PR**（除 bug 修复）；新需求归档到 `docs/roadmap/v3-deferred/`
2. **每个 PR 必须回答**："这属于 0.1–0.6 哪个子任务？"
3. **不在 OWNERSHIP 里的模块** → 不允许改
4. **不通过 schema 校验的写入** → 不允许合并
5. **不过等价性测试** → 不允许合并
6. **每周五 checkpoint**：更新本文件进度，到期未达目标停一切专注收尾

---

## 截止日期

**硬截止**: 2026-05-29（6 周）

到期无论状态如何进入 **Phase 1（单机多 session 协作）**。夯基是手段，价值落地是目的。

---

## 进度跟踪

| 子任务 | 状态 | 负责人 | 完成日 |
|--------|------|--------|-------|
| 0.1 OWNERSHIP 初稿 | 🟡 进行中 | - | - |
| 0.2 protocol 骨架 | 🟡 进行中 | - | - |
| 0.3 lib/state/ | 🟡 进行中 | - | - |
| 0.4 node state/ | ⚪ 未开始 | - | - |
| 0.5 dual-engine tests | 🟡 进行中 | - | - |
| 0.6 瘦身 | ⚪ 未开始 | - | - |
