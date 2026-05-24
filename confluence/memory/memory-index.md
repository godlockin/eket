# Memory Index

> 导航索引（L0）— 每条一行，按分区组织。详细内容见对应文件。
> 更新规则：新增/删除/重命名文件后手动同步此文件。

---

## 📐 patterns/ — 可复用设计模式

| 文件 | 摘要 |
|------|------|
| [dual-track-router.md](patterns/dual-track-router.md) | 双轨路由器模式 — Rust/JS 自动切换、断路器保护、接口抽象 |
| [four-level-degradation.md](patterns/four-level-degradation.md) | 四级降级模式 — Shell→Rust→Node.js→Redis |
| [master-slaver-coordination.md](patterns/master-slaver-coordination.md) | Master-Slaver 协调模式 |
| [knowledge-system.md](patterns/knowledge-system.md) | 知识沉淀系统 — L0~L4 分层、GC 流程 |
| [knowledge-flywheel.md](patterns/knowledge-flywheel.md) | 知识飞轮 — claim 推送、complete 触发 Curator |
| [expert-dispatch-waiting.md](patterns/expert-dispatch-waiting.md) | Expert Dispatch 等待队列 + 按需召唤 |
| [expertise-tag-design.md](patterns/expertise-tag-design.md) | expertise tag 设计 — 白名单、评分派送 |
| [git-worktree-eket-integration.md](patterns/git-worktree-eket-integration.md) | Git Worktree + EKET 集成 |
| [multi-layer-intent-aggregation.md](patterns/multi-layer-intent-aggregation.md) | 多层意图聚合 — 4层模型、冲突澄清 |
| [non-blocking-git-push.md](patterns/non-blocking-git-push.md) | 非阻塞 Git Push 模式 |
| [task-effort-human-units.md](patterns/task-effort-human-units.md) | 任务工时人类单位换算 |
| [unblocked-ticket-notification-design.md](patterns/unblocked-ticket-notification-design.md) | 依赖解除通知设计 |

---

## ⚠️ pitfalls/ — 已知坑

| 文件 | 摘要 |
|------|------|
| [async-test-leak.md](pitfalls/async-test-leak.md) | Jest 异步测试泄漏 — Redis 连接/定时器未清理 |
| [branch-order-wrong-description.md](pitfalls/branch-order-wrong-description.md) | 分支顺序描述错误 |
| [context-explosion-defense.md](pitfalls/context-explosion-defense.md) | Agent 上下文爆炸防御 |
| [context-tracker-not-triggered.md](pitfalls/context-tracker-not-triggered.md) | Context Tracker 未触发根因 |
| [git-mv-directory-not-exist.md](pitfalls/git-mv-directory-not-exist.md) | git mv 目标目录不存在 |
| [master-single-point-failure.md](pitfalls/master-single-point-failure.md) | Master 单点故障 |
| [perf-ac-ambiguity.md](pitfalls/perf-ac-ambiguity.md) | 性能验收标准模糊 |
| [slaver-worktree-code-loss.md](pitfalls/slaver-worktree-code-loss.md) | Slaver Worktree 代码丢失 |
| [sqlite-inmemory-testclient-thread.md](pitfalls/sqlite-inmemory-testclient-thread.md) | SQLite In-Memory 线程隔离 |

---

## 📚 lessons/ — 实战经验

| 文件 | 摘要 |
|------|------|
| [multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) | 多智能体协作经验 |
| [red-team-bug-patterns.md](lessons/red-team-bug-patterns.md) | 红队审查 Bug 模式 |
| [research-methodology.md](lessons/research-methodology.md) | 跨项目研究方法论 |
| [compare-test-before-replace.md](lessons/compare-test-before-replace.md) | 修改前隔离对比测试 |
| [slaver-exit-cleanup.md](lessons/slaver-exit-cleanup.md) | Slaver 退出清理机制 |
| [context-optimization-lessons-2026-05-10.md](lessons/context-optimization-lessons-2026-05-10.md) | 上下文优化经验 |
| [deep-cleanup-lessons-2026-05-07.md](lessons/deep-cleanup-lessons-2026-05-07.md) | 深度清理经验 |
| [epic-006-slaver-lessons-2026-05-09.md](lessons/epic-006-slaver-lessons-2026-05-09.md) | EPIC-006 Slaver 经验 |
| [EPIC-005-lessons.md](lessons/EPIC-005-lessons.md) | EPIC-005 经验 |
| [project-level-data-isolation.md](lessons/project-level-data-isolation.md) | 项目级数据隔离 |
| [spec4-feedback-intent-lessons.md](lessons/spec4-feedback-intent-lessons.md) | Spec 4 反馈系统经验 |
| [TASK-226-lessons-learned.md](lessons/TASK-226-lessons-learned.md) | TASK-226 经验 |

---

## 📘 guides/ — SOP 与指南

| 文件 | 摘要 |
|------|------|
| [project-hygiene.md](guides/project-hygiene.md) | 项目卫生规范 — docs/memory边界、规则格式 |
| [ticket-numbering-rules.md](guides/ticket-numbering-rules.md) | Ticket 编号规则 |
| [agent-prompt-template.md](guides/agent-prompt-template.md) | Agent Prompt 防卡死模板 |
| [branch-strategy.md](guides/branch-strategy.md) | 分支策略指南 |
| [ci-troubleshooting.md](guides/ci-troubleshooting.md) | CI 故障排查手册 |
| [codebase-maintenance.md](guides/codebase-maintenance.md) | 代码库维护指南 |
| [context-token-budget.md](guides/context-token-budget.md) | Context Token 预算管理 |
| [worktree-agent.md](guides/worktree-agent.md) | Worktree Agent 最佳实践 |

---

## 📖 glossary/ — 术语表

| 文件 | 摘要 |
|------|------|
| [terms.md](glossary/terms.md) | EKET 核心术语定义 |

---

## 🔬 research/ — 研究文档

| 文件 | 摘要 |
|------|------|
| [borrowed-wisdom.md](research/borrowed-wisdom.md) | 外部项目借鉴研究 (711行) |

---

## 🛠️ solutions/ — 技术方案

| 文件 | 摘要 |
|------|------|
| [context-overflow-defense.md](solutions/context-overflow-defense.md) | 上下文溢出防御方案 (v2) |
| [docs-html-rendering-spec.md](solutions/docs-html-rendering-spec.md) | Docs HTML 渲染规范 |
| [master-failure-defense-system.md](solutions/master-failure-defense-system.md) | Master 故障防御系统 |

---

## 🔁 retrospectives/ — 复盘记录

### EPICs
| 文件 | 摘要 |
|------|------|
| [epics/EPIC-002.md](retrospectives/epics/EPIC-002.md) | EPIC-002 — PR收尾/专家体系 |
| [epics/EPIC-003.md](retrospectives/epics/EPIC-003.md) | EPIC-003 — cherry-pick/三分支对齐 |
| [epics/EPIC-004.md](retrospectives/epics/EPIC-004.md) | EPIC-004 — Worktree/防卡死/Post-Process |
| [epics/EPIC-006-summary.md](retrospectives/epics/EPIC-006-summary.md) | EPIC-006 — 全项目Review |
| [epics/EPIC-010.md](retrospectives/epics/EPIC-010.md) | EPIC-010 — Rust高性能核心/双轨降级 |

### 2026 里程碑
| 文件 | 摘要 |
|------|------|
| [2026/04-rust-migration-review.md](retrospectives/2026/04-rust-migration-review.md) | Rust 迁移复盘 |
| [2026/05-docuseal-borrowing.md](retrospectives/2026/05-docuseal-borrowing.md) | DocuSeal 借鉴研究 |
| [2026/05-lessons-learned.md](retrospectives/2026/05-lessons-learned.md) | DB+MD 双写修复 |
| [2026/05-db-md-sync-fix.md](retrospectives/2026/05-db-md-sync-fix.md) | 同步修复技术报告 |
| [2026/05-project-100-percent-complete.md](retrospectives/2026/05-project-100-percent-complete.md) | 项目100%完成报告 |
| [2026/05-EPIC-006-execution-complete-report.md](retrospectives/2026/05-EPIC-006-execution-complete-report.md) | EPIC-006 执行完成报告 |
| [2026/05-TASK-180-221-batch-fixes.md](retrospectives/2026/05-TASK-180-221-batch-fixes.md) | 批量修复复盘 |
| [2026/05-TASK-269.md](retrospectives/2026/05-TASK-269.md) | TASK-269 修复复盘 |
| [2026/05-three-questions-clarification.md](retrospectives/2026/05-three-questions-clarification.md) | 三问澄清 |

### Sprints
| 文件 | 摘要 |
|------|------|
| [sprints/sprint-001.md](retrospectives/sprints/sprint-001.md) | Sprint 001 回顾 |

---

## 📦 archive/ — 归档

| 文件 | 摘要 |
|------|------|
| [INDEX.md](archive/INDEX.md) | 归档文件索引 |

---

## 🗺️ 代码库地图

| 文件 | 摘要 |
|------|------|
| [codebase-map.md](codebase-map.md) | EKET 代码库架构地图 |

---

*文件总数：85 | 上次更新：2026-05-24*
