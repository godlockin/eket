# TASK-077: 断路修复 — TASK-065 claim.ts 接入 sqlite-client.claimTask()

**Ticket ID**: TASK-077
**Epic**: SELF-EVOLVE
**标题**: 修复断路：claim.ts 使用原子 SQLite 事务 claimTask() 替代文件系统操作
**类型**: bugfix
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 问题

TASK-065 在 `node/src/core/sqlite-client.ts` 实现了原子事务 `claimTask(ticketId, slaverId)` 防止并发重复领取。但 `node/src/commands/claim.ts` 仍使用文件系统读写 ticket `.md` 文件，`claimTask()` 零调用者，SQLite 原子性完全未生效。

**断路点**: `sqlite-client.claimTask()` 零调用者。

---

## 验收标准

- **AC-1**: `node/src/commands/claim.ts` 的 `claimTicket()` 函数必须调用 `sqliteClient.claimTask(ticketId, slaverId)`
- **AC-2**: SQLite 事务失败（已被抢占）时，返回错误并提示用户选择其他 ticket
- **AC-3**: SQLite 不可用时降级到文件系统（保持向后兼容）
- **AC-4**: 并发测试：2个 Slaver 同时 claim 同一 ticket，只有1个成功

## 测试命令

```bash
cd node && npm test -- --testPathPattern=claim
node dist/index.js task:claim TASK-001
```
