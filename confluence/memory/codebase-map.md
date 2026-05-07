# Codebase Map — eket

> 自动扫描生成（2026-05-03）+ 人工补注。
> 变更时由 post-commit hook 提示更新，累计提示 ≥3 次未更新则阻断 push。
> **人工注释请填写在"备注"列，重新扫描不会覆盖已有内容。**

**技术栈**：Shell、Docker、Kubernetes

---

## 1. 核心流程入口

> 扫描 commands/ 目录生成，备注列人工填写。

| 功能/命令 | 文件 | 备注 |
|---------|------|------|
| eket-slaver-poll.sh | template/.claude/commands/eket-slaver-poll.sh | |
| eket-init.sh | template/.claude/commands/eket-init.sh | |
| eket-help.sh | template/.claude/commands/eket-help.sh | |
| eket-ask.sh | template/.claude/commands/eket-ask.sh | |
| eket-review-merge.sh | template/.claude/commands/eket-review-merge.sh | |
| eket-start-human.sh | template/.claude/commands/eket-start-human.sh | |
| eket-start.sh | template/.claude/commands/eket-start.sh | |
| eket-review.sh | template/.claude/commands/eket-review.sh | |
| eket-slaver-auto.sh | template/.claude/commands/eket-slaver-auto.sh | |
| eket-instances.sh | template/.claude/commands/eket-instances.sh | |
| heartbeat-slaver.md | template/.claude/commands/heartbeat-slaver.md | |
| eket-merge.sh | template/.claude/commands/eket-merge.sh | |
| eket-board.sh | template/.claude/commands/eket-board.sh | |
| eket-mode.sh | template/.claude/commands/eket-mode.sh | |
| eket-review-analysis.sh | template/.claude/commands/eket-review-analysis.sh | |
| eket-master-review.sh | template/.claude/commands/eket-master-review.sh | |
| eket-merge-pr.sh | template/.claude/commands/eket-merge-pr.sh | |
| eket-submit-pr.sh | template/.claude/commands/eket-submit-pr.sh | |
| eket-verify-pr.sh | template/.claude/commands/eket-verify-pr.sh | |
| eket-slaver-register.sh | template/.claude/commands/eket-slaver-register.sh | |
| eket-master-poll.sh | template/.claude/commands/eket-master-poll.sh | |
| eket-review-pr.sh | template/.claude/commands/eket-review-pr.sh | |
| eket-role.sh | template/.claude/commands/eket-role.sh | |
| eket-status.sh | template/.claude/commands/eket-status.sh | |
| eket-task.sh | template/.claude/commands/eket-task.sh | |
| eket-claim.sh | template/.claude/commands/eket-claim.sh | |
| eket-check-progress.sh | template/.claude/commands/eket-check-progress.sh | |
| eket-phase-review.sh | template/.claude/commands/eket-phase-review.sh | |
| eket-analyze.sh | template/.claude/commands/eket-analyze.sh | |
| _eket_common.sh | template/.claude/commands/_eket_common.sh | |
| heartbeat-master.md | template/.claude/commands/heartbeat-master.md | |
| alerts:list | rust/crates/eket-cli/src/commands/alerts_list.rs | |
| db:commands | rust/crates/eket-cli/src/commands/db_commands.rs | |
| dependency:analyze | rust/crates/eket-cli/src/commands/dependency_analyze.rs | |
| doc:create | rust/crates/eket-cli/src/commands/doc_create.rs | |
| doc:status | rust/crates/eket-cli/src/commands/doc_status.rs | |
| epic:create | rust/crates/eket-cli/src/commands/epic_create.rs | |
| epic:plan | rust/crates/eket-cli/src/commands/epic_plan.rs | |
| expert:compose | rust/crates/eket-cli/src/commands/expert_compose.rs | |
| gate:review | rust/crates/eket-cli/src/commands/gate_review.rs | |
| handoff | rust/crates/eket-cli/src/commands/handoff.rs | |
| knowledge | rust/crates/eket-cli/src/commands/knowledge.rs | |
| master:heartbeat | rust/crates/eket-cli/src/commands/master_heartbeat.rs | |
| master:poll | rust/crates/eket-cli/src/commands/master_poll.rs | |
| project:status | rust/crates/eket-cli/src/commands/project_status.rs | |
| roadmap:update | rust/crates/eket-cli/src/commands/roadmap_update.rs | |
| server | rust/crates/eket-cli/src/commands/server.rs | |
| skill:extract | rust/crates/eket-cli/src/commands/skill_extract.rs | |
| slaver:poll | rust/crates/eket-cli/src/commands/slaver_poll.rs | |
| slaver:register | rust/crates/eket-cli/src/commands/slaver_register.rs | |
| slaver:set:role | rust/crates/eket-cli/src/commands/slaver_set_role.rs | |
| spike:complete | rust/crates/eket-cli/src/commands/spike_complete.rs | |
| spike:create | rust/crates/eket-cli/src/commands/spike_create.rs | |
| submit:pr | rust/crates/eket-cli/src/commands/submit_pr.rs | |
| system:doctor | rust/crates/eket-cli/src/commands/system_doctor.rs | |
| task:claim | rust/crates/eket-cli/src/commands/task_claim.rs | |
| task:complete | rust/crates/eket-cli/src/commands/task_complete.rs | |
| task:create | rust/crates/eket-cli/src/commands/task_create.rs | |
| task:progress | rust/crates/eket-cli/src/commands/task_progress.rs | |
| task:resume | rust/crates/eket-cli/src/commands/task_resume.rs | |
| task:test | rust/crates/eket-cli/src/commands/task_test.rs | |
| team:status | rust/crates/eket-cli/src/commands/team_status.rs | |
| ticket:index | rust/crates/eket-cli/src/commands/ticket_index.rs | |
| workflow:status | rust/crates/eket-cli/src/commands/workflow_status.rs | |
| alerts | node/src/commands/alerts.ts | |
| claim-helpers | node/src/commands/claim-helpers.ts | |
| claim | node/src/commands/claim.ts | |
| complete | node/src/commands/complete.ts | |
| dependency-analyze | node/src/commands/dependency-analyze.ts | |
| gate-review | node/src/commands/gate-review.ts | |
| graph-query | node/src/commands/graph-query.ts | |
| handoff | node/src/commands/handoff.ts | |
| init-wizard | node/src/commands/init-wizard.ts | |
| interactive-start | node/src/commands/interactive-start.ts | |
| knowledge-index | node/src/commands/knowledge-index.ts | |
| knowledge-search | node/src/commands/knowledge-search.ts | |
| knowledge | node/src/commands/knowledge.ts | |
| master-heartbeat | node/src/commands/master-heartbeat.ts | |
| master-poll | node/src/commands/master-poll.ts | |
| recommend | node/src/commands/recommend.ts | |
| server-start | node/src/commands/server-start.ts | |
| set-role | node/src/commands/set-role.ts | |
| skill-extract | node/src/commands/skill-extract.ts | |
| slaver-poll | node/src/commands/slaver-poll.ts | |
| slaver-register | node/src/commands/slaver-register.ts | |
| start-instance | node/src/commands/start-instance.ts | |
| submit-pr | node/src/commands/submit-pr.ts | |
| task-create | node/src/commands/task-create.ts | |
| task-progress | node/src/commands/task-progress.ts | |
| task-resume | node/src/commands/task-resume.ts | |
| team-status | node/src/commands/team-status.ts | |
| ticket-index | node/src/commands/ticket-index.ts | |
| ultrareview | node/src/commands/ultrareview.ts | |
| workflow | node/src/commands/workflow.ts | |

---

## 2. 数据模型定义

| 模型 | 文件 |
|------|------|
| (见文件) | rust/crates/eket-core/src/types.rs |
| (见文件) | sdk/javascript/src/types.ts |
| (见文件) | node/src/skills/types.ts |
| (见文件) | node/src/skills/adapters/types.ts |
| (见文件) | sdk/python/eket_sdk/models.py |

---

## 3. 配置 & 环境变量

> 扫描配置文件生成，具体变量名人工补充。

| 文件/变量 | 备注 |
|---------|------|
| .claude/settings.local.json | |
| .eket/config.yml | |
| .eket/config/docker-redis.yml | |
| .eket/state/instance_config.yml | |
| .env.dev | |
| .env.example | |
| .playwright-mcp/page-2026-04-19T17-11-20-895Z.yml | |
| .serena/project.local.yml | |
| .serena/project.yml | |
| benchmarks/baseline.json | |
| benchmarks/results/round4-benchmark-results.json | |
| docker-compose.test.yml | |
| docker-compose.yml | |
| docker/compose.dev.yml | |
| Dockerfile | |
| docs/reference/openapi.yaml | |
| examples/e2e-collaboration/.env.example | |
| examples/workflows/hello-world.yml | |
| k8s/config.yaml | |
| k8s/deployment.yaml | |
| node/Dockerfile | |
| node/eslint.config.js | |
| node/jest.config.js | |
| node/package.json | |
| node/tsconfig.jest.json | |
| node/tsconfig.json | |
| protocol/schemas/heartbeat.schema.json | |
| protocol/schemas/message.schema.json | |
| protocol/schemas/node.profile.schema.json | |
| protocol/schemas/project-status.schema.yml | |

---

## 4. 常见修改点（Convention）

> 人工维护。记录"要做 X → 改哪里"的约定，新 Slaver 上手必读。

| 要做什么 | 文件/目录 | 注意事项 |
|---------|---------|---------|
| （示例）新增功能模块 | src/commands/ | 需在入口文件注册 |

---

## 5. 目录骨架

<!-- eket:auto-section:dir-skeleton -->
| 目录 | 职责 |
|------|------|
| benchmarks/ | |
| benchmarks/results/ | |
| confluence/ | |
| confluence/memory/ | |
| confluence/memory/archive/ | |
| confluence/memory/glossary/ | |
| confluence/memory/guides/ | |
| confluence/memory/lessons/ | |
| confluence/memory/patterns/ | |
| confluence/memory/pitfalls/ | |
| confluence/memory/research/ | |
| confluence/memory/retrospectives/ | |
| confluence/requirements/ | |
| docker/ | |
| docs/ | |
| docs/adr/ | |
| docs/architecture/ | |
| docs/archive/ | |
| docs/archive/audit-history/ | |
| docs/archive/exploration/ | |
| docs/archive/plans/ | |
| docs/archive/roadmap-history/ | |
| docs/archive/rust-migration/ | |
| docs/archive/status-history/ | |
| docs/archive/v0.2/ | |
| docs/archive/v0.5/ | |
| docs/archive/v0.6/ | |
| docs/archive/v0.8-proposals/ | |
| docs/archive/v0.x/ | |
| docs/getting-started/ | |
| docs/guides/ | |
| docs/ops/ | |
| docs/performance/ | |
| docs/reference/ | |
| docs/reference/schemas/ | |
| docs/reviews/ | |
| docs/roadmap/ | |
| docs/troubleshooting/ | |
| examples/ | |
| examples/e2e-collaboration/ | |
| examples/e2e-collaboration/master/ | |
| examples/e2e-collaboration/master-agent/ | |
| examples/e2e-collaboration/scripts/ | |
| examples/e2e-collaboration/slaver/ | |
| examples/e2e-collaboration/slaver-agent/ | |
| examples/workflows/ | |
| inbox/ | |
| inbox/human_feedback/ | |
| jira/ | |
| jira/archive/ | |
| jira/archive/completed/ | |
| jira/decisions/ | |
| jira/epics/ | |
| jira/tickets/ | |
| jira/tickets/EPIC-002/ | |
| jira/tickets/EPIC-003/ | |
| jira/tickets/EPIC-004/ | |
| jira/tickets/feature/ | |
| k6/ | |
| k6/reports/ | |
| k8s/ | |
| lib/ | |
| lib/adapters/ | |
| lib/state/ | |
| logs/ | |
| node/ | |
| node/.eket.bak/ | |
| node/.eket.bak/data/ | |
| node/.eket.bak/memory/ | |
| node/.eket.bak/non-existent-queue/ | |
| node/.eket.bak/test-queue/ | |
| node/.worktrees/ | |
| node/benchmarks/ | |
| node/benchmarks/results/ | |
| node/confluence/ | |
| node/confluence/memory/ | |
| node/docs/ | |
| node/eslint-rules/ | |
| node/jira/ | |
| node/jira/tickets/ | |
| node/logs/ | |
| node/scripts/ | |
| node/src/ | |
| node/src/api/ | |
| node/src/commands/ | |
| node/src/config/ | |
| node/src/core/ | |
| node/src/di/ | |
| node/src/hooks/ | |
| node/src/i18n/ | |
| node/src/integration/ | |
| node/src/skills/ | |
| node/src/types/ | |
| node/src/utils/ | |
| node/template/ | |
| node/template/.claude/ | |
| node/tests/ | |
| node/tests/api/ | |
| node/tests/commands/ | |
| node/tests/core/ | |
| node/tests/helpers/ | |
| node/tests/integration/ | |
| node/tests/skills/ | |
| node/tests/utils/ | |
| protocol/ | |
| protocol/conventions/ | |
| protocol/schemas/ | |
| protocol/state-machines/ | |
| rust/ | |
| rust/.eket.bak/ | |
| rust/.serena/ | |
| rust/.serena/memories/ | |
| rust/crates/ | |
| rust/crates/eket-cli/ | |
| rust/crates/eket-core/ | |
| rust/crates/eket-engine/ | |
| rust/crates/eket-server/ | |
| rust/docs/ | |
| rust/tests/ | |
| scripts/ | |
| scripts/hooks/ | |
| scripts/ignore-rules/ | |
| sdk/ | |
| sdk/javascript/ | |
| sdk/javascript/examples/ | |
| sdk/javascript/src/ | |
| sdk/javascript/tests/ | |
| sdk/python/ | |
| sdk/python/.benchmarks/ | |
| sdk/python/eket_sdk/ | |
| sdk/python/eket_sdk.egg-info/ | |
| sdk/python/examples/ | |
| sdk/python/htmlcov/ | |
| sdk/python/tests/ | |
| shared/ | |
| shared/message_queue/ | |
| shared/message_queue/inbox/ | |
| template/ | |
| template/.claude/ | |
| template/.claude/commands/ | |
| template/.eket/ | |
| template/.eket/analysis-roles/ | |
| template/.eket/config/ | |
| template/agents/ | |
| template/agents/coordinator/ | |
| template/agents/dynamic/ | |
| template/agents/executor/ | |
| template/agents/independent/ | |
| template/agents/reviewer/ | |
| template/confluence/ | |
| template/confluence/memory/ | |
| template/confluence/projects/ | |
| template/confluence/templates/ | |
| template/docs/ | |
| template/examples/ | |
| template/inbox/ | |
| template/inbox/human_feedback/ | |
| template/jira/ | |
| template/jira/state/ | |
| template/jira/templates/ | |
| template/jira/tickets/ | |
| template/node/ | |
| template/node/src/ | |
| template/scripts/ | |
| template/scripts/hooks/ | |
| template/shared/ | |
| template/shared/.state/ | |
| template/skills/ | |
| template/skills/design/ | |
| template/skills/development/ | |
| template/skills/devops/ | |
| template/skills/documentation/ | |
| template/skills/requirements/ | |
| template/skills/testing/ | |
| template/tasks/ | |
| templates/ | |
| templates/confluence/ | |
| templates/jira/ | |
| tests/ | |
| tests/compat/ | |
| tests/compat/cases/ | |
| tests/compat/fixtures/ | |
| tests/compat/lib/ | |
| tests/dry-run/ | |
| tests/dual-engine/ | |
| tests/dual-engine/fixtures/ | |
| tests/dual-engine/helpers/ | |
| tests/dual-engine/scenarios/ | |
| tests/fixtures/ | |
| tests/fixtures/anatomy/ | |
| tests/fixtures/codemod/ | |
| tests/fixtures/pr-size/ | |
| tests/integration/ | |
| tests/integration/scripts/ | |
| tests/integration/sdk/ | |
| web/ | |
| web/locales/ | |
| web/locales/en-US/ | |
| web/locales/zh-CN/ | |
<!-- eket:auto-section:end -->

---

## 6. 运维 & 部署

| 文件/目录 | 说明 |
|---------|------|
| examples/e2e-collaboration/scripts/cleanup.sh | |
| examples/e2e-collaboration/scripts/run-demo.sh | |
| examples/e2e-collaboration/scripts/start-redis.sh | |
| examples/e2e-collaboration/scripts/start-server.sh | |
| lib/adapters/hybrid-adapter.sh | |
| lib/state/atomic.sh | |
| lib/state/audit.sh | |
| lib/state/lock.sh | |
| lib/state/preflight.sh | |
| lib/state/schema.sh | |
| lib/state/writer.sh | |
| node/scripts/start-test-env.sh | |
| rust/tests/bench_claim.sh | |
| rust/tests/e2e_smoke.sh | |
| scripts/analyze-existing.sh | |
| scripts/audit-writes.sh | |
| scripts/backup-sqlite.sh | |
| scripts/broadcast-task-reset.sh | |
| scripts/check-branch-drift.sh | |
| scripts/check-debrief.sh | |
| scripts/check-docker.sh | |
| scripts/check-memory-entry.sh | |
| scripts/check-pr-size.sh | |
| scripts/check-requirement-analysis.sh | |
| scripts/check-skill-anatomy.sh | |
| scripts/check-ticket-immutability.sh | |
| scripts/checkpoint-sprint-retro.sh | |
| scripts/checkpoint-validator.sh | |
| scripts/cleanup-idle-agents.sh | |
| scripts/cleanup-project.sh | |
| docs/ops | |
| examples/e2e-collaboration/scripts | |
| k8s | |
| node/scripts | |
| scripts | |
| tests/integration/scripts | |

---

## 7. 文档导航

| 文档 | 说明 |
|------|------|
| CLAUDE.md | |
| confluence/memory/agent-prompt-template.md | |
| confluence/memory/branch-strategy-guide.md | |
| confluence/memory/ci-troubleshooting-playbook.md | |
| confluence/memory/codebase-maintenance.md | |
| confluence/memory/context-token-budget-guide.md | |
| confluence/memory/EPIC-002-lessons.md | |
| confluence/memory/EPIC-003-backport-lessons.md | |
| confluence/memory/EPIC-004-improvement-lessons.md | |
| confluence/memory/glossary/terms.md | |
| confluence/memory/lessons/eket-project-hygiene.md | |
| confluence/memory/lessons/multi-agent-collab-lessons.md | |
| confluence/memory/lessons/red-team-bug-patterns.md | |
| confluence/memory/lessons/research-methodology.md | |
| confluence/memory/lessons/spec4-feedback-intent-lessons.md | |
| confluence/memory/memory-index.md | |
| confluence/memory/patterns/knowledge-system.md | |
| confluence/memory/patterns/master-slaver-coordination.md | |
| confluence/memory/patterns/multi-layer-intent-aggregation.md | |
| confluence/memory/patterns/three-level-degradation.md | |

