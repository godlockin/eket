# Memory Index

> 导航索引（L0）— 每条一行，按分区组织。详细内容见对应文件。
> 更新规则：新增/删除/重命名文件后手动同步此文件。

---

## 📐 patterns/ — 可复用设计模式

| 文件 | 摘要 |
|------|------|
| [patterns/knowledge-system.md](patterns/knowledge-system.md) | EKET 知识沉淀系统 — L0~L4 分层、写入时机、GC 流程 |
| [patterns/master-slaver-coordination.md](patterns/master-slaver-coordination.md) | Master-Slaver 协调模式 — 任务分发、状态同步、越权防护 |
| [patterns/four-level-degradation.md](patterns/four-level-degradation.md) | 四级降级模式 — Shell(L0) → Rust(L1) → Node.js(L2) → Redis+SQLite(L3) 容灾链路 |
| [patterns/multi-layer-intent-aggregation.md](patterns/multi-layer-intent-aggregation.md) | 多层意图聚合模式 — 4层模型、4注入点、冲突澄清流程 |
| [patterns/expertise-tag-design.md](patterns/expertise-tag-design.md) | expertise tag 设计模式 — 白名单、heartbeat评分派送、等待队列、auto-scaffold |
| [patterns/expert-dispatch-waiting.md](patterns/expert-dispatch-waiting.md) | Expert Dispatch 等待队列 + 按需召唤 — 完整流程图、优先级、文件约定 |
| [patterns/git-worktree-eket-integration.md](patterns/git-worktree-eket-integration.md) | Git Worktree + EKET 集成 — task:claim 自动创建、complete 清理、CWD 注意事项 |
| [patterns/knowledge-flywheel.md](patterns/knowledge-flywheel.md) | 知识飞轮模式 — task:claim 自动推送 pitfalls/patterns、complete 触发 Curator |
| [patterns/task-effort-human-units.md](patterns/task-effort-human-units.md) | 任务工时人类单位 — 2d/0.5d/3h/480min 换算规则 |
| [patterns/unblocked-ticket-notification-design.md](patterns/unblocked-ticket-notification-design.md) | 依赖解除通知设计 — unblocked-queue.json、heartbeat 优先分发、Saga 步骤 |

---

## ⚠️ pitfalls/ — 已知坑（避免重蹈）

| 文件 | 摘要 |
|------|------|
| [pitfalls/async-test-leak.md](pitfalls/async-test-leak.md) | Jest 异步测试泄漏 — Redis 连接/定时器未清理导致 force-exit |
| [pitfalls/git-mv-directory-not-exist.md](pitfalls/git-mv-directory-not-exist.md) | `git mv` 目标目录不存在时报错 — 先 `mkdir -p` 再 mv |
| [pitfalls/sqlite-inmemory-testclient-thread.md](pitfalls/sqlite-inmemory-testclient-thread.md) | SQLite In-Memory + FastAPI TestClient 线程隔离 — StaticPool 解法 |
| [pitfalls/context-explosion-defense.md](pitfalls/context-explosion-defense.md) | Agent 上下文爆炸防御 — 溢出触发点、阻断规则、/compact 时机 |
| [pitfalls/branch-order-wrong-description.md](pitfalls/branch-order-wrong-description.md) | 分支顺序描述错误 — 先确认项目 branch flow，EKET 正确顺序 feature→testing→main→miao |

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
| [lessons/spec4-feedback-intent-lessons.md](lessons/spec4-feedback-intent-lessons.md) | Spec 4 反馈+意图系统实战经验教训 — 线程隔离、import路径、slaver超时、None语义（外部项目 Python/FastAPI） |
| [lessons/compare-test-before-replace.md](lessons/compare-test-before-replace.md) | 修改在用逻辑：隔离对比测试后再替换 — 场景隔离方式、替换时机、大 release 专家组评审门卫 |

---

## 🔬 research/ — 外部项目研究笔记

| 文件 | 摘要 |
|------|------|
| [research/borrowed-wisdom.md](research/borrowed-wisdom.md) | EKET 借鉴知识库总索引 — 所有外部借鉴点汇总（713行，主文档） |
| [research/round-22-archon-research.md](research/round-22-archon-research.md) | Archon 借鉴研究报告 Round 22 — DAG、模型路由、SSE体系 |
| [research/ruflo-research.md](research/ruflo-research.md) | ruflo 借鉴研究 — HNSW 向量检索、TrustScore 评分、拒绝点清单 |

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
| [retrospectives/2026-05-05-docuseal-borrowing.md](retrospectives/2026-05-05-docuseal-borrowing.md) | DocuSeal 借鉴研究综合复盘 |
| [retrospectives/2026-05-06-TASK-269-completed.md](retrospectives/2026-05-06-TASK-269-completed.md) | TASK-269 Bug 修复复盘 — task:complete + slaver 实例化 |
| [retrospectives/202605/05-TASK-180-221-batch-fixes.md](retrospectives/202605/05-TASK-180-221-batch-fixes.md) | TASK-180~221 批量修复复盘 |
| [retrospectives/2026/20260421-rust-migration-review.md](retrospectives/2026/20260421-rust-migration-review.md) | EKET Rust 迁移综合 Review 反思 |
| [retrospectives/2026/20260418T114538Z-PR81-TASK-053.md](retrospectives/2026/20260418T114538Z-PR81-TASK-053.md) | Retro — PR #81 (TASK-053) |
| [retrospectives/2026/20260418T050759Z-PR79-TASK-053.md](retrospectives/2026/20260418T050759Z-PR79-TASK-053.md) | Retro — PR #79 (TASK-053) |
| [retrospectives/2026/20260418T032406Z-PR75-TASK-050.md](retrospectives/2026/20260418T032406Z-PR75-TASK-050.md) | Retro — PR #75 (TASK-050) |

---

## 📋 EPIC 经验教训 & 技术报告

| 文件 | 摘要 |
|------|------|
| [EPIC-002-lessons.md](EPIC-002-lessons.md) | EPIC-002 综合经验教训 — PR收尾/rebase/CI/专家体系（addyosmani agent-skills引入） |
| [EPIC-003-backport-lessons.md](EPIC-003-backport-lessons.md) | EPIC-003 回灌经验教训 — cherry-pick分叉、三分支对齐、历史债务处理 |
| [EPIC-004-improvement-lessons.md](EPIC-004-improvement-lessons.md) | EPIC-004 持续改进经验教训 — Worktree丢失、防卡死、Post-Process、分支清理 |
| [lessons-learned-2026-05-06.md](lessons-learned-2026-05-06.md) | DB+MD 双写失效排查与修复 — 3 Critical Pitfalls、3 Patterns、84 张状态修正 |
| [db-md-sync-fix-report.md](db-md-sync-fix-report.md) | DB+MD 同步修复技术报告 — TASK-270~281 实施细节 |
| [task-275-lessons.md](task-275-lessons.md) | TASK-275 Slaver 退出清理机制经验教训 |
| [redis-architecture-analysis.md](redis-architecture-analysis.md) | Redis 架构分析与 TASK-142 wont-fix 决策依据 |
| [project-status-2026-05-06.md](project-status-2026-05-06.md) | 项目 100% 完成状态报告（2026-05-06）|

---

## 🛠️ SOP 模板与指南

| 文件 | 摘要 |
|------|------|
| [agent-prompt-template.md](agent-prompt-template.md) | Agent Prompt 防卡死模板 — Bash timeout/SSH push/心跳监控SOP（可直接复制使用） |
| [worktree-agent-guide.md](worktree-agent-guide.md) | Worktree Agent 产物丢失根因分析与最佳实践 — CWD不可靠、checklist、merge-back步骤 |
| [branch-strategy-guide.md](branch-strategy-guide.md) | 分支策略指南 — 拓扑/决策矩阵/三分支对齐SOP/危险操作 |
| [ci-troubleshooting-playbook.md](ci-troubleshooting-playbook.md) | CI 故障排查手册 — 依赖/编译/测试/lint/PR体积/Actions |
| [context-token-budget-guide.md](context-token-budget-guide.md) | Agent 上下文与 Token 预算管理 — 溢出预防/Write bug/节约规则 |

---

*文件总数：47 | 上次更新：2026-05-07*
