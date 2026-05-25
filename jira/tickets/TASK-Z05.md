# TASK-Z05: core/ 模块单元测试

**EPIC**: EPIC-014  
**状态**: done  
**优先级**: P0  
**预估**: 2d  
**负责人**: 待分配

---

## 背景

当前单元测试仅 1 个文件，`core/` 模块 (29,969 行) 缺乏细粒度测试。

## 目标

为 `node/src/core/` 关键模块添加单元测试，覆盖核心逻辑。

## 范围

优先级从高到低：

| 模块 | 文件 | 行数 | 优先级 |
|------|------|------|--------|
| ticket-manager | ticket-manager.ts | ~800 | P0 |
| progress-tracker | progress-tracker.ts | ~600 | P0 |
| knowledge-index | knowledge-index.ts | ~500 | P0 |
| expert-group | expert-group.ts | ~400 | P1 |
| message-queue | message-queue.ts | ~350 | P1 |

## 任务清单

### 1. 创建测试目录结构
```
node/tests/unit/core/
├── ticket-manager.test.ts
├── progress-tracker.test.ts
├── knowledge-index.test.ts
├── expert-group.test.ts
└── message-queue.test.ts
```

### 2. 每个模块测试要求

- 覆盖主要公共方法
- 至少 5 个测试用例
- 包含正常路径和错误路径
- Mock 外部依赖

### 3. 测试模板
```typescript
describe('ModuleName', () => {
  describe('methodName', () => {
    it('should handle normal case', () => {});
    it('should handle edge case', () => {});
    it('should throw on invalid input', () => {});
  });
});
```

## 验收标准

- [ ] `find node/tests/unit/core -name "*.ts" | wc -l` >= 5
- [ ] 每个文件至少 5 个测试用例
- [ ] `npm test -- --testPathPattern=unit/core` 全部通过
- [ ] 无 mock 泄漏

## 依赖

- 无前置依赖
- 被 TASK-Z08 依赖

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-25 | 创建 Ticket | Master |
