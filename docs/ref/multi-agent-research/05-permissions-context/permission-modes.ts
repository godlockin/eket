/**
 * 来源: src/utils/permissions/PermissionMode.ts
 *       src/types/permissions.ts
 *       src/utils/swarm/leaderPermissionBridge.ts（设计模式）
 *
 * 权限系统：多 Agent 安全边界设计。
 *
 * 核心组件：
 * 1. PermissionMode：每个 Agent 的执行权限等级
 * 2. leaderPermissionBridge：Worker → Leader 权限上报机制（权限审批代理）
 * 3. TeamAllowedPaths：团队共享路径白名单
 *
 * 对你的价值：
 * - leaderPermissionBridge 模式 → 扩展为服务端统一审批中心
 * - 所有 Agent 的敏感操作向中心申报，Leader/服务端统一决策
 * - plan 模式是"规划-审批-执行"工作流的基础
 */

// ─── 权限模式 ────────────────────────────────────────────────────────────────

/**
 * PermissionMode：控制 Agent 可执行的操作范围
 *
 * 模式描述：
 * - default：标准模式，敏感操作需用户审批
 * - plan：计划模式，只能规划/提议，不能执行写操作（需 Leader 审批后切换）
 * - acceptEdits：自动接受文件编辑（无需逐次确认）
 * - bypassPermissions：跳过所有权限检查（危险！仅受信任环境）
 * - dontAsk：不询问（自动拒绝未明确允许的操作）
 * - auto：自动模式（内部使用，基于分类器决策）
 *
 * 多 Agent 场景中的权限策略：
 * - Leader：通常 default 或 acceptEdits
 * - Worker（默认）：plan 模式，必须先获 Leader 审批
 * - Worker（受信任）：acceptEdits 或 bypassPermissions
 */
export type PermissionMode =
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto'      // 内部使用

/** 对外暴露的权限模式（不含内部 auto 模式） */
export type ExternalPermissionMode =
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'

export const PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'bypassPermissions',
  'dontAsk',
  'auto',
] as const

export const EXTERNAL_PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'bypassPermissions',
  'dontAsk',
] as const

// ─── 权限模式元数据 ──────────────────────────────────────────────────────────

type PermissionModeConfig = {
  title: string
  shortTitle: string
  symbol: string
}

const PERMISSION_MODE_CONFIG: Record<ExternalPermissionMode, PermissionModeConfig> = {
  default: {
    title: 'Default',
    shortTitle: 'Default',
    symbol: '',
  },
  plan: {
    title: 'Plan Mode',
    shortTitle: 'Plan',
    symbol: '⏸',             // 暂停图标：规划中，等待审批
  },
  acceptEdits: {
    title: 'Accept edits',
    shortTitle: 'Accept',
    symbol: '⏵⏵',            // 快进图标：自动接受
  },
  bypassPermissions: {
    title: 'Bypass Permissions',
    shortTitle: 'Bypass',
    symbol: '⏵⏵',
  },
  dontAsk: {
    title: "Don't Ask",
    shortTitle: 'DontAsk',
    symbol: '⏵⏵',
  },
}

export function permissionModeTitle(mode: PermissionMode): string {
  const config = PERMISSION_MODE_CONFIG[mode as ExternalPermissionMode]
  return config?.title ?? 'Default'
}

export function permissionModeFromString(str: string): PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(str)
    ? (str as PermissionMode)
    : 'default'
}

export function isDefaultMode(mode: PermissionMode | undefined): boolean {
  return mode === 'default' || mode === undefined
}

// ─── leaderPermissionBridge 设计模式 ────────────────────────────────────────
// 来源: src/utils/swarm/leaderPermissionBridge.ts（设计摘要）

/**
 * leaderPermissionBridge：Worker 向 Leader 上报权限请求。
 *
 * 完整工作流：
 * 1. Worker 发起敏感工具调用（如 BashTool 执行任意命令）
 * 2. Worker 的 checkPermissions() 检测到需要审批
 * 3. Worker 通过 mailbox 向 Leader 发送 permission_request 消息
 * 4. Worker 进入等待循环（轮询自己的 mailbox）
 * 5. Leader 收到 permission_request，弹出审批 UI
 * 6. Leader 用户批准/拒绝，Leader 通过 mailbox 发送 permission_response
 * 7. Worker 收到 permission_response，继续/中止工具调用
 *
 * 对你的框架的扩展建议：
 * - Leader 角色 → 你的常驻服务器（HTTP 接收 permission_request）
 * - 审批 UI → 你的管理后台或 Slack bot
 * - Worker 等待 → 带超时的 polling + 默认拒绝策略
 *
 * 关键设计：
 * - request_id 是请求和响应的关联键
 * - Worker 等待超时后默认拒绝（安全第一）
 * - permission_suggestions：Worker 可以给出建议（如"我建议允许"）
 */

/** 集中式权限决策器接口（你的服务端实现此接口） */
export type PermissionDecider = {
  /**
   * 决定是否允许工具调用
   *
   * @param request 权限请求（来自 Worker mailbox）
   * @returns 决策结果
   */
  decide(request: PermissionDecisionRequest): Promise<PermissionDecisionResult>
}

export type PermissionDecisionRequest = {
  agentId: string
  agentName: string
  toolName: string
  toolInput: Record<string, unknown>
  description: string
  /** Worker 提供的建议（可能为空） */
  suggestions: Array<{
    behavior: 'allow' | 'deny'
    message?: string
    rule?: string
  }>
}

export type PermissionDecisionResult =
  | {
      behavior: 'allow'
      /** 允许时可选择修改输入 */
      updatedInput?: Record<string, unknown>
      /** 添加到 Worker 会话的永久规则 */
      permanentRules?: string[]
    }
  | {
      behavior: 'deny'
      reason: string
    }

// ─── 团队共享路径白名单 ──────────────────────────────────────────────────────
// 来源: src/utils/swarm/teamHelpers.ts

/**
 * TeamAllowedPath：团队级路径白名单规则。
 *
 * 所有 Teammate 可以在无需逐次审批的情况下对这些路径执行指定操作。
 * 由 Leader 或 Teammate 在首次请求时添加，存储在 TeamFile 中持久化。
 */
export type TeamAllowedPath = {
  path: string        // 绝对路径（如 "/workspace/project"）
  toolName: string    // 适用工具（如 "Edit", "Write", "Bash"）
  addedBy: string     // 添加此规则的 Agent 名
  addedAt: number     // 时间戳（Unix ms）
}

/**
 * 检查路径是否在团队共享白名单中
 */
export function isPathAllowedForTeam(
  path: string,
  toolName: string,
  allowedPaths: TeamAllowedPath[],
): boolean {
  return allowedPaths.some(
    allowed =>
      allowed.toolName === toolName &&
      path.startsWith(allowed.path),
  )
}

// ─── Worker 权限上下文 ───────────────────────────────────────────────────────

/**
 * Worker 权限上下文（注入 system prompt 的权限说明）
 *
 * Leader 在 getCoordinatorUserContext() 中生成此内容，
 * 告知 Worker 有哪些工具可用、Scratchpad 目录在哪里。
 */
export type WorkerPermissionContext = {
  /** Worker 可用工具列表（INTERNAL_WORKER_TOOLS 除外） */
  availableTools: string[]
  /** 跨 Worker 共享的 Scratchpad 目录（无需权限审批） */
  scratchpadDir?: string
  /** 已连接的 MCP 服务器名列表 */
  mcpServers?: string[]
}

export function formatWorkerPermissionContext(ctx: WorkerPermissionContext): string {
  let content = `Workers spawned via the Agent tool have access to these tools: ${ctx.availableTools.sort().join(', ')}`

  if (ctx.mcpServers && ctx.mcpServers.length > 0) {
    content += `\n\nWorkers also have access to MCP tools from connected MCP servers: ${ctx.mcpServers.join(', ')}`
  }

  if (ctx.scratchpadDir) {
    content += `\n\nScratchpad directory: ${ctx.scratchpadDir}\nWorkers can read and write here without permission prompts. Use this for durable cross-worker knowledge — structure files however fits the work.`
  }

  return content
}
