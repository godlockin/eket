# Memory Index

> 导航索引（L0）— 每条一行，按分区组织。详细内容见对应文件。
> 更新规则：新增/删除/重命名文件后手动同步此文件。

---

## 📐 patterns/ — 可复用设计模式

| 文件 | 摘要 |
|------|------|
| [patterns/knowledge-system.md](patterns/knowledge-system.md) | EKET 知识沉淀系统 — L0~L4 分层、写入时机、GC 流程 |
| [patterns/master-slaver-coordination.md](patterns/master-slaver-coordination.md) | Master-Slaver 协调模式 — 任务分发、状态同步、越权防护 |
| [patterns/three-level-degradation.md](patterns/three-level-degradation.md) | 三级降级模式 — Shell → Node.js → Redis+SQLite 容灾链路 |

---

## ⚠️ pitfalls/ — 已知坑（避免重蹈）

| 文件 | 摘要 |
|------|------|
| [pitfalls/async-test-leak.md](pitfalls/async-test-leak.md) | Jest 异步测试泄漏 — Redis 连接/定时器未清理导致 force-exit |
| [pitfalls/git-mv-directory-not-exist.md](pitfalls/git-mv-directory-not-exist.md) | `git mv` 目标目录不存在时报错 — 先 `mkdir -p` 再 mv |

---

## 📚 lessons/ — 实战经验教训

| 文件 | 摘要 |
|------|------|
| [lessons/red-team-bug-patterns.md](lessons/red-team-bug-patterns.md) | 红队审查 Bug 模式 — tokio Mutex、AbortHandle、archive顺序、FTS5触发器、CAS、fast-fail |
| [lessons/multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) | 多智能体协作 — 任务分配、并行执行风险、规则遗忘防治、进度上报 |
| [lessons/rule-retention-lessons.md](lessons/rule-retention-lessons.md) | 规则保持性 — Agent 遗忘三层防御、CLAUDE.md 瘦身、Hook Layer 3b |
| [lessons/research-methodology.md](lessons/research-methodology.md) | 跨项目研究方法论 — 借鉴过滤标准、研究流程、各轮要点速查 |
| [lessons/codebase-maintenance.md](lessons/codebase-maintenance.md) | 代码库与文档维护 — 四类文档债、清理顺序、重组两步法、archive规范 |
| [lessons/eket-project-hygiene.md](lessons/eket-project-hygiene.md) | EKET 项目卫生 — template/引用、僵尸ticket、三仓库归属、版本号同步、Skills注册 |

---

## 🔬 research/ — 外部项目研究笔记

| 文件 | 摘要 |
|------|------|
| [research/borrowed-wisdom.md](research/borrowed-wisdom.md) | EKET 借鉴知识库总索引 — 所有外部借鉴点汇总（713行，主文档） |
| [research/round-22-archon-research.md](research/round-22-archon-research.md) | Archon 借鉴研究报告 Round 22 — DAG、模型路由、SSE体系 |

---

## 📖 glossary/ — 术语表

| 文件 | 摘要 |
|------|------|
| [glossary/terms.md](glossary/terms.md) | EKET 核心术语定义 — Master/Slaver/Ticket/Gate/Handoff 等 |

---

## 🔁 retrospectives/ — 里程碑复盘

| 文件 | 摘要 |
|------|------|
| [retrospectives/sprint-001-retro.md](retrospectives/sprint-001-retro.md) | Sprint 001 回顾 |
| [retrospectives/2026/20260421-rust-migration-review.md](retrospectives/2026/20260421-rust-migration-review.md) | EKET Rust 迁移综合 Review 反思 |
| [retrospectives/2026/20260418T114538Z-PR81-TASK-053.md](retrospectives/2026/20260418T114538Z-PR81-TASK-053.md) | Retro — PR #81 (TASK-053) |
| [retrospectives/2026/20260418T050759Z-PR79-TASK-053.md](retrospectives/2026/20260418T050759Z-PR79-TASK-053.md) | Retro — PR #79 (TASK-053) |
| [retrospectives/2026/20260418T032406Z-PR75-TASK-050.md](retrospectives/2026/20260418T032406Z-PR75-TASK-050.md) | Retro — PR #75 (TASK-050) |

---

*文件总数：19 | 上次更新：2026-04-26*
