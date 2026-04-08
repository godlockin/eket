# TASK-007: 修复剩余测试套件

**负责人**: Slaver B (测试修复专家 - QA/Backend)
**优先级**: P1
**预估工时**: 10 小时
**状态**: IN_PROGRESS
**分支**: `feature/TASK-007-fix-remaining-tests`

---

## 任务状态 (Master - 2026-04-08)

**当前状态**:
- 测试套件：18/38 通过 (47%)
- 测试用例：943/1064 通过 (88%)
- 主要失败原因：Redis 连接超时，Jest globals 未定义

**剩余失败套件**: 20 个

---

## 失败原因分类

### P0: Jest Globals 未定义
**错误**: `ReferenceError: jest is not defined`
**影响**: 多个测试文件
**修复**: 添加 `import { jest, describe, it, expect } from '@jest/globals';`

### P1: Redis 连接超时
**错误**: `Exceeded timeout of 5000 ms for a test`
**影响**: `cache-layer.test.ts`, `collaboration.test.ts`
**修复**: 使用 Redis Mock 或增加超时时间

### P2: 模块路径问题
**错误**: `Cannot find module '...'`
**影响**: 集成测试
**修复**: 检查导入路径或创建 stub

---

## 执行清单

### Phase 1: Jest Imports 批量修复 (3h)
**目标**: 修复所有 `jest is not defined` 错误

**文件清单** (按优先级):
1. Core 模块 (10 个):
   - [ ] `cache-layer.test.ts`
   - [ ] `circuit-breaker.test.ts`
   - [ ] `connection-manager.test.ts`
   - [ ] `master-election.test.ts`
   - [ ] `optimized-file-queue.test.ts`
   - [ ] `context-snapshot.test.ts`
   - [ ] `knowledge-base-extended.test.ts`
   - [ ] `agent-pool.test.ts`
   - [ ] `workflow-judgment.test.ts`
   - [ ] `recommender.test.ts`

2. Skills 系统 (8 个):
   - [ ] `skills/unified-interface.test.ts`
   - [ ] `skills/loader.test.ts`
   - [ ] `skills/registry.test.ts`
   - [ ] `skills/adapters/claude-code-adapter.test.ts`
   - [ ] `skills/adapters/codex-adapter.test.ts`
   - [ ] `skills/adapters/openclaw-adapter.test.ts`
   - [ ] `skills/design/api_design.test.ts`
   - [ ] `skills/requirements/requirement_decomposition.test.ts`

3. API 测试 (7 个):
   - [ ] `api/eket-server-security.test.ts`
   - [ ] `api/openclaw-gateway.test.ts`
   - [ ] `api/middleware/auth.test.ts`
   - [ ] `api/middleware/rate-limiter.test.ts`
   - [ ] `api/routes/agent.test.ts`
   - [ ] `api/routes/memory.test.ts`
   - [ ] `api/routes/task.test.ts`

4. 集成测试 (6 个):
   - [ ] `collaboration.test.ts`
   - [ ] `i18n-integration.test.ts`
   - [ ] `i18n.test.ts`
   - [ ] `integration/openclaw-adapter.test.ts`
   - [ ] `sessions-websocket.test.ts`
   - [ ] `master-context.test.ts`

### Phase 2: Redis Mock 集成 (2h)
**目标**: 使用 Mock 替代真实 Redis 连接

- [ ] 检查现有 Redis Mock (`tests/helpers/redis-mock.ts`)
- [ ] 更新 `cache-layer.test.ts` 使用 Mock
- [ ] 更新 `collaboration.test.ts` 使用 Mock
- [ ] 验证 Mock 行为与真实 Redis 一致

### Phase 3: 环境依赖修复 (2h)
- [ ] SQLite 内存数据库配置
- [ ] 临时目录清理
- [ ] WebSocket 超时调整

### Phase 4: 测试逻辑修复 (2h)
- [ ] 修复异步测试的 async/await
- [ ] 修复 Mock 设置和清理
- [ ] 修复断言逻辑

### Phase 5: 性能优化 (1h)
- [ ] 使用 `--maxWorkers` 调整并行度
- [ ] 优化慢速测试
- [ ] 确保执行时间 <30s

---

## 验收标准
- [ ] 100% 测试套件通过 (38/38)
- [ ] 100% 测试用例通过 (1064/1064)
- [ ] 无 `jest is not defined` 错误
- [ ] 无 timeout 错误
- [ ] 测试执行时间 <30 秒

---

## 参考文档
- `docs/test-reports/TASK-007-test-fix-plan.md`
- `docs/test-reports/TASK-009-completion-report.md`

---

**创建日期**: 2026-04-08
**Master 分派**: 2026-04-08
