# TASK-007: 测试修复计划

**执行人**: Slaver B (测试修复专家)
**创建时间**: 2026-04-07
**目标**: 修复剩余测试套件，达成 100% 通过率

---

## 当前状态

### 测试统计
- **总测试套件**: 36 个
- **总测试文件**: 36 个 `.test.ts` 文件
- **当前失败**: 大量失败（需要进一步统计）

### 主要失败原因（基于测试输出分析）

#### P0: Jest Globals 未定义 (Critical)
**影响范围**: 几乎所有测试文件
**错误信息**: `ReferenceError: jest is not defined`

**受影响文件**:
- `tests/skills/unified-interface.test.ts` - 多处使用 `jest.fn()`
- 可能还有更多文件

**根本原因**:
- 测试文件未导入 Jest globals (`jest`, `describe`, `it`, `expect` 等)
- 需要在每个测试文件顶部添加: `import { jest, describe, it, expect } from '@jest/globals';`

**修复策略**:
1. 创建一个脚本批量添加 Jest imports
2. 手动验证每个测试文件
3. 运行测试确认修复

---

## 修复计划

### Phase 1: 批量修复 Jest Imports (2-3h)

**目标**: 修复所有 `jest is not defined` 错误

**实施步骤**:
1. 扫描所有 `.test.ts` 文件，检查是否已有 Jest imports
2. 对于缺少 imports 的文件:
   - 在文件顶部添加: `import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';`
   - 根据实际使用情况调整导入项（如需要 `beforeAll`/`afterAll` 等）
3. 分批验证修复效果

**优先级排序** (按依赖关系):
1. 核心模块测试 (15个):
   - `cache-layer.test.ts`
   - `circuit-breaker.test.ts`
   - `connection-manager.test.ts`
   - `master-election.test.ts`
   - `optimized-file-queue.test.ts`
   - 等

2. Skills 系统测试 (8个):
   - `skills/unified-interface.test.ts`
   - `skills/loader.test.ts`
   - `skills/registry.test.ts`
   - `skills/adapters/*.test.ts`
   - 等

3. API 测试 (7个):
   - `api/*.test.ts`
   - `api/routes/*.test.ts`
   - `api/middleware/*.test.ts`

4. 集成测试 (6个):
   - `collaboration.test.ts`
   - `i18n-integration.test.ts`
   - `integration/openclaw-adapter.test.ts`
   - 等

---

### Phase 2: 修复环境依赖问题 (2-3h)

**目标**: 处理 Redis/SQLite/WebSocket 等外部依赖

**常见问题**:
1. Redis 连接失败 → 使用 mock 或内存 Redis
2. SQLite 文件锁 → 使用临时数据库
3. WebSocket 超时 → 调整超时时间
4. 文件系统竞态 → 使用临时目录

**修复策略**:
1. 为每个测试套件创建独立的环境
2. 使用 `beforeEach`/`afterEach` 清理资源
3. Mock 外部依赖（如果不是集成测试）

---

### Phase 3: 修复测试逻辑问题 (1-2h)

**目标**: 修复测试本身的逻辑错误

**检查项**:
- [ ] 异步测试是否正确使用 `async/await`
- [ ] Mock 是否正确设置和清理
- [ ] 断言是否符合预期
- [ ] 超时时间是否合理

---

### Phase 4: 优化测试性能 (1h)

**目标**: 提升测试执行速度，确保 <30 秒

**优化方向**:
1. 并行执行独立测试
2. 减少不必要的 `setTimeout`
3. 优化 setup/teardown
4. 使用 `jest.useFakeTimers()` 加速时间相关测试

---

## 测试文件清单

### Core 模块测试 (15)
- [ ] `agent-mailbox.test.ts`
- [ ] `agent-pool.test.ts`
- [ ] `api-key-manager.test.ts`
- [ ] `cache-layer.test.ts`
- [ ] `circuit-breaker.test.ts`
- [ ] `connection-manager.test.ts`
- [ ] `context-snapshot.test.ts`
- [ ] `knowledge-base-extended.test.ts`
- [ ] `master-context.test.ts`
- [ ] `master-election.test.ts`
- [ ] `optimized-file-queue.test.ts`
- [ ] `recommender.test.ts`
- [ ] `workflow-judgment.test.ts`
- [ ] `websocket-message-queue.test.ts`
- [ ] `http-hook-server.test.ts`

### Skills 系统测试 (8)
- [ ] `skills/unified-interface.test.ts`
- [ ] `skills/loader.test.ts`
- [ ] `skills/registry.test.ts`
- [ ] `skills/adapters/claude-code-adapter.test.ts`
- [ ] `skills/adapters/codex-adapter.test.ts`
- [ ] `skills/adapters/openclaw-adapter.test.ts`
- [ ] `skills/design/api_design.test.ts`
- [ ] `skills/development/frontend_development.test.ts`
- [ ] `skills/requirements/requirement_decomposition.test.ts`

### API 测试 (7)
- [ ] `api/eket-server-security.test.ts`
- [ ] `api/openclaw-gateway.test.ts`
- [ ] `api/middleware/auth.test.ts`
- [ ] `api/middleware/rate-limiter.test.ts`
- [ ] `api/routes/agent.test.ts`
- [ ] `api/routes/memory.test.ts`
- [ ] `api/routes/task.test.ts`
- [ ] `api/routes/workflow.test.ts`

### 集成测试 (6)
- [ ] `collaboration.test.ts`
- [ ] `i18n-integration.test.ts`
- [ ] `i18n.test.ts`
- [ ] `integration/openclaw-adapter.test.ts`
- [ ] `sessions-websocket.test.ts`

**总计**: 36 个测试文件

---

## 执行时间表

| 阶段 | 预计时间 | 完成标准 |
|------|---------|---------|
| Phase 1: Jest Imports | 2-3h | 所有文件有正确的 imports，`jest is not defined` 错误消失 |
| Phase 2: 环境依赖 | 2-3h | Redis/SQLite 相关测试通过或正确 mock |
| Phase 3: 测试逻辑 | 1-2h | 所有断言正确，无逻辑错误 |
| Phase 4: 性能优化 | 1h | 测试执行时间 <30s |
| **总计** | **6-9h** | **100% 测试通过率** |

---

## 验收标准

### 必须达成 (Must Have)
- [ ] 100% 测试套件通过 (36/36)
- [ ] 所有测试用例通过
- [ ] 无 `jest is not defined` 错误
- [ ] 无 timeout 错误

### 应当达成 (Should Have)
- [ ] 测试执行时间 <30 秒
- [ ] 测试覆盖率报告生成
- [ ] 代码覆盖率 >80%

### 可以达成 (Nice to Have)
- [ ] 测试文档更新
- [ ] 添加测试最佳实践指南
- [ ] CI/CD 集成配置

---

## 风险和缓解

### 风险 1: 环境依赖复杂
**影响**: 可能需要更多时间配置测试环境
**缓解**: 优先使用 mock，减少真实依赖

### 风险 2: 测试设计问题
**影响**: 某些测试可能需要重构
**缓解**: 记录问题，与 Master 协商是否需要重构

### 风险 3: 性能瓶颈
**影响**: 测试执行时间可能超过 30s
**缓解**: 使用 `--maxWorkers` 调整并行度，优化慢速测试

---

## 下一步行动

1. ✅ 创建 feature branch: `feature/TASK-007-fix-remaining-tests`
2. ✅ 运行完整测试套件，收集失败信息
3. ✅ 创建本修复计划
4. ⏳ **开始 Phase 1: 批量修复 Jest Imports**

---

**更新日志**:
- 2026-04-07 15:00 - 初始版本创建
