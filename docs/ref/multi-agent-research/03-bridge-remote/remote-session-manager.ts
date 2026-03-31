/**
 * 来源: src/remote/RemoteSessionManager.ts
 *
 * 远程会话管理器：在 SessionsWebSocket 之上封装高层会话管理逻辑。
 *
 * 职责：
 * - 管理会话的完整生命周期（创建/连接/重连/关闭）
 * - 处理 SDK 消息和控制消息的路由
 * - 维护会话状态机（idle/running/compacting 等）
 * - 处理权限控制请求（PermissionRequest/Response）
 *
 * 注意：完整实现较复杂，此处主要提取配置类型和关键设计。
 */

import { SessionsWebSocket, type RemoteSessionConfig } from './sessions-websocket.js'

// ─── 远程会话配置 ────────────────────────────────────────────────────────────

export { RemoteSessionConfig }

// ─── 远程会话状态 ────────────────────────────────────────────────────────────

export type RemoteSessionState =
  | 'connecting'    // 正在建立 WebSocket 连接
  | 'connected'     // 已连接，等待 Agent 开始工作
  | 'running'       // Agent 正在处理任务
  | 'idle'          // Agent 空闲（等待下一个任务）
  | 'compacting'    // Agent 正在压缩 context
  | 'error'         // 连接/运行错误
  | 'closed'        // 会话已关闭

// ─── 远程会话管理器 ──────────────────────────────────────────────────────────

export type RemoteSessionCallbacks = {
  /** 会话状态变更 */
  onStateChange?: (state: RemoteSessionState) => void
  /** 收到 Agent 输出消息 */
  onMessage?: (message: unknown) => void
  /** 收到权限控制请求（需要服务端响应） */
  onControlRequest?: (request: {
    requestId: string
    subtype: string
    payload: unknown
    respond: (response: unknown) => void
  }) => void
  /** 会话关闭 */
  onClose?: (reason?: string) => void
  /** 连接错误 */
  onError?: (error: Error) => void
}

/**
 * 远程会话管理器（精简设计版）
 *
 * 完整实现见 src/remote/RemoteSessionManager.ts（约 500 行）
 * 此处是关键设计的精简参考实现。
 */
export class RemoteSessionManager {
  private ws: SessionsWebSocket | null = null
  private state: RemoteSessionState = 'closed'
  private pendingControlRequests = new Map<string, {
    resolve: (response: unknown) => void
    reject: (error: Error) => void
  }>()

  constructor(
    private readonly config: RemoteSessionConfig,
    private readonly callbacks: RemoteSessionCallbacks,
  ) {}

  /** 连接到远程会话 */
  async connect(): Promise<void> {
    this.ws = new SessionsWebSocket(
      this.config.sessionId,
      this.config.orgUuid,
      this.config.getAccessToken,
      {
        onConnected: () => {
          this.setState('connected')
        },
        onMessage: (message) => {
          this.handleMessage(message)
        },
        onReconnecting: () => {
          this.setState('connecting')
        },
        onClose: () => {
          this.setState('closed')
          this.callbacks.onClose?.()
        },
        onError: (error) => {
          this.setState('error')
          this.callbacks.onError?.(error)
        },
      },
    )

    this.setState('connecting')
    await this.ws.connect()
  }

  private setState(state: RemoteSessionState): void {
    if (this.state !== state) {
      this.state = state
      this.callbacks.onStateChange?.(state)
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object' || !('type' in message)) return
    const msg = message as { type: string; [key: string]: unknown }

    switch (msg.type) {
      case 'control_request':
        // 权限控制请求：需要服务端响应
        this.handleControlRequest(msg)
        break

      case 'control_response':
        // 控制请求的响应（如权限决策结果）
        this.resolveControlRequest(msg)
        break

      default:
        // 业务消息：转发给回调
        if (!this.config.viewerOnly) {
          this.callbacks.onMessage?.(message)
        }
        break
    }
  }

  private handleControlRequest(msg: Record<string, unknown>): void {
    if (!this.callbacks.onControlRequest) return

    const requestId = msg.request_id as string
    const request = msg.request as { subtype: string; [key: string]: unknown }

    this.callbacks.onControlRequest({
      requestId,
      subtype: request.subtype,
      payload: request,
      respond: (response: unknown) => {
        this.ws?.sendControlResponse({
          type: 'control_response',
          request_id: requestId,
          ...(response as Record<string, unknown>),
        })
      },
    })
  }

  private resolveControlRequest(msg: Record<string, unknown>): void {
    const requestId = msg.request_id as string
    const pending = this.pendingControlRequests.get(requestId)
    if (pending) {
      pending.resolve(msg)
      this.pendingControlRequests.delete(requestId)
    }
  }

  /** 发送控制请求（如中断正在运行的 Agent） */
  async sendInterrupt(): Promise<void> {
    if (!this.ws?.isConnected()) return
    this.ws.sendControlRequest({ subtype: 'interrupt' })
  }

  /** 当前会话状态 */
  getState(): RemoteSessionState {
    return this.state
  }

  /** 关闭会话 */
  close(): void {
    this.ws?.close()
    this.ws = null
    this.setState('closed')
  }

  /** 强制重连（如从休眠恢复后） */
  forceReconnect(): void {
    this.ws?.reconnect()
  }
}

// ─── 远程 Agent Pool 管理器 ───────────────────────────────────────────────────

/**
 * 远程 Agent Pool：管理多个并发远程会话。
 *
 * 这是你的"常驻服务器"中管理多个 Agent 实例的核心组件设计参考。
 *
 * 关键能力：
 * 1. 会话池：维护 N 个并发 Agent 实例
 * 2. 任务分配：根据 Agent 状态分配新任务
 * 3. 健康监控：定期检查 Agent 状态，自动重连/恢复
 * 4. 容量管理：等待空闲 Agent，避免超出并发上限
 */
export type AgentPoolConfig = {
  /** 最大并发 Agent 数 */
  maxConcurrent: number
  /** Agent 空闲超时（ms）后回收 */
  idleTimeoutMs?: number
  /** 会话恢复配置 */
  restoreConfig?: {
    enabled: boolean
    snapshotDir: string
  }
}

export type AgentPoolEntry = {
  sessionId: string
  manager: RemoteSessionManager
  state: RemoteSessionState
  agentType?: string
  currentTaskId?: string
  lastActivityAt: number
  createdAt: number
}

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
    // 优先找匹配类型的空闲 Agent
    for (const entry of this.agents.values()) {
      if (
        entry.state === 'idle' &&
        (!agentType || entry.agentType === agentType)
      ) {
        return entry
      }
    }

    // 如果池未满，新建 Agent
    if (this.agents.size < this.config.maxConcurrent) {
      return this.createNewAgent(agentType)
    }

    // 池已满，等待空闲（此处简化，实际应用 Promise 等待队列）
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

  /** 关闭所有 Agent */
  closeAll(): void {
    for (const entry of this.agents.values()) {
      entry.manager.close()
    }
    this.agents.clear()
  }
}
