# TASK-186: 修复JoinPolicy::Any——branch不取消、成功失败不区分

**状态**: done

**优先级**: P1
**类型**: Bug
**模块**: eket-engine / workflow.rs:565
**来源**: 红队质疑 Linus

## 问题描述

1. `JoinPolicy::Any` 第一个完成后 `break`，但 `rest` future被drop不等于tokio task取消，后台task继续消耗资源
2. 无条件break不区分成功/失败，语义变成"第一个完成不管成败"而非"第一个成功"
3. branch转boxed future时丢失id映射

## 验收标准

- [ ] 改用 `tokio::task::JoinHandle` 保存handles，第一个成功后调用其余的 `.abort()`
- [ ] Any语义修正：第一个**成功**的branch触发完成，全部失败才失败
- [ ] 保留branch id映射用于输出收集
- [ ] 单元测试：Any中有一个成功→其余被abort；Any中全部失败→workflow失败
