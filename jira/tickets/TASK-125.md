# TASK-125: [Rust] saga-executor — Saga 补偿回滚

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: []

## 背景

TS `saga-executor.ts`(66行) 实现 Saga 补偿事务模式：多步骤执行失败时逆序回滚。
是 Slaver 多步任务（create worktree → 写代码 → run tests → submit PR）的失败保障。

## 验收标准

- [ ] `rust/crates/eket-core/src/saga.rs` 实现 `SagaExecutor<S>` 泛型结构体
- [ ] `SagaStep<S>` trait：`name()`, `forward(&mut S) -> Result<()>`, `compensate(&S) -> Result<()>`
- [ ] `SagaExecutor::add_step(step)` → builder 链式调用
- [ ] `SagaExecutor::execute(initial_state)` → `SagaResult<S>`
- [ ] `SagaResult<S>` 含：`success`, `state`, `completed_steps`, `failed_step`, `error`, `compensation_errors`
- [ ] 失败时：逆序调用已完成步骤的 `compensate()`，补偿失败记录但不 panic
- [ ] 单元测试 ≥ 5 条：全成功、中途失败触发回滚、补偿本身失败记录不崩溃、空步骤、单步

## 技术要点

- 泛型 `S: Clone`（状态需可克隆用于补偿）
- `forward` 返回 `Result<S, Box<dyn std::error::Error + Send + Sync>>` — 更新状态
- 补偿用失败时的 state 快照（forward 失败前的状态）
- `async_trait` 支持 async steps（forward/compensate 均 async）
