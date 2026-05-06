# TASK-277: 修复 Node.js ticket-index-sync.test.ts — 适配 tickets 表

## 元数据
- **状态**: done
- **类型**: test
- **优先级**: P0
- **负责人**: Slaver-Node
- **创建时间**: 2026-05-06
- **完成时间**: 2026-05-06
- **依赖**: []
- **所需专家**: node, backend
- blocked_by: []
- required_expertise: [node, backend]

## 背景

（待填写）

## 验收标准

- [ ] （待填写）

## 技术方案

（待填写）

## 问题

**测试失败**：`tests/commands/ticket-index-sync.test.ts` 3个测试失败

**错误**：`SqliteError: no such table: ticket_index`

**根因**：TASK-272 废弃了 `ticket_index` 表，统一使用 `tickets` 表，但测试代码未同步更新。

---

## 验收标准

- [x] 修改测试：查询 `tickets` 表替代 `ticket_index`
- [x] 验证字段：`id, title, status, priority_text (TEXT), type`
- [x] 删除 `ticket_index` 建表相关测试代码（无专门建表测试）
- [x] `npm test tests/commands/ticket-index-sync.test.ts` 全绿（9/9 passed）

---

## 技术参考

**测试文件**：`node/tests/commands/ticket-index-sync.test.ts`

**需修改的查询**（推测 L129）：
```ts
// 改前
const rows = db.prepare('SELECT * FROM ticket_index ORDER BY id').all();

// 改后
const rows = db.prepare('SELECT * FROM tickets ORDER BY id').all();
```

**tickets 表 schema**：
```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'P2',  -- 注意：TEXT 不是 INTEGER
  type TEXT,
  assignee TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

---

## 影响范围

`node/tests/commands/ticket-index-sync.test.ts`（单文件修复）

---

## 实现细节

**修改内容**（3 处查询 + 字段名修正）：

1. **L129**: `SELECT * FROM ticket_index` → `tickets`，字段 `ticket_type` → `type`，`priority` → `priority_text`
2. **L153**: `SELECT id FROM ticket_index` → `tickets`
3. **L171**: `SELECT * FROM ticket_index WHERE id = ?` → `tickets`

**测试结果**：

```
PASS tests/commands/ticket-index-sync.test.ts
  parseTicketMdForSync
    ✓ 解析中文字段格式（**状态**: done）
    ✓ 解析 frontmatter 格式（status: in_progress）
    ✓ 中文字段优先于 frontmatter
    ✓ 非 TASK- 文件名返回 null
    ✓ status 别名归一化（完成 → done）
  syncToSqlite
    ✓ 写入多条 ticket 到 tickets 表
    ✓ 排除 archive 子目录下的文件
    ✓ INSERT OR REPLACE 更新已有记录
    ✓ jira/tickets 不存在时返回 failure

Tests: 9 passed, 9 total
```

**提交**：feature 分支，commit hash: [见 git log]

---

## 复盘

**遇到的坑**：

- DB 字段是 `priority_text` 不是 `priority`，需读源码确认 schema
- `type` 列名正确，但之前测试用的是 `ticket_type`

**经验**：

- 废弃表后，搜索全部测试文件中的引用（`grep -r "ticket_index" node/tests/`）
- 优先读 INSERT 语句确认字段名，避免猜测
