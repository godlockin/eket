# TASK-270: 修复 task:create 缺少 DB 写入逻辑

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: Rust Slaver
- **创建时间**: 2026-05-05
- **依赖**: []
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]

## 背景

（待填写）

## 验收标准

- [ ] （待填写）

## 技术方案

**实现位置**：
- `rust/crates/eket-cli/src/commands/task_create.rs`：添加 DB 写入逻辑
- `rust/crates/eket-core/src/db/mod.rs`：添加列迁移、priority 类型转换

**关键修改**：

1. **引入 DB 依赖**（task_create.rs L12-14）：
   ```rust
   use eket_core::config::EketConfig;
   use eket_core::db::{create_pool, SqliteClient};
   ```

2. **初始化 DB client**（run() 函数开头）：
   ```rust
   let db_client = match EketConfig::load() {
       Ok(config) => match create_pool(&config.sqlite.path) {
           Ok(pool) => Some(SqliteClient::new(pool)),
           Err(e) => { eprintln!("[WARN] ..."); None }
       },
       Err(_) => None
   };
   ```

3. **MD 写入后添加 DB 写入**（create_single_ticket() L374-384）：
   ```rust
   file.write_all(content.as_bytes())?;

   // Write to SQLite DB (TASK-270)
   if let Some(db) = db_client {
       if let Err(e) = db.create_ticket_with_source(
           &ticket_id, title, priority, ticket_type, "cli"
       ) {
           eprintln!("[WARN] Failed to write ticket to DB: {}", e);
       }
   }
   ```

4. **添加列迁移**（db/mod.rs L130-133）：
   ```rust
   ("type",       "ALTER TABLE tickets ADD COLUMN type TEXT ..."),
   ("updated_at", "ALTER TABLE tickets ADD COLUMN updated_at TEXT ..."),
   ```

5. **Priority 类型转换**（兼容旧 DB INTEGER 列）：
   ```rust
   let priority_int: i32 = match priority {
       "P0" => 0, "P1" => 1, "P2" | _ => 2,
   };
   conn.execute(..., params![..., priority_int, ...]);
   ```

**验收测试通过**：
```bash
# 创建 ticket
eket task:create "Final DB test" --expertise backend --effort 2h --no-interactive
# → TASK-279 创建成功

# 验证 DB
sqlite3 ~/.eket/data/sqlite/eket.db \
  "SELECT id, title, status, priority, type, source FROM tickets WHERE id='TASK-279';"
# → TASK-279|Final DB test|todo|2|test|cli|...

# 验证进度统计
eket task:progress | grep done
# → "done": 144, "in_progress": 3, ...
```

## 问题诊断

**现状**：`eket task:create` 只写 MD 文件（`jira/tickets/TASK-NNN.md`），不写入 SQLite DB 的 `tickets` 表。

**影响**：
- `eket task:progress` 读 DB 统计进度，永远为空
- `task:claim` 无法找到 ticket（SQL `WHERE id=? AND status='ready'` 查不到）
- Master/Slaver 依赖 DB 协作完全失效

**证据**：
```bash
eket task:create "test" --expertise any --effort 1h
# 结果：jira/tickets/TASK-NNN.md 创建 ✅
sqlite3 ~/.eket/data/sqlite/eket.db "SELECT * FROM tickets WHERE id='TASK-NNN';"
# 结果：(无输出) ❌
```

---

## 验收标准

- [ ] 找到 Rust 源码 `crates/eket-cli/src/commands/task_create.rs`（或类似路径）
- [ ] 在 MD 文件写入后，添加 DB 写入逻辑：
  ```rust
  db.execute(
    "INSERT INTO tickets (id, title, status, priority, ticket_type, created_at, updated_at)
     VALUES (?1, ?2, 'todo', ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    params![ticket_id, title, priority, ticket_type]
  )?;
  ```
- [ ] 执行 `eket task:create "test2" --expertise any --effort 1h`
- [ ] 验证：DB 中有记录 `SELECT * FROM tickets WHERE id='TASK-...'` 返回数据
- [ ] 验证：`eket task:progress` 显示新增 1 个 todo ticket

---

## 技术参考

**DB 位置**：`~/.eket/data/sqlite/eket.db`（全局）或项目根 `.eket/eket.db`（本地，需配置）

**tickets 表 schema**（参考 `system:doctor` 输出 或 strings 分析）：
```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',  -- 注意：create 时应设为 'todo'
  priority INTEGER NOT NULL DEFAULT 0,
  assignee TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**已知 Rust 代码片段**（从 `eket` binary strings 提取）：
- `UPDATE tickets SET status='in_progress', assignee=?1, updated_at=?2 WHERE id=?3 AND status='ready'`（claim 逻辑）
- DB 模块路径：`crates/eket-core/src/db/mod.rs`

---

## 影响范围

- `crates/eket-cli/src/commands/task_create.rs`（主要）
- `crates/eket-core/src/db/mod.rs`（可能需要添加 `insert_ticket()` 辅助函数）
