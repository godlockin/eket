# TASK-082: 断路修复 — TASK-072 确认 SSEEventBus 在可达分支上实现完整

**Ticket ID**: TASK-082
**Epic**: SELF-EVOLVE
**标题**: 修复断路：审查并修复 SSEEventBus 分支归属，确保 eket-server.ts 挂载正确
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

TASK-072 的 SSE 实现（`node/src/core/sse-event-bus.ts`）被 code-reviewer 报告"feature/TASK-072-sse-event-bus 分支无任何 SSE 相关文件"，但测试却通过。疑似实现代码落在下游分支（如 TASK-075）而非 TASK-072 分支，导致 feature/TASK-072 的 PR 合并后实际不包含实现。

**断路点**: 实现文件可能不在预期分支/PR 上，合并后实际缺失。

---

## 验收标准

- **AC-1**: 确认 `node/src/core/sse-event-bus.ts` 在主干（main/testing）分支存在且完整
- **AC-2**: 确认 `node/src/api/eket-server.ts` 已挂载 `GET /api/v1/stream/:channelId` 端点
- **AC-3**: 确认 `GET /api/v1/stream/__dashboard__` 全局广播频道可访问
- **AC-4**: 端到端测试：启动 server → curl SSE 端点 → 收到 heartbeat 事件
- **AC-5**: Master heartbeat 向 `__dashboard__` 广播 agent_status 事件（实际调用，非仅测试）

## 测试命令

```bash
cd node && npm test -- --testPathPattern=sse-event-bus
node dist/index.js web:dashboard --port 3001 &
curl -N http://localhost:3001/api/v1/stream/__dashboard__
# 应每30秒收到 heartbeat 事件
```
