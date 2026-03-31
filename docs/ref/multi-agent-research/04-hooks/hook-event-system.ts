/**
 * 来源: src/utils/hooks/hookEvents.ts（事件广播实现）
 *       src/utils/hooks/execHttpHook.ts（HTTP Hook 执行）
 *       src/utils/hooks/execAgentHook.ts（Shell Hook 执行）
 *
 * Hook 事件处理系统：三种后端的实现参考。
 *
 * 这个文件是 hook-events-enum.ts 的配套实现，
 * 重点展示三种 Hook 后端的接入方式。
 *
 * 对你的框架最重要的是：HTTP Hook 后端
 * 通过它，你的常驻服务器可以：
 * - 在每个 PreToolUse 时做权限检查
 * - 在 PostToolUse 后记录审计日志
 * - 在 TeammateIdle 时分配新任务
 * - 在 TaskCompleted 时触发下游 Agent
 * - 在 PreCompact 时保存重要上下文
 */

// ─── Hook 处理器注册表（来源 hookEvents.ts） ────────────────────────────────

import type { HookEvent, HookExecutionEvent, HookEventHandler } from './hook-events-enum.js'

/**
 * 全局 Hook 事件广播器
 *
 * 用法示例（在你的服务端 SDK 中）：
 *
 * ```typescript
 * registerHookEventHandler((event) => {
 *   if (event.type !== 'response') return
 *
 *   switch (event.hookEvent) {
 *     case 'TeammateIdle':
 *       taskScheduler.assignNextTask(event.hookId)
 *       break
 *     case 'TaskCompleted':
 *       pipeline.notifyDownstream(event.output)
 *       break
 *     case 'PreToolUse':
 *       permissionCenter.requestApproval(event.hookId)
 *       break
 *   }
 * })
 * ```
 */

const MAX_PENDING_EVENTS = 100
const pendingEvents: HookExecutionEvent[] = []
let eventHandler: HookEventHandler | null = null
let allHookEventsEnabled = false

/**
 * 注册 Hook 事件处理器（单处理器模式，覆盖旧处理器）。
 *
 * 关键：注册时自动补发缓冲中的历史事件（处理启动竞态）。
 */
export function registerHookEventHandler(handler: HookEventHandler | null): void {
  eventHandler = handler
  if (handler && pendingEvents.length > 0) {
    for (const event of pendingEvents.splice(0)) {
      handler(event)
    }
  }
}

function shouldEmit(hookEvent: string): boolean {
  const ALWAYS_EMITTED = ['SessionStart', 'Setup']
  if (ALWAYS_EMITTED.includes(hookEvent)) return true
  return allHookEventsEnabled
}

export function emit(event: HookExecutionEvent): void {
  if (eventHandler) {
    eventHandler(event)
  } else {
    pendingEvents.push(event)
    if (pendingEvents.length > MAX_PENDING_EVENTS) {
      pendingEvents.shift()
    }
  }
}

export function setAllHookEventsEnabled(enabled: boolean): void {
  allHookEventsEnabled = enabled
}

// ─── HTTP Hook 执行器（来源 execHttpHook.ts） ─────────────────────────────────

/**
 * HTTP Hook 执行器：向你的服务端发送 Hook 事件通知。
 *
 * 请求格式：
 * POST {url}
 * Content-Type: application/json
 * {
 *   "event": "PreToolUse",
 *   "sessionId": "xxx",
 *   "agentName": "researcher",
 *   "teamName": "my-team",
 *   "data": { "toolName": "Bash", "toolInput": {...} }
 * }
 *
 * 响应处理：
 * - 200 OK：Hook 成功，继续执行
 * - 200 OK + { "action": "deny" }：Hook 拒绝操作
 * - 200 OK + { "action": "allow", "updatedInput": {...} }：Hook 修改输入后允许
 * - 非 200：Hook 失败，行为取决于 onFailure 配置
 */
export type HttpHookResponse = {
  /** 'allow'：允许继续（默认）；'deny'：拒绝操作 */
  action?: 'allow' | 'deny'
  /** 拒绝时的原因（显示给 LLM） */
  reason?: string
  /** 允许时，修改后的工具输入 */
  updatedInput?: Record<string, unknown>
  /** 额外的反馈信息（注入 LLM context） */
  feedback?: string
}

export type HttpHookFailureBehavior =
  | 'allow'   // Hook 失败时允许操作继续（默认，容错）
  | 'deny'    // Hook 失败时拒绝操作（严格模式，安全优先）
  | 'error'   // Hook 失败时抛出错误，停止 Agent

export type HttpHookConfig = {
  url: string
  timeoutMs?: number
  headers?: Record<string, string>
  onFailure?: HttpHookFailureBehavior
}

export async function execHttpHook(
  config: HttpHookConfig,
  payload: {
    event: HookEvent
    sessionId: string
    agentName?: string
    teamName?: string
    data: Record<string, unknown>
  },
): Promise<HttpHookResponse> {
  const timeoutMs = config.timeoutMs ?? 30_000

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!response.ok) {
        // 非 2xx 响应按 onFailure 配置处理
        return handleHookFailure(
          config.onFailure ?? 'allow',
          `HTTP ${response.status}: ${response.statusText}`,
        )
      }

      const text = await response.text()
      if (!text.trim()) return { action: 'allow' }

      return JSON.parse(text) as HttpHookResponse
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return handleHookFailure(
        config.onFailure ?? 'allow',
        `HTTP Hook timed out after ${timeoutMs}ms`,
      )
    }
    return handleHookFailure(
      config.onFailure ?? 'allow',
      `HTTP Hook failed: ${(error as Error).message}`,
    )
  }
}

function handleHookFailure(
  onFailure: HttpHookFailureBehavior,
  reason: string,
): HttpHookResponse {
  switch (onFailure) {
    case 'deny':
      return { action: 'deny', reason: `Hook failed: ${reason}` }
    case 'error':
      throw new Error(`Hook failed: ${reason}`)
    default:
      return { action: 'allow' }
  }
}

// ─── PreToolUse Hook 集成示例 ─────────────────────────────────────────────────

/**
 * PreToolUse Hook：在工具调用前触发，可拦截/修改工具调用。
 *
 * 这是权限控制的核心切入点：
 * - 返回 { action: 'deny', reason: '...' }：拒绝工具调用
 * - 返回 { action: 'allow', updatedInput: {...} }：修改输入后允许
 * - 返回 { action: 'allow' }（默认）：原样允许
 *
 * 用你的 HTTP Hook 服务器实现：
 * POST /hooks/pre-tool-use
 * {
 *   "event": "PreToolUse",
 *   "data": {
 *     "toolName": "Bash",
 *     "toolInput": { "command": "rm -rf /..." }
 *   }
 * }
 * Response:
 * { "action": "deny", "reason": "Dangerous command detected" }
 */

export type PreToolUseHookPayload = {
  event: 'PreToolUse'
  sessionId: string
  agentName?: string
  teamName?: string
  data: {
    toolName: string
    toolInput: Record<string, unknown>
    toolUseId: string
  }
}

export type PostToolUseHookPayload = {
  event: 'PostToolUse'
  sessionId: string
  agentName?: string
  teamName?: string
  data: {
    toolName: string
    toolInput: Record<string, unknown>
    toolResult?: unknown
    toolError?: string
    durationMs: number
  }
}

export type TeammateIdleHookPayload = {
  event: 'TeammateIdle'
  sessionId: string
  agentName: string
  teamName: string
  data: {
    idleReason: 'available' | 'interrupted' | 'failed'
    completedTaskId?: string
    completedStatus?: 'resolved' | 'blocked' | 'failed'
    failureReason?: string
    lastDmSummary?: string
  }
}

// ─── Shell Hook 执行器（简化参考） ────────────────────────────────────────────

/**
 * Shell Hook：通过 shell 命令执行自定义逻辑。
 *
 * 事件数据通过环境变量传递：
 * - CLAUDE_HOOK_EVENT = "PreToolUse"
 * - CLAUDE_HOOK_TOOL_NAME = "Bash"
 * - CLAUDE_HOOK_SESSION_ID = "xxx"
 * - CLAUDE_HOOK_AGENT_NAME = "researcher"
 *
 * Shell 脚本退出码：
 * - 0：允许（默认）
 * - 1：拒绝（stdout 作为拒绝原因）
 * - 2：错误（根据 onFailure 配置处理）
 */

export type ShellHookConfig = {
  command: string
  cwd?: string
  timeoutMs?: number
  onFailure?: HttpHookFailureBehavior
}

// ─── Hook 配置（CLAUDE.md / settings.json 格式） ──────────────────────────────

/**
 * Claude Code settings.json 中的 Hook 配置格式：
 *
 * ```json
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       {
 *         "type": "http",
 *         "url": "http://localhost:8080/hooks/pre-tool-use",
 *         "timeoutMs": 5000
 *       }
 *     ],
 *     "TeammateIdle": [
 *       {
 *         "type": "http",
 *         "url": "http://localhost:8080/hooks/teammate-idle"
 *       }
 *     ],
 *     "PostToolUse": [
 *       {
 *         "type": "shell",
 *         "command": "echo 'Tool used: $CLAUDE_HOOK_TOOL_NAME' >> /tmp/audit.log"
 *       }
 *     ]
 *   }
 * }
 * ```
 */
