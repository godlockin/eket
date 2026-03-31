/**
 * 来源: src/entrypoints/sdk/coreTypes.ts (HOOK_EVENTS 枚举部分)
 *       src/utils/hooks/hookEvents.ts (事件广播实现)
 *
 * Hook 事件系统：Agent 生命周期感知基础设施。
 *
 * 关键设计：
 * 1. 28 个事件枚举，覆盖工具调用/会话/权限/压缩/团队协作等全生命周期
 * 2. 单处理器模式：同时只有一个 eventHandler（SDK 回调）
 * 3. 缓冲机制：处理器注册前产生的事件暂存（最多 100 个），注册时补发
 * 4. 三种后端：Shell 脚本 / HTTP 端点 / SDK 回调
 * 5. 部分事件默认始终发送（SessionStart/Setup），其余需 includeHookEvents 开启
 *
 * 对你的价值：
 * - 通过 HTTP Hook，常驻服务器可在每个工具调用前后接收通知
 * - TeammateIdle → 触发新任务分配；TaskCompleted → 触发下游 Agent
 * - 集中式监控、审计、权限决策的基础
 */

// ─── 完整事件枚举（28个） ─────────────────────────────────────────────────────
// 来源: src/entrypoints/sdk/coreTypes.ts

export const HOOK_EVENTS = [
  // ─ 工具调用 ─────────────────────────────────────────────────────────────
  'PreToolUse',        // 工具调用前：可用于权限决策、输入修改
  'PostToolUse',       // 工具调用后（成功）：结果审计、触发后续动作
  'PostToolUseFailure', // 工具调用后（失败）：错误监控、重试触发

  // ─ 用户交互 ─────────────────────────────────────────────────────────────
  'Notification',      // Agent 发出通知（等待输入等）
  'UserPromptSubmit',  // 用户提交 prompt：可用于输入过滤/预处理

  // ─ 会话生命周期 ─────────────────────────────────────────────────────────
  'SessionStart',      // 会话开始（始终发送，无需 includeHookEvents）
  'SessionEnd',        // 会话结束

  // ─ 停止事件 ─────────────────────────────────────────────────────────────
  'Stop',              // 正常停止
  'StopFailure',       // 停止失败（如工具调用未完成）

  // ─ Subagent 生命周期 ─────────────────────────────────────────────────────
  'SubagentStart',     // 子 Agent 启动
  'SubagentStop',      // 子 Agent 停止

  // ─ 上下文压缩 ─────────────────────────────────────────────────────────────
  'PreCompact',        // 压缩前：可用于保存重要上下文
  'PostCompact',       // 压缩后：可用于恢复/重建状态

  // ─ 权限 ──────────────────────────────────────────────────────────────────
  'PermissionRequest', // 权限请求：可接管审批决策
  'PermissionDenied',  // 权限拒绝：审计、告警

  // ─ 初始化 ────────────────────────────────────────────────────────────────
  'Setup',             // 初始化完成（始终发送，无需 includeHookEvents）

  // ─ 团队协作 ──────────────────────────────────────────────────────────────
  'TeammateIdle',      // Teammate 变为空闲 → 触发新任务分配（关键！）

  // ─ 任务 ──────────────────────────────────────────────────────────────────
  'TaskCreated',       // 任务创建
  'TaskCompleted',     // 任务完成 → 触发下游 Agent（关键！）

  // ─ 交互决策 ──────────────────────────────────────────────────────────────
  'Elicitation',       // Agent 需要用户输入
  'ElicitationResult', // 用户输入结果

  // ─ 配置与文件系统 ────────────────────────────────────────────────────────
  'ConfigChange',      // 配置变更

  // ─ Git Worktree ──────────────────────────────────────────────────────────
  'WorktreeCreate',    // Worktree 创建（Agent 工作区隔离）
  'WorktreeRemove',    // Worktree 删除

  // ─ 文档/文件 ─────────────────────────────────────────────────────────────
  'InstructionsLoaded', // CLAUDE.md 指令加载完成
  'CwdChanged',        // 工作目录变更
  'FileChanged',       // 文件变更监测
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]

// ─── 始终发送的事件（不需要 includeHookEvents） ──────────────────────────────
const ALWAYS_EMITTED_HOOK_EVENTS = ['SessionStart', 'Setup'] as const

// ─── Hook 执行事件类型 ──────────────────────────────────────────────────────

/** Hook 开始执行 */
export type HookStartedEvent = {
  type: 'started'
  hookId: string
  hookName: string
  hookEvent: string
}

/** Hook 执行中（流式进度） */
export type HookProgressEvent = {
  type: 'progress'
  hookId: string
  hookName: string
  hookEvent: string
  stdout: string
  stderr: string
  output: string
}

/** Hook 执行完成 */
export type HookResponseEvent = {
  type: 'response'
  hookId: string
  hookName: string
  hookEvent: string
  output: string
  stdout: string
  stderr: string
  exitCode?: number
  outcome: 'success' | 'error' | 'cancelled'
}

export type HookExecutionEvent =
  | HookStartedEvent
  | HookProgressEvent
  | HookResponseEvent

export type HookEventHandler = (event: HookExecutionEvent) => void

// ─── 事件广播实现 ────────────────────────────────────────────────────────────
// 来源: src/utils/hooks/hookEvents.ts

/** 缓冲：处理器注册前产生的事件最多暂存 100 个 */
const MAX_PENDING_EVENTS = 100
const pendingEvents: HookExecutionEvent[] = []
let eventHandler: HookEventHandler | null = null
let allHookEventsEnabled = false

/**
 * 注册全局 Hook 事件处理器。
 *
 * 关键设计：注册时自动补发缓冲中的历史事件。
 * 这确保了异步初始化场景下不丢失早期事件。
 *
 * 用法：
 *   registerHookEventHandler((event) => {
 *     if (event.type === 'response' && event.hookEvent === 'TeammateIdle') {
 *       // 触发新任务分配
 *     }
 *   })
 */
export function registerHookEventHandler(
  handler: HookEventHandler | null,
): void {
  eventHandler = handler
  if (handler && pendingEvents.length > 0) {
    // 处理器注册时，补发缓冲中的历史事件
    for (const event of pendingEvents.splice(0)) {
      handler(event)
    }
  }
}

function emit(event: HookExecutionEvent): void {
  if (eventHandler) {
    eventHandler(event)
  } else {
    // 暂存到缓冲队列（环形缓冲，超出时丢弃最早的）
    pendingEvents.push(event)
    if (pendingEvents.length > MAX_PENDING_EVENTS) {
      pendingEvents.shift()
    }
  }
}

function shouldEmit(hookEvent: string): boolean {
  if ((ALWAYS_EMITTED_HOOK_EVENTS as readonly string[]).includes(hookEvent)) {
    return true
  }
  return (
    allHookEventsEnabled &&
    (HOOK_EVENTS as readonly string[]).includes(hookEvent)
  )
}

export function emitHookStarted(hookId: string, hookName: string, hookEvent: string): void {
  if (!shouldEmit(hookEvent)) return
  emit({ type: 'started', hookId, hookName, hookEvent })
}

export function emitHookProgress(data: {
  hookId: string
  hookName: string
  hookEvent: string
  stdout: string
  stderr: string
  output: string
}): void {
  if (!shouldEmit(data.hookEvent)) return
  emit({ type: 'progress', ...data })
}

/**
 * 启动 Hook 进度定时汇报（仅在输出变化时发送，避免无效心跳）
 * 返回停止函数
 */
export function startHookProgressInterval(params: {
  hookId: string
  hookName: string
  hookEvent: string
  getOutput: () => Promise<{ stdout: string; stderr: string; output: string }>
  intervalMs?: number
}): () => void {
  if (!shouldEmit(params.hookEvent)) return () => {}

  let lastEmittedOutput = ''
  const interval = setInterval(() => {
    void params.getOutput().then(({ stdout, stderr, output }) => {
      if (output === lastEmittedOutput) return  // 无变化则跳过
      lastEmittedOutput = output
      emitHookProgress({
        hookId: params.hookId,
        hookName: params.hookName,
        hookEvent: params.hookEvent,
        stdout,
        stderr,
        output,
      })
    })
  }, params.intervalMs ?? 1000)
  interval.unref()  // 不阻止进程退出

  return () => clearInterval(interval)
}

export function emitHookResponse(data: {
  hookId: string
  hookName: string
  hookEvent: string
  output: string
  stdout: string
  stderr: string
  exitCode?: number
  outcome: 'success' | 'error' | 'cancelled'
}): void {
  if (!shouldEmit(data.hookEvent)) return
  emit({ type: 'response', ...data })
}

/**
 * 启用所有 Hook 事件类型的发送（默认只发 SessionStart/Setup）。
 * 在 SDK includeHookEvents 选项设置或 CLAUDE_CODE_REMOTE 模式时调用。
 */
export function setAllHookEventsEnabled(enabled: boolean): void {
  allHookEventsEnabled = enabled
}

/** 清理状态（测试用） */
export function clearHookEventState(): void {
  eventHandler = null
  pendingEvents.length = 0
  allHookEventsEnabled = false
}

// ─── Hook 后端类型定义 ────────────────────────────────────────────────────────
// 来源: src/utils/hooks/ 目录

/**
 * Hook 支持三种后端：
 *
 * 1. Shell 脚本（execAgentHook.ts）
 *    - 最简单，在子进程中执行 shell 命令
 *    - 事件数据通过环境变量传递
 *    - 适合简单的通知、日志场景
 *
 * 2. HTTP 端点（execHttpHook.ts）
 *    - 向指定 URL 发送 POST 请求
 *    - 请求体包含完整事件数据（JSON）
 *    - 适合常驻服务器接收回调，实现集中式监控
 *    - 你的框架应使用此后端！
 *
 * 3. Agent SDK 回调（postSamplingHooks.ts）
 *    - 程序化注册 TypeScript/JavaScript 回调
 *    - 通过 registerHookEventHandler() 注册
 *    - 适合 in-process 场景（无需网络往返）
 */

export type HookBackendType = 'shell' | 'http' | 'sdk'

/** HTTP Hook 配置（用于你的常驻服务器） */
export type HttpHookConfig = {
  type: 'http'
  url: string
  /** 超时（ms），默认 30000 */
  timeoutMs?: number
  /** 额外请求头 */
  headers?: Record<string, string>
}

/** Shell Hook 配置 */
export type ShellHookConfig = {
  type: 'shell'
  command: string
  /** 工作目录 */
  cwd?: string
  /** 超时（ms） */
  timeoutMs?: number
}

export type HookConfig = HttpHookConfig | ShellHookConfig

/** 各事件绑定的 Hook 配置 */
export type HooksConfig = {
  [K in HookEvent]?: HookConfig[]
}

// ─── HTTP Hook 请求体格式 ─────────────────────────────────────────────────────

/**
 * HTTP Hook 向你的服务端发送的请求体格式
 * POST {url}
 * Content-Type: application/json
 */
export type HttpHookPayload = {
  /** 触发的事件名 */
  event: HookEvent
  /** 会话 ID */
  sessionId: string
  /** Agent 名（如果在团队中） */
  agentName?: string
  /** 团队名 */
  teamName?: string
  /** 事件特定数据 */
  data: {
    // PreToolUse / PostToolUse 数据
    toolName?: string
    toolInput?: unknown
    toolResult?: unknown
    toolError?: string

    // TeammateIdle 数据
    idleReason?: 'available' | 'interrupted' | 'failed'
    completedTaskId?: string
    completedStatus?: 'resolved' | 'blocked' | 'failed'

    // TaskCompleted 数据
    taskId?: string
    taskStatus?: string

    // PermissionRequest 数据
    permissionTool?: string
    permissionDescription?: string
  }
}
