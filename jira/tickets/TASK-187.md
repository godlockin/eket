# TASK-187: 接通TriggerRule::OneSuccess/AllDone——当前为死代码

**优先级**: P1
**类型**: Bug
**模块**: eket-core / dag.rs:401
**来源**: 红队质疑 Linus

## 问题描述

`ready_tickets()` 硬编码 `TriggerRule::AllSuccess`，完全忽略每个ticket的`trigger_rule`字段。`OneSuccess`和`AllDone`变体从未在运行时生效。

```rust
can_proceed(blocked_by, TriggerRule::AllSuccess, completed, failed)  // 硬编码
```

## 验收标准

- [ ] 从ticket文件/数据库读取 `trigger_rule` 字段
- [ ] `ready_tickets()` 改为按每个ticket实际的 `trigger_rule` 调用 `can_proceed`
- [ ] 单元测试：`OneSuccess` ticket在一个前置成功后即ready；`AllDone` 在全部完成（含失败）后ready
