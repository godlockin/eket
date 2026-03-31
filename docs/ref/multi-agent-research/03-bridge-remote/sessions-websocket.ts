/**
 * 来源: src/remote/SessionsWebSocket.ts
 *       src/remote/RemoteSessionManager.ts（配置类型）
 *
 * WebSocket 会话订阅：Agent 与服务端的实时通信通道。
 *
 * 协议：
 * 1. 连接：wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...
 * 2. 认证：通过 Authorization: Bearer {token} 请求头（Bun）或 headers 选项（ws）
 * 3. 消息：接收 SDKMessage 流
 * 4. 心跳：30s 间隔 ping/pong 保活
 *
 * 错误码分类：
 * - 4003 unauthorized → 永久错误，立即停止重连
 * - 4001 session not found → 可重试（最多 3 次），compaction 期间短暂不可用
 * - 其他 → 有限重试（最多 5 次，2s 间隔）
 *
 * 对你的价值：
 * - 服务端-Agent 通信层的参考设计
 * - 错误码分类策略（永久 vs 可重试）
 * - 只读观察者模式（viewerOnly）
 */

// ─── 常量 ────────────────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 5
const PING_INTERVAL_MS = 30000   // 30秒心跳

/**
 * 4001 (session not found) 的最大重试次数。
 * compaction 期间服务端可能短暂认为 session 已过期，允许有限重试恢复。
 */
const MAX_SESSION_NOT_FOUND_RETRIES = 3

/**
 * 永久错误码：收到后立即停止重连（服务端明确拒绝）。
 * 4003 = unauthorized（认证失败，重连也没用）
 */
const PERMANENT_CLOSE_CODES = new Set([
  4003, // unauthorized
])

// ─── 消息类型 ────────────────────────────────────────────────────────────────

/** SDK 消息（正常业务流）*/
type SDKMessage = {
  type: string
  [key: string]: unknown
}

/** 控制请求（需要客户端响应，如权限审批） */
type SDKControlRequest = {
  type: 'control_request'
  request_id: string
  request: { subtype: string; [key: string]: unknown }
}

/** 控制响应（客户端发回的审批结果） */
type SDKControlResponse = {
  type: 'control_response'
  request_id: string
  [key: string]: unknown
}

/** 取消控制请求 */
type SDKControlCancelRequest = {
  type: 'control_cancel_request'
  request_id: string
}

type SessionsMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest

// ─── 连接状态 ─────────────────────────────────────────────────────────────────

type WebSocketState = 'connecting' | 'connected' | 'closed'

// ─── 回调接口 ─────────────────────────────────────────────────────────────────

export type SessionsWebSocketCallbacks = {
  onMessage: (message: SessionsMessage) => void
  onClose?: () => void
  onError?: (error: Error) => void
  onConnected?: () => void
  /** 暂时断线并计划重连时触发（非最终关闭）*/
  onReconnecting?: () => void
}

// ─── SessionsWebSocket 类 ─────────────────────────────────────────────────────

/**
 * WebSocket 会话订阅客户端
 *
 * 功能：
 * - 自动处理 Bun 原生 WebSocket 和 Node.js ws 包的差异
 * - 认证通过 Authorization 请求头（无需消息级 auth handshake）
 * - 30秒心跳 ping/pong 防止连接超时
 * - 自动重连：永久错误除外
 * - 力度精细的错误码处理
 */
export class SessionsWebSocket {
  private ws: { close(): void; send(data: string): void; ping?(): void } | null = null
  private state: WebSocketState = 'closed'
  private reconnectAttempts = 0
  private sessionNotFoundRetries = 0
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly sessionId: string,
    private readonly orgUuid: string,
    private readonly getAccessToken: () => string,  // 每次连接获取新 token
    private readonly callbacks: SessionsWebSocketCallbacks,
  ) {}

  /**
   * 连接到 sessions WebSocket 端点
   *
   * 协议：wss://{BASE_API_URL}/v1/sessions/ws/{sessionId}/subscribe?organization_uuid={orgUuid}
   * 认证：Authorization: Bearer {accessToken}
   *
   * Bun 环境：使用原生 globalThis.WebSocket（支持 headers 选项）
   * Node 环境：使用 ws 包（支持 headers + agent）
   */
  async connect(): Promise<void> {
    if (this.state === 'connecting') return
    this.state = 'connecting'

    const baseUrl = 'https://api.anthropic.com'.replace('https://', 'wss://')
    const url = `${baseUrl}/v1/sessions/ws/${this.sessionId}/subscribe?organization_uuid=${this.orgUuid}`

    const accessToken = this.getAccessToken()
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
    }

    // Bun 原生 WebSocket
    if (typeof Bun !== 'undefined') {
      const ws = new globalThis.WebSocket(url, { headers } as unknown as string[])
      this.ws = ws

      ws.addEventListener('open', () => {
        this.state = 'connected'
        this.reconnectAttempts = 0
        this.sessionNotFoundRetries = 0
        this.startPingInterval()
        this.callbacks.onConnected?.()
      })

      ws.addEventListener('message', (event: MessageEvent) => {
        const data = typeof event.data === 'string' ? event.data : String(event.data)
        this.handleMessage(data)
      })

      ws.addEventListener('error', () => {
        this.callbacks.onError?.(new Error('WebSocket error'))
      })

      ws.addEventListener('close', (event: CloseEvent) => {
        this.handleClose(event.code)
      })
    } else {
      // Node.js ws 包
      const { default: WS } = await import('ws')
      const ws = new WS(url, { headers })
      this.ws = ws

      ws.on('open', () => {
        this.state = 'connected'
        this.reconnectAttempts = 0
        this.sessionNotFoundRetries = 0
        this.startPingInterval()
        this.callbacks.onConnected?.()
      })

      ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString())
      })

      ws.on('error', (err: Error) => {
        this.callbacks.onError?.(err)
      })

      ws.on('close', (code: number) => {
        this.handleClose(code)
      })
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: unknown = JSON.parse(data)
      if (typeof message === 'object' && message !== null && 'type' in message) {
        this.callbacks.onMessage(message as SessionsMessage)
      }
    } catch {
      // 解析失败则忽略
    }
  }

  private handleClose(closeCode: number): void {
    this.stopPingInterval()
    if (this.state === 'closed') return

    this.ws = null
    const previousState = this.state
    this.state = 'closed'

    // 永久错误：直接关闭，不重连
    if (PERMANENT_CLOSE_CODES.has(closeCode)) {
      this.callbacks.onClose?.()
      return
    }

    // 4001 session not found：有限重试（compaction 期间短暂不可用）
    if (closeCode === 4001) {
      this.sessionNotFoundRetries++
      if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
        this.callbacks.onClose?.()
        return
      }
      this.scheduleReconnect(
        RECONNECT_DELAY_MS * this.sessionNotFoundRetries,
        `4001 attempt ${this.sessionNotFoundRetries}/${MAX_SESSION_NOT_FOUND_RETRIES}`,
      )
      return
    }

    // 其他错误：有限重试
    if (previousState === 'connected' && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++
      this.scheduleReconnect(RECONNECT_DELAY_MS, `attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`)
    } else {
      this.callbacks.onClose?.()
    }
  }

  private scheduleReconnect(delay: number, label: string): void {
    this.callbacks.onReconnecting?.()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private startPingInterval(): void {
    this.stopPingInterval()
    this.pingInterval = setInterval(() => {
      if (this.ws && this.state === 'connected') {
        try { this.ws.ping?.() } catch { /* ignore */ }
      }
    }, PING_INTERVAL_MS)
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /** 发送控制响应（如权限审批结果） */
  sendControlResponse(response: SDKControlResponse): void {
    if (!this.ws || this.state !== 'connected') return
    this.ws.send(JSON.stringify(response))
  }

  /** 发送控制请求（如中断请求） */
  sendControlRequest(request: { subtype: string; [key: string]: unknown }): void {
    if (!this.ws || this.state !== 'connected') return
    const controlRequest: SDKControlRequest = {
      type: 'control_request',
      request_id: Math.random().toString(36).slice(2),
      request,
    }
    this.ws.send(JSON.stringify(controlRequest))
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  close(): void {
    this.state = 'closed'
    this.stopPingInterval()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 强制重连（如容器关机/唤醒后订阅失效）
   */
  reconnect(): void {
    this.reconnectAttempts = 0
    this.sessionNotFoundRetries = 0
    this.close()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, 500)
  }
}

// ─── 远程会话配置（来源 src/remote/RemoteSessionManager.ts） ─────────────────

/**
 * 远程会话连接配置
 *
 * viewerOnly 模式：只读观察者，不发送中断/控制请求
 * 用途：UI 监控面板、调试观察
 */
export type RemoteSessionConfig = {
  sessionId: string
  getAccessToken: () => string
  orgUuid: string
  /** 是否已有初始 prompt（影响 UI 展示逻辑） */
  hasInitialPrompt?: boolean
  /** 只读观察者模式：不影响 Agent 执行 */
  viewerOnly?: boolean
}

// ─── WebSocket 错误码参考 ────────────────────────────────────────────────────

/**
 * 服务端使用的 WebSocket 关闭码：
 *
 * 4001 - Session not found（可重试，最多 3 次）
 *   - 触发场景：compaction 期间服务端短暂认为 session 过期
 *   - 处理：1s / 2s / 3s 递增延迟重试
 *
 * 4003 - Unauthorized（永久错误）
 *   - 触发场景：token 失效、权限不足
 *   - 处理：立即停止，通知调用者刷新 token
 *
 * 1000 - Normal closure（正常关闭）
 *   - 触发场景：服务端主动关闭 session
 *   - 处理：通知调用者 session 结束
 *
 * 其他代码：网络问题等
 *   - 处理：指数退避重试，最多 5 次
 */
export const WS_CLOSE_CODE_REFERENCE = {
  SESSION_NOT_FOUND: 4001,    // 可重试
  UNAUTHORIZED: 4003,          // 永久错误
  NORMAL_CLOSURE: 1000,
} as const
