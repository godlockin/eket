# TASK-185: 修复assign_task + update_load TOCTOU竞争

**状态**: done

**优先级**: P1
**类型**: Bug
**模块**: eket-engine / agent_pool.rs:126
**来源**: 红队质疑 JeffDean

## 问题描述

`assign_task` 持读锁选出winner后释放锁，调用方再持写锁调用`update_load`。两次锁之间另一个协程可能选中同一agent，导致超载。`update_load`的`min(max_load)` cap不能防止双重分配。

## 验收标准

- [ ] `assign_task` 内部持写锁，原子完成"选举+负载+1"一步完成
- [ ] 新签名：`assign_task(&self, role, skills) -> TaskAssignmentResult`（内部自动increment load）
- [ ] 移除外部调用`update_load(+1)`的需求（只保留`-1`用于任务完成）
- [ ] 单元测试：100个并发`assign_task`，每个agent不超过`max_load`
