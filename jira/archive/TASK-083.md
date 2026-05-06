# TASK-083: 断路修复 — TASK-075 master-heartbeat 实际调用 canProceed()

**Ticket ID**: TASK-083
**Epic**: SELF-EVOLVE
**标题**: 修复断路：master-heartbeat 用 canProceed() 替换注释，实现 trigger_rule 解锁逻辑
**类型**: bugfix
**优先级**: P1
**重要性**: high

**状态**: superseded
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 问题

TASK-075 实现了 `canProceed(blockedBy, triggerRule, completedIds, failedIds)` 函数（`node/src/core/task-dependency.ts`），支持 all_success/one_success/all_done 三种规则。但 `node/src/commands/master-heartbeat.ts` 中 `generateReport()` 的 ticket 解锁判断处只有一行注释 `// TODO: use canProceed()`，实际仍是简单的 `all_success` 硬编码判断，`canProceed()` 零调用者。

**断路点**: `canProceed()` 未被 master-heartbeat 调用，trigger_rule 字段无效。

---

## 验收标准

- **AC-1**: `node/src/commands/master-heartbeat.ts` 的 `generateReport()` 函数：
  - 读取每个 ticket 的 `trigger_rule` 字段（默认 `all_success`）
  - 调用 `canProceed(blockedBy, triggerRule, completedIds, failedIds)` 判断是否可解锁
  - 将可解锁的 ticket 状态从 `blocked` → `ready`
- **AC-2**: 删除 `// TODO: use canProceed()` 注释
- **AC-3**: ticket 元数据解析支持 `trigger_rule` 字段
- **AC-4**: 集成测试：trigger_rule=one_success，1个前置完成 → ticket 解锁
- **AC-5**: 集成测试：trigger_rule=all_done，1个前置 failed → ticket 仍解锁

## 测试命令

```bash
cd node && npm test -- --testPathPattern=task-dependency
cd node && npm test -- --testPathPattern=master-heartbeat
```
