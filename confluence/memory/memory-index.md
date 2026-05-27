# Memory Index

> 导航索引（L0）— 按分区组织。只保留有价值的问题/教训/模式，删除纯状态记录。

---

## 📐 patterns/ — 可复用设计模式 (12)

| 文件 | 摘要 |
|------|------|
| [dual-track-router.md](patterns/dual-track-router.md) | 双轨路由器 — Rust/JS 自动切换、断路器、接口抽象 |
| [four-level-degradation.md](patterns/four-level-degradation.md) | 四级降级 — Shell→Rust→Node.js→Redis |
| [master-slaver-coordination.md](patterns/master-slaver-coordination.md) | Master-Slaver 协调模式 |
| [knowledge-system.md](patterns/knowledge-system.md) | 知识沉淀 — L0~L4 分层、GC 流程 |
| [knowledge-flywheel.md](patterns/knowledge-flywheel.md) | 知识飞轮 — claim 推送、complete 触发 |
| [expert-dispatch-waiting.md](patterns/expert-dispatch-waiting.md) | Expert 等待队列 + 按需召唤 |
| [expertise-tag-design.md](patterns/expertise-tag-design.md) | expertise tag — 白名单、评分派送 |
| [git-worktree-eket-integration.md](patterns/git-worktree-eket-integration.md) | Git Worktree + EKET 集成 |
| [multi-layer-intent-aggregation.md](patterns/multi-layer-intent-aggregation.md) | 多层意图聚合 — 4层模型 |
| [non-blocking-git-push.md](patterns/non-blocking-git-push.md) | 非阻塞 Git Push |
| [task-effort-human-units.md](patterns/task-effort-human-units.md) | 任务工时换算 |
| [unblocked-ticket-notification-design.md](patterns/unblocked-ticket-notification-design.md) | 依赖解除通知 |

---

## ⚠️ pitfalls/ — 已知坑 (11)

| 文件 | 摘要 |
|------|------|
| [async-test-leak.md](pitfalls/async-test-leak.md) | Jest 异步泄漏 — Redis/定时器未清理 |
| [branch-order-wrong-description.md](pitfalls/branch-order-wrong-description.md) | 分支顺序描述错误 |
| [context-explosion-defense.md](pitfalls/context-explosion-defense.md) | Agent 上下文爆炸防御 |
| [context-tracker-not-triggered.md](pitfalls/context-tracker-not-triggered.md) | Context Tracker 未触发根因 |
| [coverage-driven-development.md](pitfalls/coverage-driven-development.md) | **覆盖率驱动开发** — 数字目标陷阱 |
| [git-mv-directory-not-exist.md](pitfalls/git-mv-directory-not-exist.md) | git mv 目标目录不存在 |
| [master-single-point-failure.md](pitfalls/master-single-point-failure.md) | Master 单点故障 |
| [perf-ac-ambiguity.md](pitfalls/perf-ac-ambiguity.md) | 性能验收标准模糊 |
| [slaver-worktree-code-loss.md](pitfalls/slaver-worktree-code-loss.md) | Slaver Worktree 代码丢失 |
| [sqlite-inmemory-testclient-thread.md](pitfalls/sqlite-inmemory-testclient-thread.md) | SQLite In-Memory 线程隔离 |
| [test-inline-copy-antipattern.md](pitfalls/test-inline-copy-antipattern.md) | **测试内联复制** — 假阳性测试 |

---

## 📚 lessons/ — 实战经验 (13)

| 文件 | 摘要 |
|------|------|
| [epic-014-benchmark-lessons.md](lessons/epic-014-benchmark-lessons.md) | **EPIC-014 测评改进** — 测试质量>数量、类型安全ROI |
| [multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) | 多智能体协作 — 任务分配、并行风险 |
| [red-team-bug-patterns.md](lessons/red-team-bug-patterns.md) | 红队 Bug 模式 — tokio Mutex、AbortHandle |
| [research-methodology.md](lessons/research-methodology.md) | 跨项目研究方法论 |
| [compare-test-before-replace.md](lessons/compare-test-before-replace.md) | 修改前隔离对比测试 |
| [slaver-exit-cleanup.md](lessons/slaver-exit-cleanup.md) | Slaver 退出清理 |
| [context-optimization-lessons-2026-05-10.md](lessons/context-optimization-lessons-2026-05-10.md) | 上下文优化 — SKILL.md RAG 化 |
| [deep-cleanup-lessons-2026-05-07.md](lessons/deep-cleanup-lessons-2026-05-07.md) | 深度清理 — 片段式处理的教训 |
| [epic-006-slaver-lessons-2026-05-09.md](lessons/epic-006-slaver-lessons-2026-05-09.md) | **Agent 幻觉问题** — background 隔离环境 |
| [EPIC-005-lessons.md](lessons/EPIC-005-lessons.md) | EPIC-005 — CI/CD 经验、需求对齐 |
| [project-level-data-isolation.md](lessons/project-level-data-isolation.md) | 项目级数据隔离设计 |
| [spec4-feedback-intent-lessons.md](lessons/spec4-feedback-intent-lessons.md) | Spec 4 反馈系统 — Python/FastAPI |
| [TASK-226-lessons-learned.md](lessons/TASK-226-lessons-learned.md) | Slaver 无权自填 trailer |

---

## 📘 guides/ — SOP 与指南 (8)

| 文件 | 摘要 |
|------|------|
| [project-hygiene.md](guides/project-hygiene.md) | 项目卫生 — docs/memory 边界 |
| [ticket-numbering-rules.md](guides/ticket-numbering-rules.md) | Ticket 编号规则 |
| [agent-prompt-template.md](guides/agent-prompt-template.md) | Agent Prompt 防卡死模板 |
| [branch-strategy.md](guides/branch-strategy.md) | 分支策略指南 |
| [ci-troubleshooting.md](guides/ci-troubleshooting.md) | CI 故障排查 |
| [codebase-maintenance.md](guides/codebase-maintenance.md) | 代码库维护 |
| [context-token-budget.md](guides/context-token-budget.md) | Context Token 预算 |
| [worktree-agent.md](guides/worktree-agent.md) | Worktree Agent 最佳实践 |

---

## 🔁 retrospectives/ — 复盘 (15)

### EPICs (5)
| 文件 | 核心教训 |
|------|---------|
| [EPIC-002.md](retrospectives/epics/EPIC-002.md) | PR 收尾流程、rebase 冲突 |
| [EPIC-003.md](retrospectives/epics/EPIC-003.md) | **并行 Agent .git/index.lock 死锁** |
| [EPIC-004.md](retrospectives/epics/EPIC-004.md) | **Worktree Agent CWD 未切换** |
| [EPIC-006-summary.md](retrospectives/epics/EPIC-006-summary.md) | Context Overflow 防御 |
| [EPIC-010.md](retrospectives/epics/EPIC-010.md) | Rust 双轨降级、TypeScript strict |

### 2026 里程碑 (6)
| 文件 | 核心教训 |
|------|---------|
| [04-rust-migration-review.md](retrospectives/2026/04-rust-migration-review.md) | Rust 迁移专家 review |
| [05-db-md-sync-fix.md](retrospectives/2026/05-db-md-sync-fix.md) | DB+MD 双写失效修复 |
| [05-lessons-learned.md](retrospectives/2026/05-lessons-learned.md) | 双写失效排查过程 |
| [05-EPIC-006-execution-complete-report.md](retrospectives/2026/05-EPIC-006-execution-complete-report.md) | P0 问题发现与修复 |
| [05-TASK-180-221-batch-fixes.md](retrospectives/2026/05-TASK-180-221-batch-fixes.md) | 批量修复经验 |
| [05-TASK-269.md](retrospectives/2026/05-TASK-269.md) | Slaver 状态更新 Bug |

---

## 🛠️ solutions/ — 技术方案 (2)

| 文件 | 摘要 |
|------|------|
| [context-overflow-defense.md](solutions/context-overflow-defense.md) | 上下文溢出防御 (v2) |
| [master-failure-defense-system.md](solutions/master-failure-defense-system.md) | Master 故障防御 |

---

## 其他

| 目录/文件 | 说明 |
|----------|------|
| [glossary/terms.md](glossary/terms.md) | EKET 术语表 |
| [research/borrowed-wisdom.md](research/borrowed-wisdom.md) | 外部项目借鉴 (711行) |
| [codebase-map.md](codebase-map.md) | 代码库架构地图 |
| [archive/](archive/) | 归档 (3 files) |

---

## 模板与规范

Memory 文件需遵循统一格式，详见 [模板文档](../../template/memory-template.md)。

**验证工具**：
```bash
# 检查所有 memory 文件格式
./scripts/check-memory-format.sh

# 检查指定目录
./scripts/check-memory-format.sh confluence/memory/pitfalls/

# 严格模式（警告也报错）
./scripts/check-memory-format.sh --strict
```

**已迁移到新格式**：
- pitfalls/async-test-leak.md
- pitfalls/git-mv-directory-not-exist.md
- pitfalls/sqlite-inmemory-testclient-thread.md

---

## 🔬 research/ — 研究沉淀 (2)

| 文件 | 摘要 |
|------|------|
| [llm-patterns/llm-laziness.md](../research/llm-patterns/llm-laziness.md) | LLM 输出截断根因 + 补救技术 |
| [README.md](../research/README.md) | Research 目录结构说明 |

---

*文件总数：73 | 上次更新：2026-05-27*
