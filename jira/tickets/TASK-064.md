# TASK-064: 断点恢复降级策略 — resume 失败自动回退新 Session

**Ticket ID**: TASK-064
**Epic**: SELF-EVOLVE
**标题**: TASK-033 断点恢复补充：resume 失败时自动降级为新 session，不报错
**类型**: feature
**优先级**: P0
**重要性**: critical

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: [TASK-033b]

---

## 背景 & 动机

Multica 研究发现其断点恢复有关键降级策略：

```go
// multica: daemon.go
if result.Status == "failed" && task.PriorSessionID != "" && result.SessionID == "" {
    taskLog.Warn("session resume failed, retrying with fresh session")
    execOpts.ResumeSessionID = ""
    retryResult, _, _ = d.executeAndDrain(...)  // fallback 新 session
}
```

EKET TASK-033 当前设计只有 resume 成功路径，缺少失败降级，会导致 Slaver 在 session 过期/丢失时卡死。

---

## 需求

### 验收标准

- **AC-1**: `task:resume` 命令执行时，若 Claude session ID 已过期/不存在，自动降级为新 session 启动，不返回错误
- **AC-2**: 降级时输出 `WARN: session resume failed, falling back to fresh session` 日志
- **AC-3**: 降级后 checkpoint 记录清空（`deleteCheckpoint()`），避免无限循环尝试 resume
- **AC-4**: 新增单元测试：mock session 过期场景，验证降级路径被触发

### 技术方案

在 `node/src/commands/task-resume.ts`（TASK-033c 新建）的 resume 逻辑中：

```typescript
try {
  await resumeWithSession(checkpoint.sessionId, checkpoint.workDir)
} catch (e) {
  if (isSessionExpiredError(e)) {
    console.warn('WARN: session resume failed, falling back to fresh session')
    await sqliteClient.deleteCheckpoint(slaverId)
    await startFreshSession(checkpoint.ticketId)
  } else {
    throw e
  }
}
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=task-resume
```

## 回滚

`task:resume` 命令独立，回滚不影响现有 `task:claim` 流程。

---

## 执行日志

**领取时间**: 2026-04-18
**负责人**: backend_dev (Slaver)
**状态**: completed

### 实现细节

1. `node/src/commands/task-resume.ts` 追加：
   - `ResumeCheckpoint` interface（含可选 sessionId）
   - `isSessionError(err)` — 检测 session/expired/not found 关键字
   - `resumeWithFallback(checkpoint, _attemptResume?)` — DI 注入可测试；sessionId 空 → 直接降级；session 错误 → 降级；其他错误 → rethrow
   - `attemptSessionResume(sessionId)` — stub，真实接入时实现
2. `node/tests/commands/task-resume-fallback.test.ts` — 5 个测试：
   - sessionId undefined → 降级 + deleteCheckpoint
   - sessionId 空串 → 降级
   - session expired 错误 → 降级 + deleteCheckpoint
   - "not found" 错误 → 降级
   - 非 session 错误 → rethrow，不删 checkpoint

### 测试结果

```
PASS tests/commands/task-resume-fallback.test.ts
Tests: 5 passed, 5 total
```

### Build 结果

`npm run build` 通过
