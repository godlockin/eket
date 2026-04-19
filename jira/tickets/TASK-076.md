# TASK-076: 断路修复 — TASK-064 task:resume 接入 resumeWithFallback()

**Ticket ID**: TASK-076
**Epic**: SELF-EVOLVE
**标题**: 修复断路：task:resume CLI 命令实际调用 resumeWithFallback()
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

TASK-064 实现了 `resumeWithFallback(slaverId)` 函数（`node/src/core/session-resume.ts`），并写了测试通过。但 `node/src/commands/task-resume.ts` 中的 `registerTaskResume()` CLI action 并未调用此函数，而是直接读取 checkpoint 文件后输出提示信息，没有真正触发恢复逻辑。

**断路点**: `resumeWithFallback()` 零调用者。

---

## 验收标准

- **AC-1**: `node/src/commands/task-resume.ts` 的 resume action 必须调用 `resumeWithFallback(slaverId)`
- **AC-2**: `resumeWithFallback()` 返回的恢复状态（phase、filesChanged、lastAction）必须输出到 console
- **AC-3**: 无 checkpoint 时，fallback 到 `task:claim` 正常流程
- **AC-4**: 单元测试覆盖：有 checkpoint → 调用 resumeWithFallback；无 checkpoint → fallback task:claim

## 测试命令

```bash
cd node && npm test -- --testPathPattern=task-resume
node dist/index.js task:resume --slaver slaver_1
```
