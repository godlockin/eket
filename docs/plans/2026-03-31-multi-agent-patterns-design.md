# EKET 框架 v1.1.0 - 多 Agent 协作模式借鉴设计

**版本**: v1.1.0
**审查者**: Linus (首席架构师)
**日期**: 2026-03-31
**来源**: Claude Code 2.1.88 multi-agent-research 分析

---

## 执行摘要

### 研究目的

分析 Claude Code 2.1.88 的多 Agent 框架实现，提取可复用的设计模式和代码参考，为 EKET 框架的以下升级提供借鉴：

1. **常驻服务器做代理** (Bridge 架构)
2. **多 Agent 实例分角色协作** (Swarm/Team 架构)
3. **Agent 间通信系统** (文件 Mailbox + 结构化协议)
4. **生命周期感知** (Hook 事件系统)
5. **权限控制** (leaderPermissionBridge → 服务端统一审批)

### 核心发现

| 设计模式 | Claude Code 实现 | EKET 借鉴价值 | 优先级 |
|----------|-----------------|--------------|--------|
| **文件 Mailbox** | `teammate-mailbox.ts` (763 行) | P2P 消息总线，天然持久化，文件锁保证一致性 | P1 |
| **Bridge 架构** | `bridge-main.ts` + `BackoffConfig` | 生产级 Agent Pool，退避重连、容量唤醒、快照恢复 | P0 |
| **Coordinator 模式** | `coordinator-mode.ts` | Orchestrator/Worker 权限分层 | P1 |
| **Hook 事件系统** | 28 个生命周期事件 + HTTP Hook 后端 | 集中式监控、审计、任务触发 | P0 |
| **WebSocket 订阅** | `sessions-websocket.ts` | 服务端-Agent 实时通信层 | P1 |
| **RemoteAgentPool** | `remote-session-manager.ts` | 多 Agent 并发管理、容量控制 | P0 |
| **leaderPermissionBridge** | 权限上报机制 | 扩展为服务端统一审批中心 | P1 |

### 架构映射

```
EKET 框架需求          →  Claude Code 的对应实现
─────────────────────────────────────────────────────────────
常驻服务器            →  Bridge (bridgeMain.ts) + BackoffConfig
多角色 Agent 实例     →  TeamFile.members + BackendType
角色定义              →  agentType + loadAgentsDir (built-in/custom agents)
Agent 间通信          →  TeammateMailbox (文件) + SendMessageTool (协议)
消息总线              →  SessionsWebSocket (远程) / InProcessBackend (本地)
权限控制              →  leaderPermissionBridge → 中心审批
生命周期感知          →  28 个 HOOK_EVENTS + HTTP Hook 后端
上下文管理            →  autoCompact + toolResultStorage + microCompact
模型路由              →  providers.ts (多提供商) + agentModel (per-agent)
任务状态              →  LocalAgentTask / RemoteAgentTask + tasks.ts
```

---

## 一、文件 Mailbox 消息总线

### 1.1 核心设计

**源文件**: `docs/ref/multi-agent-research/02-messaging/teammate-mailbox.ts` (763 行)

**架构**:
```
~/.claude/teams/{team_name}/inboxes/
├── alice.json        # Alice 的收件箱
├── alice.json.lock   # 文件锁，防止并发写入
├── bob.json          # Bob 的收件箱
└── bob.json.lock     # 文件锁
```

**关键设计**:
- **P2P 通信**: 每个 Agent 有独立 inbox 文件，无需中间人
- **文件锁**: `lockfile.lock()` 防止多进程并发写入冲突
- **重试退避**: 10 次重试，5-100ms 随机间隔
- **结构化协议**: 10+ 种内置消息类型（权限、关机、plan 审批等）

### 1.2 核心代码

```typescript
// ─── 写入接口（带文件锁） ──────────────────────────────────────────────────
export async function writeToMailbox(
  recipientName: string,
  message: Omit<TeammateMessage, 'read'>,
  teamName?: string,
): Promise<void> {
  await ensureInboxDir(teamName)
  const inboxPath = getInboxPath(recipientName, teamName)
  const lockFilePath = `${inboxPath}.lock`

  // 确保文件存在（lockfile 要求目标文件必须存在）
  try {
    await writeFile(inboxPath, '[]', { encoding: 'utf-8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }

  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(inboxPath, {
      lockfilePath: lockFilePath,
      retries: { retries: 10, minTimeout: 5, maxTimeout: 100 },
    })

    // 锁内重读确保最新状态（防止并发写入丢失）
    const messages = await readMailbox(recipientName, teamName)
    messages.push({ ...message, read: false })
    await writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
  } finally {
    if (release) await release()
  }
}
```

### 1.3 结构化消息类型

```typescript
// ─── 10+ 种内置协议消息 ────────────────────────────────────────────────────

// Idle 通知：Agent 完成任务后向 team-lead 发送的空闲通知
type IdleNotificationMessage = {
  type: 'idle_notification'
  from: string
  timestamp: string
  idleReason?: 'available' | 'interrupted' | 'failed'
  summary?: string             // 最后一次 DM 的简短摘要
  completedTaskId?: string
  completedStatus?: 'resolved' | 'blocked' | 'failed'
}

// 权限请求：Worker → Leader，申请执行敏感操作
type PermissionRequestMessage = {
  type: 'permission_request'
  request_id: string
  agent_id: string
  tool_name: string
  tool_use_id: string
  description: string
  input: Record<string, unknown>
  permission_suggestions: unknown[]
}

// 关机请求/响应：Leader ↔ Worker 的优雅关机协议
type ShutdownRequestMessage = {
  type: 'shutdown_request'
  requestId: string
  from: string
  reason?: string
  timestamp: string
}

// Plan 审批：Worker → Leader（请求）、Leader → Worker（响应）
type PlanApprovalRequestMessage = {
  type: 'plan_approval_request'
  from: string
  timestamp: string
  planFilePath: string
  planContent: string
  requestId: string
}
```

### 1.4 对 EKET 的价值

**借鉴方式**:
1. **作为 Redis 消息队列的容灾设计**: 当前 EKET 使用 Redis/文件轮询，可借鉴文件 Mailbox 作为 fallback
2. **扩展结构化消息类型**: 定义 EKET 的角色协作协议（task delegation、result reporting）
3. **文件锁机制**: 借鉴 `lockfile.lock()` 保证原子写入

**实现建议**:
```typescript
// eket/node/src/core/agent-mailbox.ts
export async function sendToAgent(
  recipientId: string,
  message: EketAgentMessage,
): Promise<void> {
  const inboxPath = join(EKET_DIR, 'inboxes', `${recipientId}.json`)
  const lockPath = `${inboxPath}.lock`

  // 文件锁保证原子写入
  const release = await lockfile.lock(inboxPath, { lockfilePath: lockPath })
  try {
    const messages = await readMailbox(recipientId)
    messages.push({ ...message, read: false, timestamp: Date.now() })
    await writeFile(inboxPath, JSON.stringify(messages, null, 2))
  } finally {
    await release()
  }
}
```

---

## 二、Bridge 架构 - 常驻服务代理

### 2.1 核心设计

**源文件**: `docs/ref/multi-agent-research/03-bridge-remote/bridge-main.ts` (246 行)

**架构**:
```
┌─────────────────────────────────────────────────────────────┐
│                     Bridge Server                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Agent Pool (maxSessions: 32)                         │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │  │
│  │  │Session 1│ │Session 2│ │Session 3│ │   ...   │     │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │Poll Loop    │  │Capacity Wake │  │Snapshot Restore  │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / Poll
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Remote Server                           │
│  - Work assignment API                                      │
│  - Session snapshot storage                                 │
│  - Capacity notification (WebSocket ping)                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 退避重连配置

```typescript
// ─── 生产级退避配置 ───────────────────────────────────────────────────────
export type BackoffConfig = {
  connInitialMs: number     // 连接初始退避
  connCapMs: number         // 连接最大退避间隔
  connGiveUpMs: number      // 连接放弃时间
  generalInitialMs: number  // 通用操作初始退避
  generalCapMs: number      // 通用操作最大退避间隔
  generalGiveUpMs: number   // 通用操作放弃时间
  shutdownGraceMs?: number  // SIGTERM→SIGKILL 优雅期，默认 30s
  stopWorkBaseDelayMs?: number  // stopWorkWithRetry 基础延迟，默认 1000ms
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  connInitialMs: 2_000,
  connCapMs: 120_000,     // 2 分钟最大重连间隔
  connGiveUpMs: 600_000,  // 10 分钟后放弃
  generalInitialMs: 500,
  generalCapMs: 30_000,
  generalGiveUpMs: 600_000,
}

// ─── 指数退避算法 ─────────────────────────────────────────────────────────
export function calculateBackoffDelay(
  attempt: number,
  initialMs: number,
  capMs: number,
): number {
  const exponential = initialMs * Math.pow(2, attempt)
  const capped = Math.min(exponential, capMs)
  const jitter = capped * (0.9 + Math.random() * 0.2)  // ±10% 随机抖动
  return Math.floor(jitter)
}
```

### 2.3 Bridge 生命周期

```typescript
// ─── Bridge 主循环（精简版） ──────────────────────────────────────────────
async function runBridgeLoop(
  config: BridgeConfig,
  api: BridgeApi,
  spawner: SessionSpawner,
  signal: AbortSignal,
  backoff: BackoffConfig,
): Promise<void> {
  // 1. 注册 Worker
  const workSecret = await api.registerWorker(config.bridgeId)
  //    失败时指数退避重试

  // 2. 设置容量唤醒（WebSocket ping）
  const capacityWake = await api.setupCapacityWake()

  // 3. POLL LOOP
  let pollAttempt = 0
  while (!signal.aborted) {
    const work = await api.pollForWork()

    if (work) {
      // 有新工作：启动 Agent 会话
      const session = spawner.spawn({
        sessionId: work.sessionId,
        prompt: work.prompt,
        restore: work.restore,
        snapshot: work.snapshot,
      }, config.cwd)

      registerActiveSession(session)
      // 不等待 session 完成，直接进入下一个 poll（非阻塞）
    } else {
      // 无工作：指数退避 sleep
      const delay = calculateBackoffDelay(
        pollAttempt++,
        backoff.generalInitialMs,
        backoff.generalCapMs,
      )
      await sleep(delay)
    }

    // 收到容量唤醒时，重置 poll 状态，立即执行下一次 poll
  }

  // 4. ON SESSION DONE
  const status = await session.waitForDone()
  await api.stopWork(session.sessionId, status)  // 带重试
  removeFromActiveSessions(session)

  // 5. SHUTDOWN
  signal.abort()
  // 等待所有活跃 session 完成（最多 shutdownGraceMs）
}
```

### 2.4 对 EKET 的价值

**借鉴方式**:
1. **作为 EKET 常驻服务器的核心架构**: 当前 EKET 使用 Master/Slaver 文件轮询，可升级为 Bridge + Agent Pool 模式
2. **退避重连配置**: 直接应用于 EKET 的 ConnectionManager
3. **容量唤醒机制**: 消除轮询延迟，服务端有工作时立即通知
4. **会话快照恢复**: Agent 崩溃后可从中间状态恢复

**实现建议**:
```typescript
// eket/node/src/core/agent-pool.ts
export class AgentPool {
  private activeSessions = new Map<string, AgentSession>()
  private config: AgentPoolConfig

  constructor(config: AgentPoolConfig) {
    this.config = {
      maxConcurrent: 32,
      enableSnapshotRestore: true,
      ...config
    }
  }

  async acquireAgent(taskType: string): Promise<AgentSession> {
    // 1. 优先找空闲 Agent
    for (const session of this.activeSessions.values()) {
      if (session.state === 'idle') return session
    }

    // 2. 池未满，新建
    if (this.activeSessions.size < this.config.maxConcurrent) {
      return this.createSession(taskType)
    }

    // 3. 池已满，等待空闲
    return this.waitForIdleAgent()
  }

  private async createSession(taskType: string): Promise<AgentSession> {
    const sessionId = generateSessionId()
    const session = new AgentSession({
      sessionId,
      taskType,
      snapshotRestore: this.config.enableSnapshotRestore,
    })

    this.activeSessions.set(sessionId, session)
    await session.connect()
    return session
  }
}
```

---

## 三、Coordinator 模式 - 权限分层

### 3.1 核心设计

**源文件**: `docs/ref/multi-agent-research/01-swarm-team/coordinator-mode.ts` (146 行)

**架构**:
```
┌─────────────────────────────────────────────────────────────┐
│                    Coordinator                              │
│  权限：管理平面工具集                                        │
│  - TeamCreate / TeamDelete    (团队生命周期管理)            │
│  - SendMessage                  (广播/单播消息)              │
│  - SyntheticOutput            (合成输出)                    │
│  不能做：具体执行（Bash/Read/Edit/...）                     │
└─────────────────────────────────────────────────────────────┘
                              │ spawn
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Workers                                │
│  权限：执行工具集                                             │
│  - Bash / Read / Edit / Write / Agent / ...                │
│  不能做：操控团队结构（无 TeamCreate/Delete）               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心代码

```typescript
// ─── Coordinator 独享的"管理平面"工具（Worker 不可使用） ─────────────────
const INTERNAL_WORKER_TOOLS = new Set([
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'SyntheticOutput',
])

export function isCoordinatorMode(): boolean {
  // 通过环境变量动态激活，支持运行时切换
  return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
}

/**
 * 生成注入 Coordinator 上下文的 system prompt 片段。
 * 告知 Coordinator：Worker 有哪些工具、MCP 服务器、Scratchpad 目录。
 */
export function getCoordinatorUserContext(
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
): { [k: string]: string } {
  if (!isCoordinatorMode()) return {}

  // Worker 可用工具 = 全部工具 - 管理平面工具
  const workerTools = Array.from(ASYNC_AGENT_ALLOWED_TOOLS)
    .filter(name => !INTERNAL_WORKER_TOOLS.has(name))
    .sort()
    .join(', ')

  let content = `Workers spawned via the Agent tool have access to these tools: ${workerTools}`

  if (mcpClients.length > 0) {
    const serverNames = mcpClients.map(c => c.name).join(', ')
    content += `\n\nWorkers also have access to MCP tools from connected MCP servers: ${serverNames}`
  }

  if (scratchpadDir) {
    content += `\n\nScratchpad directory: ${scratchpadDir}\nWorkers can read and write here without permission prompts.`
  }

  return { workerToolsContext: content }
}
```

### 3.3 对 EKET 的价值

**借鉴方式**:
1. **Orchestrator/Worker 权限分层**: 当前 EKET 的 Master/Slaver 只有文件锁选举，可借鉴 Coordinator 模式实现工具级权限控制
2. **环境变量动态激活**: 支持运行时切换模式
3. **Worker 上下文注入**: 告知 Coordinator Worker 有哪些能力

**实现建议**:
```typescript
// eket/node/src/core/role-permissions.ts
export const ORCHESTRATOR_TOOLS = new Set([
  'CreateTeam',
  'DeleteTeam',
  'AssignTask',
  'BroadcastMessage',
  'QueryStatus',
])

export const WORKER_TOOLS = new Set([
  'Bash',
  'Read',
  'Edit',
  'Write',
  'RunTests',
  'SubmitPR',
])

export function getRolePermissions(role: 'orchestrator' | 'worker'): Set<string> {
  return role === 'orchestrator' ? ORCHESTRATOR_TOOLS : WORKER_TOOLS
}
```

---

## 四、Hook 事件系统 - 全生命周期感知

### 4.1 核心设计

**源文件**:
- `docs/ref/multi-agent-research/04-hooks/hook-events-enum.ts` (28 个事件)
- `docs/ref/multi-agent-research/04-hooks/hook-event-system.ts` (三种后端实现)

**28 个生命周期事件**:
```typescript
const HOOK_EVENTS = [
  // 工具调用
  'PreToolUse',        // 工具调用前：可用于权限决策、输入修改
  'PostToolUse',       // 工具调用后（成功）：结果审计、触发后续动作
  'PostToolUseFailure',// 工具调用后（失败）：错误监控、重试触发

  // 用户交互
  'Notification',
  'UserPromptSubmit',

  // 会话生命周期
  'SessionStart',      // 始终发送
  'SessionEnd',

  // 停止
  'Stop',
  'StopFailure',

  // Subagent 生命周期
  'SubagentStart',
  'SubagentStop',

  // 上下文压缩
  'PreCompact',
  'PostCompact',

  // 权限
  'PermissionRequest',
  'PermissionDenied',

  // 初始化
  'Setup',             // 始终发送

  // 团队协作（关键！）
  'TeammateIdle',      // Agent 空闲 → 触发新任务分配
  'TaskCreated',
  'TaskCompleted',     // 任务完成 → 触发下游 Agent

  // 交互决策
  'Elicitation',
  'ElicitationResult',

  // 配置与文件系统
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged',
]
```

### 4.2 HTTP Hook 后端（对 EKET 最重要）

```typescript
// ─── HTTP Hook 执行器 ─────────────────────────────────────────────────────
export async function execHttpHook(
  config: {
    url: string
    timeoutMs?: number
    headers?: Record<string, string>
    onFailure?: 'allow' | 'deny' | 'error'
  },
  payload: {
    event: HookEvent
    sessionId: string
    agentName?: string
    teamName?: string
    data: Record<string, unknown>
  },
): Promise<HttpHookResponse> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...config.headers },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    return handleHookFailure(config.onFailure ?? 'allow', response.statusText)
  }

  const result = await response.json()
  return {
    action: result.action ?? 'allow',  // 'allow' | 'deny'
    reason: result.reason,
    updatedInput: result.updatedInput,
    feedback: result.feedback,
  }
}
```

### 4.3 Hook 事件广播实现

```typescript
// ─── 事件广播器（单处理器模式） ───────────────────────────────────────────
const MAX_PENDING_EVENTS = 100
const pendingEvents: HookExecutionEvent[] = []
let eventHandler: HookEventHandler | null = null

/**
 * 注册全局 Hook 事件处理器。
 * 关键：注册时自动补发缓冲中的历史事件。
 */
export function registerHookEventHandler(handler: HookEventHandler | null): void {
  eventHandler = handler
  if (handler && pendingEvents.length > 0) {
    for (const event of pendingEvents.splice(0)) {
      handler(event)
    }
  }
}

function emit(event: HookExecutionEvent): void {
  if (eventHandler) {
    eventHandler(event)
  } else {
    pendingEvents.push(event)
    if (pendingEvents.length > MAX_PENDING_EVENTS) {
      pendingEvents.shift()
    }
  }
}

// 在 PreToolUse 时调用
export function emitPreToolUse(toolName: string, toolInput: unknown): void {
  emit({
    type: 'started',
    hookId: generateId(),
    hookName: 'pre-tool-use',
    hookEvent: 'PreToolUse',
    data: { toolName, toolInput },
  })
}
```

### 4.4 对 EKET 的价值

**借鉴方式**:
1. **HTTP Hook 后端**: 常驻服务器在每个工具调用前后接收通知，实现集中式监控、审计、权限决策
2. **TeammateIdle 事件**: 触发新任务分配
3. **TaskCompleted 事件**: 触发下游 Agent
4. **PreToolUse Hook**: 权限审批中心

**实现建议**:
```typescript
// eket/node/src/hooks/http-hook-server.ts
import express from 'express'

const app = express()
app.use(express.json())

// PreToolUse Hook：权限审批
app.post('/hooks/pre-tool-use', async (req, res) => {
  const { event, sessionId, agentName, data } = req.body

  // 权限检查
  const isAllowed = await permissionCenter.check({
    agentId: agentName,
    toolName: data.toolName,
    toolInput: data.toolInput,
  })

  if (!isAllowed) {
    return res.json({
      action: 'deny',
      reason: 'Permission denied by central authority',
    })
  }

  res.json({ action: 'allow' })
})

// TeammateIdle Hook：任务分配
app.post('/hooks/teammate-idle', async (req, res) => {
  const { agentName, data } = req.body

  if (data.idleReason === 'available') {
    // 分配下一个匹配任务
    const nextTask = await taskScheduler.findMatchingTask(agentName)
    if (nextTask) {
      await taskScheduler.assignTask(agentName, nextTask)
    }
  }

  res.json({ action: 'allow' })
})

// TaskCompleted Hook：触发下游
app.post('/hooks/task-completed', async (req, res) => {
  const { data } = req.body

  // 通知下游 Agent
  await pipeline.notifyDownstream({
    taskId: data.taskId,
    status: data.completedStatus,
    result: data.result,
  })

  res.json({ action: 'allow' })
})

app.listen(8080, () => {
  console.log('[EKET Hook Server] Listening on port 8080')
})
```

---

## 五、WebSocket 会话订阅

### 5.1 核心设计

**源文件**: `docs/ref/multi-agent-research/03-bridge-remote/sessions-websocket.ts` (358 行)

**协议**:
```
连接：wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...
认证：Authorization: Bearer {token}（请求头）
心跳：30s ping/pong
```

**错误码分类**:
```typescript
const PERMANENT_CLOSE_CODES = new Set([4003])  // unauthorized
const MAX_SESSION_NOT_FOUND_RETRIES = 3        // 4001: compaction 期间短暂不可用
const MAX_RECONNECT_ATTEMPTS = 5               // 其他错误
```

### 5.2 关键代码

```typescript
export class SessionsWebSocket {
  private ws: WebSocket | null = null
  private state: WebSocketState = 'closed'
  private reconnectAttempts = 0
  private sessionNotFoundRetries = 0
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly sessionId: string,
    private readonly orgUuid: string,
    private readonly getAccessToken: () => string,
    private readonly callbacks: SessionsWebSocketCallbacks,
  ) {}

  async connect(): Promise<void> {
    const baseUrl = 'https://api.anthropic.com'.replace('https://', 'wss://')
    const url = `${baseUrl}/v1/sessions/ws/${this.sessionId}/subscribe?organization_uuid=${this.orgUuid}`
    const accessToken = this.getAccessToken()

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
      },
    })

    this.ws.on('open', () => {
      this.state = 'connected'
      this.reconnectAttempts = 0
      this.sessionNotFoundRetries = 0
      this.startPingInterval()
      this.callbacks.onConnected?.()
    })

    this.ws.on('close', (code: number) => {
      this.handleClose(code)
    })
  }

  private handleClose(closeCode: number): void {
    // 永久错误：立即停止重连
    if (PERMANENT_CLOSE_CODES.has(closeCode)) {
      this.callbacks.onClose?.()
      return
    }

    // 4001 session not found：有限重试
    if (closeCode === 4001) {
      this.sessionNotFoundRetries++
      if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
        this.callbacks.onClose?.()
        return
      }
      this.scheduleReconnect(RECONNECT_DELAY_MS * this.sessionNotFoundRetries)
      return
    }

    // 其他错误：有限重试
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++
      this.scheduleReconnect(RECONNECT_DELAY_MS)
    } else {
      this.callbacks.onClose?.()
    }
  }
}
```

### 5.3 对 EKET 的价值

**借鉴方式**:
1. **服务端-Agent 通信层**: 当前 EKET 使用文件轮询（5 秒延迟），可升级为 WebSocket 实时通信
2. **错误码分类策略**: 永久错误 vs 可重试错误
3. **只读观察者模式** (`viewerOnly`): UI 监控面板、调试观察

---

## 六、RemoteAgentPool - 多 Agent 并发管理

### 6.1 核心设计

**源文件**: `docs/ref/multi-agent-research/03-bridge-remote/remote-session-manager.ts` (315 行)

**架构**:
```
┌─────────────────────────────────────────────────────────────┐
│                    RemoteAgentPool                          │
│  maxConcurrent: 32                                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Agent Sessions                                        │  │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │  │
│  │ │Session A│ │Session B│ │Session C│ │   ...   │      │  │
│  │ │ idle    │ │ running │ │ idle    │ │         │      │  │
│  │ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  能力：                                                      │
│  1. acquireAgent(): 获取空闲 Agent，等待或新建               │
│  2. releaseAgent(): 释放 Agent 回池                          │
│  3. getPoolStats(): 获取池状态                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 核心代码

```typescript
export class RemoteAgentPool {
  private agents = new Map<string, AgentPoolEntry>()

  constructor(
    private readonly config: AgentPoolConfig,
    private readonly createSession: (sessionId: string) => RemoteSessionConfig,
  ) {}

  /**
   * 获取一个空闲 Agent，如有必要则等待。
   * 如果池未满则新建，否则等待空闲。
   */
  async acquireAgent(agentType?: string): Promise<AgentPoolEntry | null> {
    // 1. 优先找匹配类型的空闲 Agent
    for (const entry of this.agents.values()) {
      if (
        entry.state === 'idle' &&
        (!agentType || entry.agentType === agentType)
      ) {
        return entry
      }
    }

    // 2. 如果池未满，新建 Agent
    if (this.agents.size < this.config.maxConcurrent) {
      return this.createNewAgent(agentType)
    }

    // 3. 池已满，等待空闲（简化版，实际应用 Promise 等待队列）
    return null
  }

  private async createNewAgent(agentType?: string): Promise<AgentPoolEntry> {
    const sessionId = Math.random().toString(36).slice(2)
    const sessionConfig = this.createSession(sessionId)

    const manager = new RemoteSessionManager(sessionConfig, {
      onStateChange: (state) => {
        const entry = this.agents.get(sessionId)
        if (entry) {
          entry.state = state
          entry.lastActivityAt = Date.now()
        }
      },
    })

    const entry: AgentPoolEntry = {
      sessionId,
      manager,
      state: 'connecting',
      agentType,
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
    }

    this.agents.set(sessionId, entry)
    await manager.connect()
    return entry
  }

  /** 释放 Agent 回池 */
  releaseAgent(sessionId: string): void {
    const entry = this.agents.get(sessionId)
    if (entry) {
      entry.currentTaskId = undefined
      entry.state = 'idle'
      entry.lastActivityAt = Date.now()
    }
  }

  /** 获取当前池状态 */
  getPoolStats(): {
    total: number
    idle: number
    running: number
    connecting: number
  } {
    let idle = 0, running = 0, connecting = 0
    for (const entry of this.agents.values()) {
      if (entry.state === 'idle') idle++
      else if (entry.state === 'running') running++
      else if (entry.state === 'connecting') connecting++
    }
    return { total: this.agents.size, idle, running, connecting }
  }
}
```

### 6.3 对 EKET 的价值

**借鉴方式**:
1. **作为 EKET 常驻服务器的 Agent 管理器**: 当前 EKET 使用文件轮询 + Master 分配，可升级为 Agent Pool 模式
2. **容量控制**: 等待空闲 Agent，避免超出并发上限
3. **健康监控**: 定期检查 Agent 状态，自动重连/恢复

---

## 七、实现路线图

### v1.1.0 (下周) - 基础消息总线

**目标**: 实现文件 Mailbox 作为 Redis 消息队列的容灾设计

**任务**:
1. [ ] 创建 `node/src/core/agent-mailbox.ts`
   - 实现 `writeToAgent()` / `readMailbox()` / `markAsRead()`
   - 集成 `lockfile` 文件锁
   - 定义 EKET 的 5+ 种结构化消息类型

2. [ ] 修改 `node/src/core/message-queue.ts`
   - 添加 `fallbackToMailbox()` 方法
   - Redis 不可用时自动降级到文件 Mailbox

3. [ ] 创建测试
   - `node/tests/agent-mailbox.test.ts`
   - 并发写入测试（验证文件锁有效性）

**预计工时**: 8h

---

### v1.2.0 (下月) - HTTP Hook 后端

**目标**: 实现 Hook 事件系统，支持服务端监控和任务触发

**任务**:
1. [ ] 创建 `node/src/hooks/http-hook-server.ts`
   - Express 服务器，监听 8080 端口
   - 实现 `/hooks/pre-tool-use`、`/hooks/teammate-idle`、`/hooks/task-completed` 端点

2. [ ] 集成到 `node/src/core/agent-executor.ts`
   - 在工具调用前后发送 HTTP Hook
   - 支持 Hook 响应（允许/拒绝/修改输入）

3. [ ] 任务调度器集成
   - `TeammateIdle` → 分配下一个匹配任务
   - `TaskCompleted` → 触发下游 Agent

**预计工时**: 12h

---

### v1.3.0 (下季度) - Agent Pool 管理器

**目标**: 实现常驻服务器 + Agent Pool 模式

**任务**:
1. [ ] 创建 `node/src/core/agent-pool.ts`
   - 实现 `acquireAgent()` / `releaseAgent()` / `getPoolStats()`
   - 集成 Bridge 退避重连配置

2. [ ] 实现容量唤醒
   - WebSocket ping 通知
   - 轮询退避优化

3. [ ] 会话快照恢复
   - 保存 Agent 状态到 SQLite
   - 崩溃后从快照恢复

**预计工时**: 24h

---

### v2.0.0 (下下季度) - WebSocket 实时通信

**目标**: 升级文件轮询为 WebSocket 实时通信

**任务**:
1. [ ] 创建 `node/src/core/sessions-websocket.ts`
   - 实现 WebSocket 连接、心跳、重连
   - 错误码分类处理

2. [ ] 修改 `node/src/core/message-queue.ts`
   - 添加 `sendViaWebSocket()` 方法
   - 支持降级到文件轮询

3. [ ] 只读观察者模式
   - UI 监控面板集成
   - 调试观察

**预计工时**: 16h

---

## 八、架构风险与缓解

### 风险 1: 文件 Mailbox 性能瓶颈

**问题**: 文件锁在高并发下可能成为瓶颈

**缓解**:
- 仅作为 Redis 消息队列的容灾设计（fallback）
- 正常情况使用 Redis，Redis 不可用时降级到文件

---

### 风险 2: HTTP Hook 延迟

**问题**: 每个工具调用都发送 HTTP 请求，可能增加延迟

**缓解**:
- Hook 服务器部署在本地（localhost:8080）
- 设置超时（5s），超时后按 `onFailure: 'allow'` 处理（容错）
- 异步发送 Hook（不阻塞主流程）

---

### 风险 3: Agent Pool 复杂度

**问题**: Agent Pool 管理增加系统复杂度

**缓解**:
- 先实现基础版本（支持 acquire/release）
- 逐步添加高级功能（容量唤醒、快照恢复）
- 添加完整的单元测试和集成测试

---

## 九、测试覆盖

### 单元测试

| 模块 | 测试文件 | 状态 |
|------|---------|------|
| Agent Mailbox | `node/tests/agent-mailbox.test.ts` | 待创建 |
| HTTP Hook Server | `node/tests/http-hook-server.test.ts` | 待创建 |
| Agent Pool | `node/tests/agent-pool.test.ts` | 待创建 |
| Sessions WebSocket | `node/tests/sessions-websocket.test.ts` | 待创建 |

### 集成测试

| 场景 | 测试文件 | 状态 |
|------|---------|------|
| Mailbox 并发写入 | `node/tests/integration/mailbox-concurrent.test.ts` | 待创建 |
| Hook 事件触发任务分配 | `node/tests/integration/hook-task-assign.test.ts` | 待创建 |
| Agent Pool 容量控制 | `node/tests/integration/agent-pool-capacity.test.ts` | 待创建 |

---

## 十、结论

### 核心借鉴价值

Claude Code 的 Swarm 实现选择了"文件系统作为消息总线"，在多进程协作时极其健壮：
- **天然持久化**: 无需额外基础设施
- **文件锁保证一致性**: 多进程安全
- **结构化协议**: 10+ 种内置消息类型

**关键洞察**: 你的"常驻服务器"模式可以直接借鉴 Bridge + Agent Pool 架构，实现生产级 Agent 管理。

### 下一步行动

1. **v1.1.0 (本周)**: 实现文件 Mailbox 基础功能
2. **v1.2.0 (下周)**: 实现 HTTP Hook 后端
3. **v1.3.0 (下月)**: 实现 Agent Pool 管理器
4. **v2.0.0 (下季度)**: 实现 WebSocket 实时通信

### v1.0.0 就绪状态

EKET 框架 v1.0.0 已完成基础架构修复，下一阶段可直接融入上述 multi-agent 模式，逐步实现常驻服务器和多 Agent 协作能力。

---

**报告生成时间**: 2026-03-31
**审查完成者**: Linus (首席架构师)
**审查状态**: ✅ 完成
**v1.1.0 设计就绪**: ✅ 就绪
