# TASK-120: Loop 节点迭代细化（Archon 借鉴）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-106（DAG pipeline 已完成）

## 背景

Archon 的 Loop 节点：当执行结果不满足验证门时，携带失败上下文重试，而非直接失败。
当前 EKET 的 SagaExecutor 只有「成功/失败回滚」两个路径，无「失败→学习→重试」语义。
Loop 节点为 pipeline 增加迭代细化能力：最多 N 次，每次携带上次失败原因。

## 验收标准

- [ ] `middleware-pipeline.ts` 的 `MiddlewareNode` 接口新增可选 `loop?: { maxRetries: number; validator: (state: T) => boolean }` 字段；验证：`grep -n "maxRetries" node/src/core/middleware-pipeline.ts`
- [ ] `PipelineExecutor.execute()` 支持 loop 语义：validator 返回 false → 将失败原因附加到 state → 重试，超过 maxRetries → failBehavior 处理；验证：`grep -n "loop" node/src/core/middleware-pipeline.ts`
- [ ] state 中新增 `_loopContext?: { attempt: number; lastFailReason: string }` 字段，供下次迭代使用；验证：`grep -n "_loopContext" node/src/core/middleware-pipeline.ts`
- [ ] hooks/pipelines/ 中 `pre-tool-use.ts` 的 GuardrailNode 使用 loop（最多 2 次重试）示例；验证：`grep -n "maxRetries" node/src/hooks/pipelines/pre-tool-use.ts`
- [ ] ≥4 单元测试：validator 通过不重试、validator 失败重试、超过 maxRetries 走 failBehavior、lastFailReason 正确传递；验证：`npm test -- --testPathPattern=middleware-pipeline 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// 扩展 MiddlewareNode
interface MiddlewareNode<T> {
  id: string;
  deps: string[];
  parallel: boolean;
  failBehavior: 'block' | 'warn' | 'skip';
  loop?: {
    maxRetries: number;
    validator: (state: T) => boolean | Promise<boolean>;
  };
  handle: (state: T) => Promise<T>;
}

// 执行逻辑（伪代码）
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  const result = await node.handle(state);
  if (!loop || await loop.validator(result)) return result;
  state = { ...result, _loopContext: { attempt, lastFailReason: '...' } };
}
// 超过限制 → failBehavior
```

## 完成记录

- **PR**: feature/TASK-119-ultrareview-v2 → miao → https://github.com/godlockin/eket/pull/131
- **实现**: `MiddlewareNode<T>` 新增 `loop?: LoopConfig<T>`，`PipelineExecutor.execute()` 支持 loop 重试语义，`_loopContext` 注入到 state
- **测试**: 新增 4 个 loop 单元测试 (tests 9-12 in middleware-pipeline.test.ts)，全部通过
- **完成时间**: 2026-04-20
