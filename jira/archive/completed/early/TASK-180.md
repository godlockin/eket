# TASK-180: 修复SQLite选举无互斥——INSERT OR IGNORE按id不按role

**状态**: done

**优先级**: P0
**类型**: Bug
**模块**: eket-core / election.rs
**来源**: 红队质疑 Linus+JeffDean

## 问题描述

`election.rs:215` 的SQLite选举用 `INSERT OR IGNORE INTO instances(id, role, ...)` 按 `id`（instance_id）做唯一约束。两个进程各自有不同id，两者都能插入成功，都得到 `rows > 0 = true`，**同时赢得选举 → split-brain**。

```rust
// 当前错误实现
conn.execute(
    "INSERT OR IGNORE INTO instances (id, role, status, last_seen, created_at)
     VALUES (?1, 'master', 'active', ?2, ?2)",
    rusqlite::params![id, now],
)?;
Ok(rows > 0)
```

## 验收标准

- [ ] 新建 `master_lock` 单行锁表，`singleton INTEGER PRIMARY KEY CHECK(singleton=1)` 保证唯一
- [ ] 选举 SQL 改为 `INSERT OR IGNORE INTO master_lock(singleton,holder_id,acquired_at,expires_at) VALUES(1,?,?,?)`
- [ ] 续约 SQL 改为 `UPDATE master_lock SET expires_at=? WHERE singleton=1 AND holder_id=?`，检查rows_affected==0则触发resign
- [ ] 旧 `instances` 表选举逻辑全部迁移
- [ ] 单元测试：两进程共享同一SQLite，只有一个能赢
- [ ] migration SQL更新
