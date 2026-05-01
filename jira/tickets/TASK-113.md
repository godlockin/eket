# TASK-113: Slaver Saga 回滚 — 执行原子事务

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **PR**: https://github.com/godlockin/eket/pull/123
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-105a（WorktreeManager 已完成）

## 背景

Slaver 执行 ticket 是多步骤流程（创建 worktree → 写代码 → 跑测试 → commit/push → 创建 PR）。
当前若 step 3 失败，worktree 和部分文件残留，造成"脏状态"，需人工清理。
参考 SagaLLM 的 Saga 事务模式，为每个步骤注册补偿操作，失败时自动逆序回滚。

## 验收标准

- [ ] 新增 `node/src/core/saga-executor.ts`，导出 `SagaExecutor` class；验证：`ls node/src/core/saga-executor.ts`
- [ ] `SagaExecutor` 支持：`addStep(name, forward, compensate)`、`execute()`、失败时逆序调用已完成步骤的 compensate
- [ ] `WorktreeManager` 集成：saga 步骤包含 `createWorktree` → `writeCode(通知)` → `runTests` → `commitPush` → `createPR`，各步骤 compensate 已实现；验证：`grep -n "compensate" node/src/core/saga-executor.ts`
- [ ] `claim.ts` 改用 `SagaExecutor` 包装 worktree 创建，失败时自动 remove worktree；验证：`grep -n "SagaExecutor" node/src/commands/claim.ts`
- [ ] `complete.ts` 改用 `SagaExecutor` 包装 commit/push/PR，失败时自动 close PR + reset；验证：`grep -n "SagaExecutor" node/src/commands/complete.ts`
- [ ] ticket 状态机：saga 失败 → 状态置 `blocked` + 写 inbox 反馈 + 记录 `deferred_issues`；验证：`grep -n "blocked" node/src/core/saga-executor.ts`
- [ ] ≥6 单元测试：全部步骤成功、step2 失败回滚 step1、step3 失败回滚 step2+1、补偿失败记录但不再次抛出；验证：`npm test -- --testPathPattern=saga-executor 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// node/src/core/saga-executor.ts
interface SagaStep<T> {
  name: string;
  forward: (state: T) => Promise<T>;
  compensate: (state: T) => Promise<void>;
}

class SagaExecutor<T> {
  private steps: SagaStep<T>[] = [];
  private completed: SagaStep<T>[] = [];

  addStep(step: SagaStep<T>): this
  
  async execute(initialState: T): Promise<SagaResult<T>> {
    // 顺序执行 forward
    // 失败时逆序执行 compensate（已完成的步骤）
    // 补偿失败只记录，不再次抛出
  }
}
```

EKET ticket 执行的 5 个 saga 步骤：

| 步骤 | forward | compensate |
|------|---------|-----------|
| 1 | `createWorktree` | `removeWorktree --force` |
| 2 | 写代码（通知点，无需 compensate） | noop |
| 3 | `runTests` | noop（验证点） |
| 4 | `git commit && push` | `git reset --hard HEAD~1` + `git push --force` |
| 5 | `gh pr create` | `gh pr close` |
