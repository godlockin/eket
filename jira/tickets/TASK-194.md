# TASK-194: 修复CircuitBreaker滑动窗口——一次成功不应归零failures

**状态**: done

**优先级**: P2
**类型**: Bug
**模块**: eket-core / circuit_breaker.rs:165
**来源**: 红队质疑 Linus

## 问题描述

`on_success` 在Closed状态无条件 `failures = 0`，任意一次成功清零所有历史失败记录。声称实现了滑动窗口但实际是"成功免死金牌"。

## 实现细节

- 替换 `failures: u32` → `failure_timestamps: VecDeque<Instant>`
- 新增 `evict_old_failures(&mut self, window: Duration)` 方法清理过期记录
- `on_failure()`: `failure_timestamps.push_back(Instant::now())`
- `on_success()` Closed分支：仅调用evict清理过期，不再清零队列
- `failure_count()` 返回 `failure_timestamps.len()`
- 测试更新：`success_does_not_reset_windowed_failures` 验证2+1+2失败后状态为Open

## 验收标准

- [x] 改用时间戳队列记录失败：`failures: VecDeque<Instant>`
- [x] `on_failure` push当前时间；`on_success`/统计时先清理窗口外的记录
- [x] `failure_count()` = 窗口内failure数量
- [x] `on_success` 不再清零（只清过期记录）
- [x] 更新所有相关测试

## 复盘

**What went well**:
- VecDeque<Instant>实现简洁，evict_old_failures()逻辑清晰
- 测试快速发现行为变化（success不再清零失败），及时更新测试预期
- BRPOP替换无障碍，零破坏性改动

**What could be improved**:
- 初次commit忘记更新ticket状态，需额外commit

**Lessons learned**:
- 滑动窗口需timestamp queue，不能只用counter+last_seen
- 测试失败时先确认：是代码错还是测试假设过时
- success不清零failures是正确行为（窗口内真实失败不应被单次成功抹掉）
