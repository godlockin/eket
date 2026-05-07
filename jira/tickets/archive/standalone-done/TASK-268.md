# TASK-268: 实现 syncToSqlite — ticket:index --sync-sqlite 真正写入 SQLite

## 元数据

- **Ticket ID**: TASK-268
- **标题**: 实现 syncToSqlite — ticket:index --sync-sqlite 真正写入 SQLite
- **状态**: done
- **类型**: bugfix
- **优先级**: P1
- **负责人**: 待认领
- **创建时间**: 2026-05-05
- **所需专家**: node, backend
- **依赖**: []

---

## 背景

`node/src/commands/ticket-index.ts` 中 `syncToSqlite()` 是空实现（line ~394），导致 `eket task:progress` 读取的 SQLite `ticket_index` 表数据始终不更新。Slaver 完成任务后更新了 MD 文件的 `**状态**` 字段，但 DB 里仍显示旧状态，造成进度统计严重失真（当前显示 136 todo，实际大量已完成）。

```ts
// 现状：什么都没做
async function syncToSqlite(jiraDir: string): Promise<Result<void>> {
  console.log('✓ SQLite 同步完成（简化实现）');  // 骗人的
  return { success: true, data: undefined };
}
```

---

## 验收标准

- [ ] `syncToSqlite()` 扫描 `jira/tickets/TASK-*.md` 及子目录所有 `.md` ticket 文件
- [ ] 解析兼容两种格式：`**状态**: done`（中文字段）和 frontmatter `status: done`
- [ ] 用 `INSERT OR REPLACE` 写入 `.eket/eket.db` 的 `ticket_index` 表
- [ ] 执行 `node dist/index.js ticket:index --sync-sqlite` 后，`eket task:progress` 与 MD 状态一致
- [ ] `eket task:complete TASK-NNN` 末尾自动触发此同步（可选但推荐）
- [ ] 添加单元测试：mock MD文件 → 验证 DB 写入结果正确

---

## 技术参考

| 位置 | 说明 |
|------|------|
| `node/src/commands/ticket-index.ts:377` | `syncToSqlite()` 待实现函数 |
| `node/src/core/ticket-dag-parser.ts:44` | 解析正则：`/\*\*状态\*\*\s*:\s*(\S+)/` |
| `node/src/core/sqlite-client.ts` | SQLite 客户端 |
| `.eket/eket.db` | 目标数据库 |

目标表 schema：
```sql
CREATE TABLE ticket_index (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'P2',
  ticket_type TEXT, indexed_at INTEGER NOT NULL
);
```

---

## 影响范围

- `node/src/commands/ticket-index.ts`（主要）
- `node/src/commands/task-complete.ts`（可选：完成时自动触发）
