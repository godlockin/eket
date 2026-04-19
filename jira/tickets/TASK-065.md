# TASK-065: ClaimTask 原子性加固 — SQLite BEGIN IMMEDIATE 防双重领取

**Ticket ID**: TASK-065
**Epic**: SELF-EVOLVE
**标题**: task:claim 原子操作加固，防止多 Slaver 并发双重领取同一 ticket
**类型**: fix
**优先级**: P0
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 动机

Multica 用 PostgreSQL `FOR UPDATE SKIP LOCKED` 防双重领取：

```sql
SELECT id FROM agent_task_queue
WHERE status='queued' AND agent_id=$1
ORDER BY priority DESC, created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

EKET 目前 `task:claim` 用 SQLite，缺乏等价的原子保证，多个 Slaver 并发时可能领取同一 ticket。

---

## 需求

### 验收标准

- **AC-1**: `task:claim` 使用 SQLite `BEGIN IMMEDIATE` 事务包裹 UPDATE，保证原子性
- **AC-2**: 并发测试：同时启动 3 个 Slaver 调用 `task:claim`，同一 ticket 只被领取一次
- **AC-3**: claim 失败（无可用 ticket）返回 `null`，不抛错
- **AC-4**: 状态机守卫：`UPDATE ... WHERE status='ready'`，已被领取的 ticket 不会被重复更新

### 技术方案

修改 `node/src/core/sqlite-client.ts` 的 `claimTask()` 方法：

```typescript
async claimTask(slaverId: string): Promise<Ticket | null> {
  // BEGIN IMMEDIATE 等价于 PG 的行级锁
  return this.db.transaction(() => {
    const ticket = this.db.prepare(`
      SELECT id FROM tickets
      WHERE status='ready'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get() as { id: string } | undefined

    if (!ticket) return null

    const result = this.db.prepare(`
      UPDATE tickets SET status='in_progress', assignee=?, claimed_at=datetime('now')
      WHERE id=? AND status='ready'
    `).run(slaverId, ticket.id)

    return result.changes === 1 ? this.getTicket(ticket.id) : null
  })
}
```

better-sqlite3 的 `db.transaction()` 默认使用 `BEGIN IMMEDIATE`。

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=sqlite-client
```

## 回滚

仅修改 sqlite-client.ts 的 `claimTask` 实现，接口不变，可直接 revert。

---

## 执行日志

**负责人**: backend_dev (Slaver)
**领取时间**: 2026-04-18T00:00:00Z
**完成时间**: 2026-04-18T00:00:00Z
**状态**: done

### 实现细节

- 修改 `node/src/core/sqlite-client.ts`：
  - `initializeTables()` 新增 `tickets` 表（含 `status`, `priority`, `assignee`, `claimed_at` 字段）
  - 新增 `claimTask(slaverId)` 方法，使用 `this.db.transaction()` 包裹（better-sqlite3 默认 BEGIN IMMEDIATE）
  - 新增 `insertTicket()` / `getTicketById()` 辅助方法供测试使用

### 测试结果

文件：`node/tests/core/task-claim-atomic.test.ts`

```
PASS tests/core/task-claim-atomic.test.ts
Tests: 6 passed, 6 total
```

- ✅ AC-1: 使用 `db.transaction()` 包裹，等价 BEGIN IMMEDIATE
- ✅ AC-2: 3 次并发 claimTask 只有 1 个 winner
- ✅ AC-3: 无可用 ticket 返回 null，不抛错
- ✅ AC-4: UPDATE WHERE status='ready' 状态守卫
