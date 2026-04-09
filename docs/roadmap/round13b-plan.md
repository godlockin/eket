# Round 13b Sprint 计划 - CI/CD + 健康检查

**制定时间**: 2026-04-09
**当前版本**: v2.4.0 (Round 13a 完成)
**目标版本**: v2.5.0
**状态**: 🔄 进行中

---

## 📋 背景

Round 13a 完成了清账工作（1079/1079 tests, openclaw-adapter 降级修复，版本对齐 v2.4.0）。

Round 13b 目标：补齐 CI/CD 和生产可观测性基础设施。

---

## 🎯 任务清单

| JIRA | 任务 | 负责 | 状态 | PR |
|------|------|------|------|-----|
| TASK-013 | GitHub Actions CI 流水线 | Slaver-1 | 🔄 进行中 | #1 open |
| TASK-014 | 健康检查端点 /health /ready /live | Master | ✅ 完成 | #2 open |
| TASK-015 | Roadmap 文档对齐 | Master | ✅ 完成 | #3 open |

---

## 📌 TASK-013: GitHub Actions CI

**分支**: `feature/TASK-013-github-actions-ci`
**PR**: https://github.com/godlockin/eket/pull/1

### 实现内容

- `.github/workflows/ci.yml` — 自动测试流水线
- 触发条件：push 任意分支 + PR 到 main/testing/miao
- Node.js 20 + `NODE_OPTIONS=--experimental-vm-modules`
- 步骤：checkout → setup-node → npm ci → build → test

### 验收标准

- [x] YAML 语法正确
- [x] 包含 experimental-vm-modules 标志
- [x] PR 已创建

---

## 📌 TASK-014: 健康检查端点

**分支**: `feature/TASK-014-health-endpoints`
**PR**: https://github.com/godlockin/eket/pull/2

### 实现内容

**EketServer (Express)**:
- `GET /health` — 200, `{status, version, uptime, timestamp, dependencies}`
- `GET /ready` — 200, `{ready: true}`
- `GET /live` — 200, `{alive: true}`

**WebDashboardServer (raw http)**:
- `GET /health` — 200, `{status, version, uptime, timestamp, checks}`
- `GET /ready` — 200, `{ready: true}`
- `GET /live` — 200, `{alive: true}`

**Bug fix**: `config.port || 3000` → `config.port ?? 3000`（修复 port=0 误判）

### 测试

- `tests/api/health.test.ts` — 7 tests, 7 passed
- 全套 1079/1079 通过

### 验收标准

- [x] EketServer 三端点 200
- [x] WebDashboardServer 三端点 200
- [x] 1079/1079 tests 通过
- [x] PR 已创建

---

## 📌 TASK-015: Roadmap 文档对齐

**分支**: `feature/TASK-015-roadmap-docs`

### 实现内容

- `docs/roadmap/v3.0-strategy.md` — 版本号 v2.4.0，Round 历史更新，健康检查✅
- `docs/roadmap/round10-14-plan.md` — Round 10-12 标记完成，13a/13b 内容准确，Round 14 改为 SDK
- `docs/roadmap/round13b-plan.md` — 本文件，新建

### 验收标准

- [x] v3.0-strategy.md 版本号正确
- [x] round10-14-plan.md 与实际进度对齐
- [x] round13b-plan.md 创建

---

## 📊 完成标准（v2.5.0）

- [ ] PR #1 合并（GitHub Actions CI）
- [ ] PR #2 合并（健康检查端点）
- [ ] PR #3 合并（Roadmap 文档）
- [ ] 分支保护规则配置（main/miao）
- [ ] v2.5.0 tag 打出

---

## 🔗 相关文档

- [v3.0 战略规划](v3.0-strategy.md)
- [Round 10-14 计划](round10-14-plan.md)
- [JIRA TASK-013](../../jira/tickets/TASK-013.md)
- [JIRA TASK-014](../../jira/tickets/TASK-014.md)
- [JIRA TASK-015](../../jira/tickets/TASK-015.md)

---

**制定者**: Master Agent
**审批状态**: 执行中
