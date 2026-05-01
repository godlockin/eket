# TASK-194: 修复CircuitBreaker滑动窗口——一次成功不应归零failures

**优先级**: P2
**类型**: Bug
**模块**: eket-core / circuit_breaker.rs:165
**来源**: 红队质疑 Linus

## 问题描述

`on_success` 在Closed状态无条件 `failures = 0`，任意一次成功清零所有历史失败记录。声称实现了滑动窗口但实际是"成功免死金牌"。

## 验收标准

- [ ] 改用时间戳队列记录失败：`failures: VecDeque<Instant>`
- [ ] `on_failure` push当前时间；`on_success`/统计时先清理窗口外的记录
- [ ] `failure_count()` = 窗口内failure数量
- [ ] `on_success` 不再清零（只清过期记录）
- [ ] 更新所有相关测试
