/**
 * 来源: src/utils/swarm/backends/types.ts
 *       src/utils/swarm/backends/InProcessBackend.ts
 *
 * Backend 抽象层：统一三种 Agent 执行模式的接口。
 *
 * BackendType 三种模式：
 * - tmux：独立进程 + tmux pane，通过文件 mailbox 通信
 * - iterm2：独立进程 + iTerm2 pane，通过文件 mailbox 通信
 * - in-process：同进程 AsyncLocalStorage 隔离，共享 API client/MCP 连接
 *
 * 对你的价值：
 * - 你的"常驻服务器"模式对应 in-process backend
 * - 同进程内多 Agent 共享基础设施，文件 mailbox 作为统一消息总线
 * - InProcessBackend 是你的核心执行引擎参考实现
 */

// ─── Backend 类型定义 ────────────────────────────────────────────────────────

/**
 * Agent 执行后端类型
 *
 * | Backend    | 隔离方式                 | 共享资源          | 通信方式    |
 * |------------|--------------------------|-------------------|-------------|
 * | tmux       | 独立进程 + tmux pane     | 无                | 文件 mailbox |
 * | iterm2     | 独立进程 + iTerm2 pane   | 无                | 文件 mailbox |
 * | in-process | AsyncLocalStorage 隔离   | API client/MCP    | 文件 mailbox |
 */
export type BackendType = 'tmux' | 'iterm2' | 'in-process'

/** 仅面板类后端（tmux/iTerm2）的类型 */
export type PaneBackendType = 'tmux' | 'iterm2'

/** 面板 ID（tmux: "%1"，iTerm2: session UUID） */
export type PaneId = string

// ─── Teammate 配置类型 ───────────────────────────────────────────────────────

/** Teammate 身份（用于 AsyncLocalStorage 上下文隔离） */
export type TeammateIdentity = {
  name: string
  teamName: string
  color?: string
  planModeRequired?: boolean
}

/**
 * 生成 Teammate 的完整配置
 * 包含 Identity + 执行参数
 */
export type TeammateSpawnConfig = TeammateIdentity & {
  prompt: string                              // 初始 prompt
  cwd: string                                 // 工作目录
  model?: string                              // 可独立指定模型
  systemPrompt?: string                       // 角色专属 system prompt
  systemPromptMode?: 'default' | 'replace' | 'append'
  worktreePath?: string                       // Git worktree 路径（隔离写操作）
  parentSessionId: string                     // 父会话 ID（用于上下文链接）
  permissions?: string[]                      // 授予的工具权限列表
  /** false（默认）：未列出的工具自动拒绝（更安全）*/
  allowPermissionPrompts?: boolean
}

/** Spawn 结果 */
export type TeammateSpawnResult = {
  success: boolean
  agentId: string    // 格式："agentName@teamName"
  error?: string

  /**
   * AbortController（仅 in-process）
   * Leader 通过此控制器取消/停止 Teammate
   * 面板类后端使用 kill() 方法代替
   */
  abortController?: AbortController

  /**
   * Task ID（仅 in-process）
   * 用于 UI 渲染和进度追踪
   * agentId 是逻辑标识，taskId 用于 AppState 索引
   */
  taskId?: string

  /** 面板 ID（仅面板类后端） */
  paneId?: PaneId
}

/** 发给 Teammate 的消息 */
export type TeammateMessage = {
  text: string
  from: string
  color?: string
  timestamp?: string
  summary?: string
}

// ─── TeammateExecutor 接口（高层抽象） ───────────────────────────────────────

/**
 * Teammate 执行器接口：统一各 Backend 的生命周期管理 API。
 *
 * 对比 PaneBackend：
 * - PaneBackend 管理低层面板操作（创建/发命令/改颜色）
 * - TeammateExecutor 管理高层 Teammate 生命周期（spawn/send/terminate/kill）
 * - in-process 实现 TeammateExecutor 但没有对应的 PaneBackend
 */
export type TeammateExecutor = {
  readonly type: BackendType

  isAvailable(): Promise<boolean>
  spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult>
  sendMessage(agentId: string, message: TeammateMessage): Promise<void>
  terminate(agentId: string, reason?: string): Promise<boolean>  // 优雅关机
  kill(agentId: string): Promise<boolean>                         // 强制终止
  isActive(agentId: string): Promise<boolean>
}

// ─── InProcessBackend 实现 ───────────────────────────────────────────────────
// 来源: src/utils/swarm/backends/InProcessBackend.ts

/**
 * InProcessBackend：在同一 Node.js 进程中运行多个 Teammate。
 *
 * 核心机制：
 * 1. AsyncLocalStorage 上下文隔离：每个 Teammate 有独立的上下文存储
 *    - 不同 Teammate 的 getTeamName() / getAgentName() 返回各自的值
 *    - 共享同一进程的 API client、MCP 连接
 *
 * 2. AbortController 生命周期管理：
 *    - Leader 持有每个 Teammate 的 AbortController
 *    - abort() 触发 Teammate 的 runAgent 循环退出
 *    - 独立控制器（不与父 Agent 共享），防止 Leader abort 误杀 Teammate
 *
 * 3. AppState.tasks 注册：
 *    - 每个 in-process Teammate 在 AppState.tasks 中有对应条目
 *    - Leader 可通过 findTeammateTaskByAgentId() 查找并发送消息
 *
 * 4. 文件 mailbox 作为统一通信总线：
 *    - 即使是 in-process，也用文件 mailbox 通信
 *    - 保持与 tmux/iTerm2 模式完全相同的消息协议
 *    - 好处：透明、持久化、多进程安全，即使切换到外部进程也无需改代码
 *
 * 关键代码路径：
 *   setContext(ctx) → spawn() → spawnInProcessTeammate() →
 *     createTeammateContext() → new AbortController() →
 *     register in AppState.tasks →
 *     startInProcessTeammate() [在 AsyncLocalStorage 中运行 runAgent()]
 */
export class InProcessBackend implements TeammateExecutor {
  readonly type = 'in-process' as const

  /** ToolUseContext（访问 AppState 所需），spawn 前必须通过 setContext() 设置 */
  private context: unknown | null = null

  /** 活跃 Teammate 的 AbortController 注册表 */
  private activeTeammates = new Map<string, AbortController>()

  /**
   * 设置 ToolUseContext。
   * 在 TeammateTool 调用 spawn() 前必须调用此方法。
   */
  setContext(context: unknown): void {
    this.context = context
  }

  /** in-process backend 始终可用（无外部依赖） */
  async isAvailable(): Promise<boolean> {
    return true
  }

  /**
   * Spawn 一个 in-process Teammate。
   *
   * 步骤：
   * 1. 通过 spawnInProcessTeammate() 创建 TeammateContext
   * 2. 创建独立 AbortController（不与父 Agent 共享）
   * 3. 在 AppState.tasks 注册
   * 4. 通过 startInProcessTeammate() 在 AsyncLocalStorage 中启动 runAgent()
   * 5. 返回 agentId + taskId + abortController
   */
  async spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult> {
    if (!this.context) {
      return {
        success: false,
        agentId: `${config.name}@${config.teamName}`,
        error: 'InProcessBackend not initialized. Call setContext() before spawn().',
      }
    }

    // 实际调用 spawnInProcessTeammate()（来源 src/utils/swarm/spawnInProcess.ts）
    const agentId = `${config.name}@${config.teamName}`
    const abortController = new AbortController()
    this.activeTeammates.set(agentId, abortController)

    // 在 AsyncLocalStorage 中启动 Teammate（异步，不等待完成）
    // startInProcessTeammate(config, this.context, abortController)

    return {
      success: true,
      agentId,
      abortController,
      taskId: agentId,  // 简化示例，实际 taskId 由框架生成
    }
  }

  /**
   * 向 Teammate 发送消息（通过文件 mailbox）
   * 即使是 in-process，也用文件 mailbox 保持协议一致性
   */
  async sendMessage(agentId: string, message: TeammateMessage): Promise<void> {
    // writeToMailbox(agentId, message, teamName)
    // 实际通过 queuePendingMessage() 在下一轮工具循环送达
  }

  /**
   * 优雅关机：发送 shutdown_request 到 Teammate 的 mailbox
   * Teammate 在下次轮询时收到请求，决定是否批准
   */
  async terminate(agentId: string, reason?: string): Promise<boolean> {
    // sendShutdownRequestToMailbox(agentId, teamName, reason)
    return true
  }

  /**
   * 强制终止：直接 abort AbortController
   * 立即停止 Teammate 的 runAgent 循环
   */
  async kill(agentId: string): Promise<boolean> {
    const controller = this.activeTeammates.get(agentId)
    if (controller) {
      controller.abort()
      this.activeTeammates.delete(agentId)
      return true
    }
    return false
  }

  async isActive(agentId: string): Promise<boolean> {
    const controller = this.activeTeammates.get(agentId)
    return controller !== undefined && !controller.signal.aborted
  }
}

// ─── PaneBackend 接口（面板类后端，tmux/iTerm2） ───────────────────────────────
// 来源: src/utils/swarm/backends/types.ts

/**
 * PaneBackend：管理 tmux/iTerm2 面板的低层接口。
 *
 * 仅面板类 Backend 需要实现此接口。
 * in-process Backend 不涉及面板管理。
 *
 * 方法摘要：
 * - createTeammatePaneInSwarmView：创建 Swarm 视图面板
 * - sendCommandToPane：向面板发送 shell 命令
 * - setPaneBorderColor：设置面板边框颜色
 * - setPaneTitle：设置面板标题
 * - killPane：关闭面板（等同于关闭进程）
 * - hidePane / showPane：隐藏/恢复面板（不终止进程）
 */
export type PaneBackend = {
  readonly type: BackendType
  readonly displayName: string
  readonly supportsHideShow: boolean

  isAvailable(): Promise<boolean>
  isRunningInside(): Promise<boolean>

  createTeammatePaneInSwarmView(name: string, color: string): Promise<{
    paneId: PaneId
    isFirstTeammate: boolean
  }>

  sendCommandToPane(paneId: PaneId, command: string, useExternalSession?: boolean): Promise<void>
  setPaneBorderColor(paneId: PaneId, color: string, useExternalSession?: boolean): Promise<void>
  setPaneTitle(paneId: PaneId, name: string, color: string, useExternalSession?: boolean): Promise<void>
  enablePaneBorderStatus(windowTarget?: string, useExternalSession?: boolean): Promise<void>
  rebalancePanes(windowTarget: string, hasLeader: boolean): Promise<void>

  killPane(paneId: PaneId, useExternalSession?: boolean): Promise<boolean>
  hidePane(paneId: PaneId, useExternalSession?: boolean): Promise<boolean>
  showPane(paneId: PaneId, targetWindowOrPane: string, useExternalSession?: boolean): Promise<boolean>
}

// ─── 类型守卫 ─────────────────────────────────────────────────────────────────

/** 判断是否为面板类 Backend */
export function isPaneBackend(type: BackendType): type is 'tmux' | 'iterm2' {
  return type === 'tmux' || type === 'iterm2'
}

// ─── Backend 检测结果 ─────────────────────────────────────────────────────────

export type BackendDetectionResult = {
  backend: PaneBackend
  isNative: boolean
  /** iTerm2 检测到但 it2 CLI 未安装 */
  needsIt2Setup?: boolean
}
