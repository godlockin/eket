# TASK-072: SSE 事件体系 — 替换轮询，实时推送 Agent 状态

**Ticket ID**: TASK-072
**Epic**: SELF-EVOLVE
**标题**: 借鉴 Archon：eket-server 新增 SSE 端点，定义 15 种事件类型，支持全局 Agent 状态广播
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: done
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: Slaver (backend)

**依赖关系**:
- blocks: [TASK-073]
- blocked_by: []

---

## 背景 & 动机

Archon 用原生 SSE（Server-Sent Events）替代轮询，定义了完整的15种事件类型体系，包括文本流式输出（50ms batch）、节点状态更新、全局广播频道等。EKET 目前 Dashboard 无前端，后端用 WebSocket，缺乏标准化事件协议。

---

## 需求

### 验收标准

- **AC-1**: `node/src/api/eket-server.ts` 新增 `GET /api/v1/stream/:channelId` SSE 端点
- **AC-2**: 新增 `GET /api/v1/stream/__dashboard__` 全局广播频道（所有 Agent 状态变更广播到此）
- **AC-3**: 新建 `node/src/core/sse-event-bus.ts`，支持以下核心事件类型：

```typescript
type SSEEventType =
  | 'text'               // 流式文本 token
  | 'agent_status'       // Agent 状态变更（claimed/in_progress/done/blocked）
  | 'ticket_progress'    // Ticket 执行进度
  | 'heartbeat'          // 保活（30s 间隔）
  | 'conversation_lock'  // 锁定状态 + 队列位置
  | 'tool_call'          // 工具调用开始
  | 'tool_result'        // 工具调用结果
  | 'error'              // 错误（含 classification）
  | 'system_status'      // 系统状态
```

- **AC-4**: `sse-event-bus.ts` 实现发布/订阅，channel 级隔离，支持多客户端连接
- **AC-5**: Master heartbeat 循环每次 `generateReport()` 后向 `__dashboard__` 广播所有 Agent 当前状态
- **AC-6**: 单元测试：SSE 端点可连接、事件发布后订阅者收到、heartbeat 30s 触发

### 技术方案

```typescript
// node/src/core/sse-event-bus.ts
interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

class SSEEventBus {
  private channels = new Map<string, Set<Response>>();

  subscribe(channelId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // 加入 channel，断线时自动移除
  }

  publish(channelId: string, event: SSEEvent): void {
    const clients = this.channels.get(channelId) ?? new Set();
    const data = `data: ${JSON.stringify(event)}\n\n`;
    clients.forEach(res => res.write(data));
    // 同时广播到 __dashboard__
  }
}
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=sse-event-bus
```

## 回滚

新增端点和模块，不修改现有 WebSocket 逻辑，并行运行。

---

## 执行日志

**领取时间**: 2026-04-19
**完成时间**: 2026-04-19
**执行者**: Slaver (backend)

### 实现细节

1. 新建 `node/src/core/sse-event-bus.ts` — SSEEventBus 类 + globalSSEBus 单例
   - 支持 9 种 SSEEventType
   - channel 级隔离，多客户端连接
   - publish 自动广播到 `__dashboard__`
   - subscribe 返回 unsubscribe 函数，监听 `res.on('close')`

2. 修改 `node/src/api/eket-server.ts` — 新增两个端点：
   - `GET /api/v1/stream/__dashboard__`
   - `GET /api/v1/stream/:channelId`

3. 修改 `node/src/commands/master-heartbeat.ts` — generateReport 后广播 system_status

4. 新建 `node/tests/core/sse-event-bus.test.ts` — 8 个单元测试全部通过

### 测试结果

```
Tests: 8 passed, 8 total
```

### PR

branch: feature/TASK-072-sse-event-bus
