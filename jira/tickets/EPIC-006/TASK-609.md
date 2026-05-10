---
agent_type: backend
estimate_hours: 003
status: backlog
priority: P1
---

# TASK-609: 自动 Token Tracking + Compact 触发

**EPIC**: EPIC-006 | **Milestone**: M2-Monitoring | **优先级**: P1 | **工时**: 3h | **状态**: backlog | **依赖**: TASK-604

## 需求

在 `claude-runner.ts` 集成 ContextTracker，自动追踪工具输入/输出 tokens，达到阈值时自动触发 `/compact`。

## 验收标准

- **AC-1**: Given 工具调用产生输出, When `runClaude()` 执行完成, Then 自动调用 `contextTracker.trackToolOutput(sessionId, output)`
- **AC-2**: Given session tokens 达到 120k, When `contextTracker.shouldCompact()` 返回 true, Then 自动调用 `contextTracker.triggerCompact(sessionId)`
- **AC-3**: Given `/compact` 执行成功, When token 重置, Then session tokens 更新为 20k (post-compact 估算值)
- **AC-4**: Given `/compact` 失败, When 重试 1 次后仍失败, Then 创建告警 `inbox/human_feedback/[ALERT] compact-failed-SESSION-XXX.md`
- **AC-5**: Given 自动 compact 触发, When 命令执行, Then 日志记录: `[Auto-Compact] Session ${sessionId}: ${tokens} → 20k`

## 技术方案概要

### 集成点
1. `claude-runner.ts` - 输出追踪 + 自动 compact 检查
2. `handle400Error()` - 错误输出追踪
3. Compact 失败告警文件生成

### 核心逻辑
```typescript
// Auto-compact check after each tool call
if (contextTracker.shouldCompact(sessionId)) {
  await contextTracker.triggerCompact(sessionId);
  // Retry + Alert on failure
}
```

---

**类型**: feature  
**技能要求**: Node.js / TypeScript / CLI Integration  
**依赖**: TASK-604  
**assigned_experts**: backend-engineer

---

## 范围说明

**本 TASK**: 自动追踪 + 自动 compact  
**不包含**: Slaver 主动上报（TASK-608）

**与 TASK-607 关系**:
- TASK-607: 告警系统（被动）
- TASK-609: 自动 compact（主动预防）
