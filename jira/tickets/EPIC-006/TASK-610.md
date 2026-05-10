---
agent_type: backend
estimate_hours: 004
status: backlog
priority: P2
created_at: 2026-05-10T23:30:00+08:00
---

# TASK-610: 修复历史测试失败 (125 tests)

**EPIC**: EPIC-006 | **Milestone**: M3-Cleanup | **优先级**: P2 | **工时**: 4h | **状态**: backlog | **依赖**: 无

## 需求

修复 EPIC-006 完成后遗留的 125 个测试失败，恢复 100% 测试通过率。

**当前测试状态**:
```
Test Suites: 9 failed, 98 passed, 107 total
Tests:       125 failed, 1427 passed, 1552 total
Pass Rate:   91.9%
```

**目标**: Pass Rate 91.9% → 100%

## 验收标准

- **AC-1**: Given 运行 `npm test`, When 全量测试执行, Then `Test Suites: 0 failed, 107 passed, 107 total`
- **AC-2**: Given 运行 `npm test`, When 全量测试执行, Then `Tests: 0 failed, 1552 passed, 1552 total`
- **AC-3**: Given 失败测试修复, When 修改代码, Then 不破坏 EPIC-006 已通过的 58 个测试
- **AC-4**: Given 修复完成, When 提交 PR, Then 包含失败原因分析 + 修复方案说明
- **AC-5**: Given 修复验证, When CI 运行, Then 全量测试通过（如有 CI）

## 失败测试分类

### Category 1: OptimizedFileQueueManager (11 tests)
**文件**: `tests/optimized-file-queue.test.ts`

**失败原因** (初步分析):
- Directory path issues (`.eket/memory` not found)
- Temp file cleanup timing

**建议修复**:
- 确保测试 setup 创建必需目录
- 使用独立 test fixtures 目录

### Category 2: WorkflowEngine Judgment (17 tests)
**文件**: `tests/workflow-judgment.test.ts`

**失败场景**:
- Judgment point pause/resume
- Timeout escalation
- Pending judgments query

**建议修复**:
- 检查 workflow engine 状态管理
- 验证 event emission
- 修复 judgment resolution logic

### Category 3: Memory Router (~97 tests)
**文件**: `tests/api/routes/memory.test.ts`

**失败原因**:
```
ENOENT: no such file or directory, mkdir '/Users/.../node/.eket/memory'
```

**根因**: 测试用 `fs.mkdirSync()` 同步 API，路径错误

**建议修复**:
```typescript
// BEFORE
fs.mkdirSync(testMemoryDir, { recursive: true });

// AFTER
await fs.promises.mkdir(testMemoryDir, { recursive: true });
// OR: 确保 testMemoryDir 路径正确
```

## 技术方案

### Phase 1: 诊断分析 (1h)
1. 运行单个测试套件定位具体失败
2. 分析堆栈 trace 识别根因
3. 分类失败类型 (path/timing/logic)

### Phase 2: 修复实现 (2h)
1. **Memory Router** (优先，97 tests):
   - 修复测试目录路径
   - 改用 async fs API
   - 确保 fixtures 正确设置

2. **Workflow Judgment** (17 tests):
   - 检查状态机实现
   - 修复 event handling
   - 验证 timeout 逻辑

3. **File Queue** (11 tests):
   - 修复 temp file cleanup
   - 独立 test fixtures

### Phase 3: 验证 + 文档 (1h)
1. 全量测试运行验证
2. 确认 EPIC-006 tests 未退化
3. 创建修复文档

## 测试策略

### 单元测试
```bash
# 逐个测试套件验证
npm test -- optimized-file-queue.test.ts
npm test -- workflow-judgment.test.ts
npm test -- api/routes/memory.test.ts
```

### 回归测试
```bash
# 确保 EPIC-006 未退化
npm test -- alert-manager.test.ts
npm test -- claude-runner-auto-compact.test.ts
npm test -- tool-output-filter.test.ts
npm test -- task-split.test.ts
npm test -- recovery-logger.test.ts
```

### 全量验证
```bash
npm test  # 预期: 0 failed, 1552 passed
```

## 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `tests/` | 高 | 仅修改测试文件，不改生产代码 |
| 生产代码 | 无 | 纯测试修复，0 生产代码变更 |
| EPIC-006 功能 | 无 | 确保不退化 |

## observability

- logs: ["test.fixed", "test.regression_check"]
- metrics: ["test.pass_rate_before", "test.pass_rate_after"]

## rollback_plan

Revert PR。纯测试修复，无业务影响。

---

**类型**: fix  
**技能要求**: Jest / TypeScript / Testing  
**依赖**: 无  
**assigned_experts**: qa-engineer, backend-engineer

---

## 优先级说明

**P2 (非阻塞)**:
- EPIC-006 核心功能已上线
- 125 失败测试不影响生产功能
- 可在后续迭代修复

**建议时机**:
- EPIC-007 规划前修复（清理技术债）
- 或与 EPIC-007 并行执行
