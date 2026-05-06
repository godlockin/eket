# TASK-145: WorkflowType::Parallel 实现（fan-out/join）

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: duplicate
- **创建**: 2026-04-21
- **依赖**: TASK-143（DAG 执行器）

## 背景

`WorkflowType::Parallel` variant 存在但 `_ => unimplemented!()` 未实现。
这导致任何并行工作流触发 panic。

## 验收标准

- [ ] `WorkflowEngine::execute_parallel()` fan-out：同时启动多个 step
- [ ] join 策略：`JoinPolicy::All`（全部完成）/ `JoinPolicy::Any`（任一完成）/ `JoinPolicy::Quorum(n)`
- [ ] 超时：`parallel_timeout_secs`，超时后强制 join 已完成结果
- [ ] 部分失败按 `FailBehavior` 处理
- [ ] 输出合并：各 step output 按 step_id 合并为 map

## 负责人
待认领（推荐：Rust 工程师）
