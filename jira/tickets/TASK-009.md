# TASK-009: 测试修复完善

**类型**: Bug Fix
**优先级**: P0 - Critical
**负责人**: Slaver B (QA Specialist)
**Sprint**: Round 3 自举系统
**Feature 分支**: `feature/TASK-009-test-fixes-completion`
**预估时间**: 3-4 小时
**目标**: 测试通过率 47% → 90%+

---

## 📋 任务描述

完成 v2.2.0 遗留的测试修复工作，解决模块路径问题、Redis 连接超时、环境依赖等问题，批量修复失败测试，达成测试通过率 90% 以上。

---

## 🎯 目标

### 主要目标
- 测试套件通过率: 18/38 (47%) → **≥34/38 (90%)**
- 测试用例通过率: 751/1002 (75%) → **≥950/1002 (95%)**
- 消除模块路径错误
- 消除 Redis 连接超时错误
- 所有测试无外部依赖运行

### 次要目标
- 测试通过率达到 100% (38/38)
- 创建测试修复最佳实践文档
- 建立测试回归预防机制

---

## 📝 子任务

### Task 9.1: 修复模块路径问题 (1 小时)

**问题**:
```
Cannot find module '../../../src/integration/openclaw-adapter' from 'tests/integration/openclaw-adapter.test.ts'
Cannot find module 'core/master-context' from 'tests/master-context.test.ts'
```

**方案**:
1. 检查文件是否存在:
   ```bash
   ls src/integration/openclaw-adapter.ts
   ls src/core/master-context.ts
   ```
2. 如果不存在，创建 stub 实现或更新测试
3. 如果存在，修复导入路径（相对路径 vs 绝对路径）
4. 更新 `jest.config.js` 的 `moduleNameMapper` 如需要

**验证**:
```bash
npm test -- --testPathPattern=openclaw-adapter
npm test -- --testPathPattern=master-context
```

---

### Task 9.2: 修复 Redis 连接超时 (1 小时)

**问题**:
```
collaboration.test.ts - Exceeded timeout of 5000 ms for a test
tests/collaboration.test.ts:69 - should send help request
tests/collaboration.test.ts:84 - should send knowledge share
```

**方案**:
1. 使用已实现的 Redis Mock:
   ```typescript
   import { createRedisMock } from './helpers/redis-mock';

   // 在 beforeEach 中
   const redis = createRedisMock();
   ```
2. 更新 `tests/collaboration.test.ts`:
   - 替换真实 Redis 连接为 Mock
   - 或增加测试超时到 10000ms (临时方案)
3. 优化 CommunicationProtocol 的连接逻辑

**验证**:
```bash
npm test -- --testPathPattern=collaboration
```

---

### Task 9.3: 环境依赖测试改造 (1 小时)

**目标**: 所有测试都能在无外部依赖下运行

**步骤**:
1. 审计所有失败测试的依赖:
   ```bash
   npm test 2>&1 | grep "Cannot find\|timeout\|ECONNREFUSED" > failed-tests.txt
   ```
2. 分类失败原因:
   - 模块路径问题
   - 外部服务依赖 (Redis, SQLite)
   - 环境变量缺失
   - 测试逻辑错误
3. 使用 Mock/Stub 替代外部依赖:
   - Redis → `tests/helpers/redis-mock.ts`
   - SQLite → `tests/helpers/sqlite-test.ts` (内存数据库)
   - HTTP 服务 → `nock` 或自定义 stub
4. 更新测试 setup:
   ```typescript
   // tests/setup/test-environment.ts
   import { setupTestEnvironment } from './test-environment';
   beforeAll(setupTestEnvironment);
   ```

**验证**:
```bash
# 在无 Redis 和外部服务的环境运行
npm test
```

---

### Task 9.4: 测试用例批量修复 (1.5 小时)

**策略**: 按模块分组修复

#### 1. Core 模块测试 (优先级: P0)
```bash
npm test -- tests/core/
```
- `event-bus.test.ts`
- `workflow-engine.test.ts`
- `knowledge-base.test.ts`
- `circuit-breaker.test.ts`
- `cache-layer.test.ts`

#### 2. API 模块测试 (优先级: P0)
```bash
npm test -- tests/api/
```
- `web-dashboard.test.ts`
- `openclaw-gateway.test.ts`
- `eket-server.test.ts`
- `routes/*.test.ts`

#### 3. Commands 模块测试 (优先级: P1)
```bash
npm test -- tests/commands/
```
- `task.test.ts`
- `instance.test.ts`
- `sqlite.test.ts`

#### 4. Integration 测试 (优先级: P1)
```bash
npm test -- tests/integration/
```
- `master-slaver.test.ts`
- `three-repo-sync.test.ts`
- `workflow.test.ts`

**修复模式**:
- 使用 Redis Mock 替代真实连接
- 使用 SQLite 内存数据库
- 添加缺失的 Jest globals 导入 (如 Round 2)
- 修复异步测试的 timeout 设置
- 更新过时的 API 调用

**验证**:
```bash
# 每个模块修复后立即验证
npm test -- tests/core/
npm test -- tests/api/
npm test -- tests/commands/
npm test -- tests/integration/
```

---

## 📦 产出

### 代码修改
- [ ] `tests/integration/openclaw-adapter.test.ts` - 修复模块路径
- [ ] `tests/master-context.test.ts` - 修复模块路径
- [ ] `tests/collaboration.test.ts` - 使用 Redis Mock
- [ ] `tests/core/*.test.ts` - 批量修复 (10+ 文件)
- [ ] `tests/api/*.test.ts` - 批量修复 (10+ 文件)
- [ ] `tests/commands/*.test.ts` - 批量修复 (5+ 文件)
- [ ] `tests/integration/*.test.ts` - 批量修复 (5+ 文件)
- [ ] `jest.config.js` - 更新配置 (如需要)

### 文档
- [ ] `docs/test-reports/TASK-009-completion-report.md` - 测试修复完成报告
- [ ] `docs/test-reports/TASK-009-test-fix-summary.md` - 修复统计和分析

### Git 提交
建议原子提交:
1. `fix: 修复模块路径问题 (openclaw-adapter, master-context)`
2. `fix: 使用 Redis Mock 解决 collaboration 测试超时`
3. `fix: Core 模块测试批量修复 (10 files)`
4. `fix: API 模块测试批量修复 (10 files)`
5. `fix: Commands 和 Integration 测试修复`
6. `docs: 添加测试修复完成报告`

---

## ✅ 验收标准

### Must Have (必须)
- [x] 测试套件通过率 ≥ 90% (≥34/38)
- [x] 测试用例通过率 ≥ 95% (≥950/1002)
- [x] 模块路径错误 = 0
- [x] Redis 连接超时错误 = 0
- [x] 所有测试可无外部依赖运行
- [x] 测试修复报告完成

### Should Have (期望)
- [x] 测试套件通过率 = 100% (38/38)
- [x] 测试用例通过率 = 100% (1002/1002)
- [x] 测试执行时间 <30s
- [x] 测试覆盖率报告生成

### Could Have (可选)
- [ ] CI/CD 集成测试配置
- [ ] 测试回归预防机制
- [ ] 测试最佳实践文档

---

## 🚨 风险

### 风险 1: 测试修复复杂度超预期
**概率**: 中
**影响**: 高
**应对**: 优先修复高价值测试，允许部分低优先级测试延后

### 风险 2: Mock 行为与真实环境不一致
**概率**: 低
**影响**: 中
**应对**: 保留集成测试使用真实环境，单元测试使用 Mock

### 风险 3: 时间超出 4 小时
**概率**: 中
**影响**: 低
**应对**: 允许延期 1-2 小时，或调整目标为 90% 而非 100%

---

## 📊 进度跟踪

### 任务状态
- [ ] Task 9.1: 修复模块路径问题
- [ ] Task 9.2: 修复 Redis 连接超时
- [ ] Task 9.3: 环境依赖测试改造
- [ ] Task 9.4: 测试用例批量修复

### 测试进度
- 当前: 18/38 suites (47%), 751/1002 tests (75%)
- 目标: ≥34/38 suites (90%), ≥950/1002 tests (95%)
- 理想: 38/38 suites (100%), 1002/1002 tests (100%)

---

## 🔗 相关资源

- Round 2 测试修复: `docs/test-reports/TASK-007-test-fix-plan.md`
- Redis Mock 实现: `node/tests/helpers/redis-mock.ts`
- SQLite 测试工具: `node/tests/helpers/sqlite-test.ts`
- 测试环境指南: `docs/TEST_ENVIRONMENT_GUIDE.md`

---

**创建日期**: 2026-04-08
**创建者**: Master (Claude Opus 4.6)
**Sprint**: EKET Round 3 自举系统
**目标版本**: v2.3.0
