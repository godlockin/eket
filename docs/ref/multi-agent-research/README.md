# Claude Code 2.1.88 多 Agent 框架参考分析

> 研究目的：为构建"常驻服务器做代理、多 Agent 实例分角色协作"框架提取可复用的设计与代码。

---

## 目录结构

```
multi-agent-research/
├── README.md                      ← 本文件（完整分析）
├── 01-swarm-team/                 ← Swarm / Team 架构
│   ├── team-file-structure.ts     ← TeamFile 数据结构
│   ├── team-helpers.ts            ← 团队注册、读写、路径管理
│   ├── reconnection.ts            ← Swarm 重连与上下文初始化
│   └── coordinator-mode.ts       ← Coordinator 角色模式
├── 02-messaging/                  ← 消息通信系统
│   ├── teammate-mailbox.ts        ← 文件 Mailbox 消息总线
│   └── send-message-tool.ts      ← Agent 间消息协议与寻址
├── 03-bridge-remote/              ← Bridge / 远程 Agent 基础设施
│   ├── bridge-main.ts             ← 常驻服务代理核心
│   ├── sessions-websocket.ts      ← WebSocket 会话订阅
│   └── remote-session-manager.ts ← 远程会话管理
├── 04-hooks/                      ← Hook 事件系统
│   ├── hook-events-enum.ts        ← 28 个生命周期事件枚举
│   └── hook-event-system.ts      ← 事件广播与处理器注册
├── 05-permissions-context/        ← 权限、模型路由、上下文管理
│   ├── permission-modes.ts        ← 权限模式定义
│   ├── provider-routing.ts        ← 多提供商模型路由
│   └── compact-strategies.ts     ← 上下文压缩策略
└── 06-backend-abstraction/        ← Backend 抽象层
    ├── backend-types.ts           ← BackendType 接口与 PaneBackend
    └── in-process-backend.ts     ← 同进程 Agent 执行器
```

---

## 一、Agent Swarm 架构（最直接相关）

### 1. Team / Swarm 整体模型

**源文件：** `src/utils/swarm/teamHelpers.ts`、`src/utils/swarm/reconnection.ts`

Claude Code 内部实现了完整的 Agent 协作编排框架，称为 **Swarm**。

TeamFile 存储位置：`.claude/teams/{team_name}/team.json`

```typescript
type TeamFile = {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string        // 领队实际 Session UUID（用于发现）
  hiddenPaneIds?: string[]      // 当前隐藏的 UI 面板 ID
  teamAllowedPaths?: TeamAllowedPath[]  // 所有 teammate 无需单独审批即可写的路径
  members: Array<{
    agentId: string
    name: string
    agentType?: string          // 角色类型，如 "researcher", "test-runner"
    model?: string              // 可独立指定模型
    prompt?: string             // 角色专属 system prompt
    color?: string              // UI 显示颜色
    planModeRequired?: boolean  // 是否强制要求 plan 模式
    joinedAt: number
  }>
}
```

**✅ 对你的价值：** 直接借鉴此数据结构来管理你的 Agent 实例列表、角色、模型分配。

---

### 2. Backend 抽象层 — 三种 Agent 执行模式

**源文件：** `src/utils/swarm/backends/types.ts`

```typescript
type BackendType = 'tmux' | 'iterm2' | 'in-process'
```

| Backend | 隔离方式 | 共享资源 | 通信方式 |
|---|---|---|---|
| `tmux` | 独立进程 + tmux pane | 无 | 文件 mailbox |
| `iterm2` | 独立进程 + iTerm2 pane | 无 | 文件 mailbox |
| `in-process` | AsyncLocalStorage 隔离 | API client、MCP 连接 | 文件 mailbox（同上） |

**✅ 对你的价值：** 你的"常驻服务器"模式对应 `in-process` backend——同进程内用上下文隔离运行多个 Agent，共享基础设施，用统一消息总线通信。

---

### 3. Coordinator 模式

**源文件：** `src/coordinator/coordinatorMode.ts`

通过 `CLAUDE_CODE_COORDINATOR_MODE` 环境变量激活独立 Coordinator 角色：

```typescript
// Coordinator 专属工具集（Worker 没有这些）
const INTERNAL_WORKER_TOOLS = new Set([
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])

export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}
```

**✅ 对你的价值：** Supervisor 模式的参考实现——Coordinator 有高级权限（创建/删除团队、广播消息），Worker 被约束。借鉴此权限分层设计你的 orchestrator/worker 角色体系。

---

## 二、文件 Mailbox 消息系统

**源文件：** `src/utils/teammateMailbox.ts`

每个 Agent 有一个文件收件箱：

```
~/.claude/teams/{team_name}/inboxes/{agent_name}.json
```

关键设计：
- **文件锁（lockfile）** 防止多进程并发写入冲突
- **重试退避**（10次重试，5-100ms 随机间隔）
- 消息格式见 `02-messaging/teammate-mailbox.ts`

```typescript
type TeammateMessage = {
  from: string
  text: string
  timestamp: string
  read: boolean
  color?: string    // 发送方颜色标识
  summary?: string  // 5-10 词摘要，用于 UI 预览
}
```

**✅ 对你的价值：** 无需中间人的 P2P 文件消息总线。多进程安全，天然持久化，无需额外基础设施。

---

## 三、SendMessageTool — Agent 间消息协议

**源文件：** `src/tools/SendMessageTool/SendMessageTool.ts`

### 寻址方式

```
teammate_name        → 按名字单播
"*"                  → 广播给所有 teammate
"uds:<socket-path>"  → Unix Domain Socket（本地 peer）
"bridge:<session-id>"→ 远程 Bridge session
```

### 内置结构化消息类型

```typescript
type StructuredMessage =
  | { type: 'shutdown_request'; reason?: string }
  | { type: 'shutdown_response'; request_id: string; approve: boolean; reason?: string }
  | { type: 'plan_approval_response'; request_id: string; approve: boolean; feedback?: string }
```

**✅ 对你的价值：** 完整的 Agent 间寻址 + 结构化协议设计。可扩展此消息类型定义你的角色协作协议（task delegation、result reporting、approval flows）。

---

## 四、Bridge 架构 — 常驻服务代理

**源文件：** `src/bridge/bridgeMain.ts`、`bridgeApi.ts`

这正是"常驻服务器做代理"模式！

### 退避重连配置

```typescript
const DEFAULT_BACKOFF: BackoffConfig = {
  connInitialMs: 2_000,
  connCapMs: 120_000,    // 最大重连间隔 2 分钟
  connGiveUpMs: 600_000, // 10 分钟后放弃
  generalInitialMs: 500,
  generalCapMs: 30_000,
  generalGiveUpMs: 600_000,
}
```

### Bridge 生命周期

```
1. registerWorker()        → 向服务端注册，获取 work_secret
2. Poll / WebSocket        → 等待工作任务
3. createSessionSpawner()  → 根据任务生成 Agent 会话
4. 执行完成               → stopWork()，重新等待
```

**✅ 对你的价值：** 生产级 Agent Pool 设计。支持断线重连、指数退避、容量唤醒（`capacityWake`）、会话快照恢复。

---

## 五、WebSocket 会话订阅

**源文件：** `src/remote/SessionsWebSocket.ts`、`RemoteSessionManager.ts`

### 协议设计

```
连接：wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...
认证：{ type: 'auth', credential: { type: 'oauth', token: '...' } }
```

### 错误码分类

```typescript
// 永久错误——立即停止重连
const PERMANENT_CLOSE_CODES = new Set([
  4003, // unauthorized
])

// 可重试错误——有限次重试（如 compaction 期间短暂不可用）
const MAX_SESSION_NOT_FOUND_RETRIES = 3  // 4001: session not found
```

### 心跳保活

```typescript
const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 5
const PING_INTERVAL_MS = 30000  // 30秒心跳
```

### 消息类型区分

```typescript
type SessionsMessage =
  | SDKMessage           // 正常业务消息
  | SDKControlRequest    // 控制请求（如权限询问）
  | SDKControlResponse   // 控制响应
  | SDKControlCancelRequest  // 取消控制请求

// viewerOnly 模式：纯观察者，不发送中断
type RemoteSessionConfig = {
  sessionId: string
  getAccessToken: () => string
  orgUuid: string
  hasInitialPrompt?: boolean
  viewerOnly?: boolean   // true = 只读观察，不影响 Agent 执行
}
```

**✅ 对你的价值：** 你的服务端-Agent 通信层参考设计，特别是认证流程、错误码分类和只读观察者模式。

---

## 六、Hook 事件系统 — 全生命周期感知

**源文件：** `src/entrypoints/sdk/coreTypes.ts`、`src/utils/hooks/hookEvents.ts`

### 完整事件枚举（28个）

```typescript
const HOOK_EVENTS = [
  // 工具调用
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  // 用户交互
  'Notification', 'UserPromptSubmit',
  // 会话生命周期
  'SessionStart', 'SessionEnd',
  // 停止
  'Stop', 'StopFailure',
  // Subagent 生命周期
  'SubagentStart', 'SubagentStop',
  // 上下文压缩
  'PreCompact', 'PostCompact',
  // 权限
  'PermissionRequest', 'PermissionDenied',
  // 初始化
  'Setup',
  // 团队协作
  'TeammateIdle',
  // 任务
  'TaskCreated', 'TaskCompleted',
  // 交互决策
  'Elicitation', 'ElicitationResult',
  // 配置与文件系统
  'ConfigChange',
  'WorktreeCreate', 'WorktreeRemove',
  'InstructionsLoaded', 'CwdChanged', 'FileChanged',
] as const
```

### 事件广播实现

```typescript
// 支持"先于处理器注册前产生的事件"缓冲
const MAX_PENDING_EVENTS = 100
const pendingEvents: HookExecutionEvent[] = []
let eventHandler: HookEventHandler | null = null

export function registerHookEventHandler(handler: HookEventHandler | null): void {
  eventHandler = handler
  // 处理器注册时，补发缓冲中的历史事件
  if (handler && pendingEvents.length > 0) {
    for (const event of pendingEvents.splice(0)) {
      handler(event)
    }
  }
}
```

### Hook 支持三种后端

- **Shell 脚本** — 最简单，通过 `execAgentHook.ts`
- **HTTP 端点** — 你的服务端接收回调，通过 `execHttpHook.ts`
- **Agent SDK 回调** — 程序化注册，通过 `postSamplingHooks.ts`

**✅ 对你的价值：** 通过 HTTP Hook，你的常驻服务器可以在每个 Agent 工具调用前后接收通知，实现集中式监控、审计、权限决策。`TeammateIdle` → 触发新任务分配；`TaskCompleted` → 触发下游 Agent。

---

## 七、权限系统 — 多 Agent 安全边界

**源文件：** `src/utils/permissions/`

```typescript
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
```

### leaderPermissionBridge — 权限上报机制

```typescript
// Teammate 的敏感操作请求 → 上报给 Leader 审批
// 文件：src/utils/swarm/leaderPermissionBridge.ts
```

### 团队共享路径白名单

```typescript
type TeamAllowedPath = {
  path: string      // 绝对路径
  toolName: string  // 适用的工具（如 "Edit", "Write"）
  addedBy: string   // 添加此规则的 Agent 名
  addedAt: number   // 时间戳
}
```

**✅ 对你的价值：** `leaderPermissionBridge` 模式 → 扩展为服务端统一审批中心，所有 Agent 敏感操作向服务端申报。

---

## 八、上下文工程

### 自动 Compact
**源文件：** `src/services/compact/autoCompact.ts`、`microCompact.ts`

- Token 警告阈值触发自动压缩
- `PreCompact`/`PostCompact` Hook 配合压缩前后通知
- `buildPostCompactMessages()` 压缩后重建消息历史

### 工具结果外置
**源文件：** `src/utils/toolResultStorage.ts`

大型工具输出不放入 context，写文件并返回引用（Content Replacement State）。

**✅ 对你的价值：** 多 Agent 场景中每个 Agent 的 context 都是稀缺资源。"结果外置，引用内置"可显著降低每个 Agent instance 的 token 消耗。

---

## 九、模型路由与多提供商支持

**源文件：** `src/utils/model/providers.ts`、`configs.ts`

支持：`Anthropic API` / `AWS Bedrock` / `GCP Vertex` / `Azure`

每个 Agent 可独立指定：
```typescript
{
  model: ModelSetting,   // 动态切换
  provider: Provider,    // 独立选提供商
}
```

**✅ 对你的价值：** 不同角色的 Agent 可用不同模型（廉价快速模型做路由，高级模型做核心推理），且可跨提供商。

---

## 十、全局状态中的监控指标

**源文件：** `src/bootstrap/state.ts`

```typescript
type State = {
  sessionId: UUID
  totalCostUSD: number
  totalAPIDuration: number
  modelUsage: { [modelName: string]: ModelUsage }
  turnToolCount: number     // 工具调用次数
  turnHookDurationMs: number
  agentDepth: number        // Agent 嵌套深度
  mainLoopModelOverride: ModelSetting | undefined
  // ...
}
```

**✅ 对你的价值：** 你的服务端需要维护每个 Agent instance 的类似状态，这套字段定义覆盖了运行监控的核心指标。

---

## 十一、本地 Skills 库中的高价值资源

| Skill | 核心价值 |
|---|---|
| **`multi-agent-patterns`** | Supervisor/Swarm/Hierarchical 三种架构对比，含"Telephone Game"问题及 `forward_message` 解法 |
| **`hosted-agents`** | Image Registry 预热、Snapshot/Restore、Warm Pool 策略——正是"常驻服务器"需要的基础设施模式 |
| **`memory-systems`** | Temporal Knowledge Graph、跨 session 持久化、DMR benchmark（Zep 94.8% accuracy） |
| **`tool-design`** | Consolidation 原则——减少 Agent 工具选择歧义，提升协作稳定性 |
| **`context-optimization`** | KV-cache 优化、Sub-Agent 分区、Observation Masking——多 Agent 场景 token 成本控制 |
| **`context-compression`** | Anchored Iterative Summarization——长期运行 Agent 的上下文压缩策略 |
| **`bdi-mental-states`** | BDI 认知架构——给每个 Agent 建模 Belief/Desire/Intention，支持可解释的角色推理 |
| **`evaluation`** | 95%方差来自 Token 用量——多 Agent 评估框架设计 |
| **`context-degradation`** | Lost-in-Middle、Context Poisoning——长期运行 Agent 的失效模式诊断 |

---

## 十二、架构映射总结

```
你的框架              →  Claude Code 的对应实现
─────────────────────────────────────────────────────────────
常驻服务器            →  Bridge (bridgeMain.ts) + BackoffConfig
多角色 Agent 实例     →  TeamFile.members + BackendType
角色定义              →  agentType + loadAgentsDir (built-in/custom agents)
Agent 间通信          →  TeammateMailbox (文件) + SendMessageTool (协议)
消息总线              →  SessionsWebSocket (远程) / InProcessBackend (本地)
权限控制              →  leaderPermissionBridge → 中心审批
生命周期感知          →  28个 HOOK_EVENTS + HTTP Hook 后端
上下文管理            →  autoCompact + toolResultStorage + microCompact
模型路由              →  providers.ts (多提供商) + agentModel (per-agent)
任务状态              →  LocalAgentTask / RemoteAgentTask + tasks.ts
```

> **关键洞察：** Claude Code 的 Swarm 实现选择了"文件系统作为消息总线"——在多进程协作时极其健壮（天然持久化，无需额外基础设施，文件锁保证一致性）。你的常驻服务器可以用更高效的内存队列，但文件 fallback 是值得保留的容灾设计。
