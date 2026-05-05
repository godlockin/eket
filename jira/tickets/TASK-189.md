# TASK-189: StaleCleaner改用SQLite updated_at而非文件mtime

**状态**: done

**优先级**: P1
**类型**: Bug
**模块**: eket-engine / monitors.rs:191
**来源**: 红队质疑 JeffDean

## 问题描述

`mtime` 由OS/FS决定。`git pull`、编辑器保存、rsync都会重置mtime，误判stale状态。应使用SQLite的 `updated_at` 字段作为权威时间戳。

## 验收标准

- [ ] `StaleCleaner` 改为查询 `SELECT id, updated_at FROM tasks WHERE status IN ('in_progress','ready')` 
- [ ] 用 `updated_at` 与 `now - threshold` 比较判断stale
- [ ] 移除 `std::fs::metadata` 调用
- [ ] 单元测试：插入updated_at=2小时前的task，StaleCleaner标记为stale；刚更新的不受影响
