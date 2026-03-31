/**
 * 来源: src/utils/teammateMailbox.ts
 *
 * 文件 Mailbox 消息总线：Agent 间基于文件系统的 P2P 通信机制。
 *
 * 核心设计：
 * - 每个 Agent 有独立 inbox 文件：~/.claude/teams/{team}/inboxes/{agent}.json
 * - 写入时用文件锁（lockfile）防止多进程并发冲突
 * - 重试退避：10次重试，5-100ms 随机间隔
 * - 消息类型丰富：普通文本 + 结构化协议消息（权限、关机、plan审批等）
 *
 * 对你的价值：
 * - 无中间人的 P2P 消息总线，天然持久化，无需额外基础设施
 * - 结构化消息类型定义 → 扩展为你的角色协作协议
 * - leaderPermissionBridge 模式 → 扩展为服务端统一审批中心
 */

// ─── 锁配置 ─────────────────────────────────────────────────────────────────
// 10次重试 + 随机退避，防止 Swarm 中多个 Agent 并发写入时的竞态问题
const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
}

// ─── 核心消息类型 ────────────────────────────────────────────────────────────

export type TeammateMessage = {
  from: string
  text: string
  timestamp: string
  read: boolean
  color?: string    // 发送方颜色标识（'red', 'blue', 'green'...）
  summary?: string  // 5-10 词摘要，用于 UI 预览
}

// ─── 路径工具 ────────────────────────────────────────────────────────────────

/**
 * inbox 文件路径：~/.claude/teams/{team_name}/inboxes/{agent_name}.json
 */
export function getInboxPath(agentName: string, teamName?: string): string {
  const team = teamName || getTeamName() || 'default'
  const safeTeam = sanitizePathComponent(team)
  const safeAgentName = sanitizePathComponent(agentName)
  const inboxDir = join(getTeamsDir(), safeTeam, 'inboxes')
  return join(inboxDir, `${safeAgentName}.json`)
}

// ─── 读写接口 ────────────────────────────────────────────────────────────────

/**
 * 读取所有消息（含已读）
 */
export async function readMailbox(
  agentName: string,
  teamName?: string,
): Promise<TeammateMessage[]> {
  const inboxPath = getInboxPath(agentName, teamName)
  try {
    const content = await readFile(inboxPath, 'utf-8')
    return JSON.parse(content) as TeammateMessage[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    logError(error)
    return []
  }
}

/**
 * 只读未读消息
 */
export async function readUnreadMessages(
  agentName: string,
  teamName?: string,
): Promise<TeammateMessage[]> {
  const messages = await readMailbox(agentName, teamName)
  return messages.filter(m => !m.read)
}

/**
 * 向 inbox 写入消息（带文件锁，原子写入）
 *
 * 步骤：
 * 1. 确保 inbox 文件存在（wx flag 防止重复创建）
 * 2. 获取文件锁
 * 3. 重新读取最新消息（锁内读取避免丢失并发写入）
 * 4. 追加新消息并写回
 * 5. 释放锁
 */
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
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      logError(error)
      return
    }
  }

  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(inboxPath, {
      lockfilePath: lockFilePath,
      ...LOCK_OPTIONS,
    })

    // 锁内重读确保最新状态（防止并发写入丢失）
    const messages = await readMailbox(recipientName, teamName)
    messages.push({ ...message, read: false })
    await writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
  } catch (error) {
    logError(error)
  } finally {
    if (release) await release()
  }
}

/**
 * 按索引标记单条消息为已读（带文件锁）
 */
export async function markMessageAsReadByIndex(
  agentName: string,
  teamName: string | undefined,
  messageIndex: number,
): Promise<void> {
  const inboxPath = getInboxPath(agentName, teamName)
  const lockFilePath = `${inboxPath}.lock`
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(inboxPath, { lockfilePath: lockFilePath, ...LOCK_OPTIONS })
    const messages = await readMailbox(agentName, teamName)
    if (messageIndex < 0 || messageIndex >= messages.length) return
    const message = messages[messageIndex]
    if (!message || message.read) return
    messages[messageIndex] = { ...message, read: true }
    await writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    logError(error)
  } finally {
    if (release) await release()
  }
}

/**
 * 标记所有消息为已读（带文件锁）
 */
export async function markMessagesAsRead(
  agentName: string,
  teamName?: string,
): Promise<void> {
  const inboxPath = getInboxPath(agentName, teamName)
  const lockFilePath = `${inboxPath}.lock`
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(inboxPath, { lockfilePath: lockFilePath, ...LOCK_OPTIONS })
    const messages = await readMailbox(agentName, teamName)
    if (messages.length === 0) return
    for (const m of messages) m.read = true  // 来自 JSON.parse，安全直接 mutate
    await writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    logError(error)
  } finally {
    if (release) await release()
  }
}

/**
 * 按谓词选择性标记消息为已读（带文件锁）
 */
export async function markMessagesAsReadByPredicate(
  agentName: string,
  predicate: (msg: TeammateMessage) => boolean,
  teamName?: string,
): Promise<void> {
  const inboxPath = getInboxPath(agentName, teamName)
  const lockFilePath = `${inboxPath}.lock`
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(inboxPath, { lockfilePath: lockFilePath, ...LOCK_OPTIONS })
    const messages = await readMailbox(agentName, teamName)
    if (messages.length === 0) return
    const updatedMessages = messages.map(m =>
      !m.read && predicate(m) ? { ...m, read: true } : m,
    )
    await writeFile(inboxPath, JSON.stringify(updatedMessages, null, 2), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    logError(error)
  } finally {
    if (release) {
      try { await release() } catch { /* lock may have already been released */ }
    }
  }
}

/**
 * 清空 inbox（保留文件，内容置为空数组）
 */
export async function clearMailbox(agentName: string, teamName?: string): Promise<void> {
  const inboxPath = getInboxPath(agentName, teamName)
  try {
    // flag 'r+': 文件不存在时抛 ENOENT，不会意外创建新文件
    await writeFile(inboxPath, '[]', { encoding: 'utf-8', flag: 'r+' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    logError(error)
  }
}

// ─── XML 格式化（用于 LLM 上下文注入） ────────────────────────────────────────

/**
 * 将 teammate 消息格式化为 XML，注入 LLM context 作为 attachment
 * <teammate_message teammate_id="alice" color="blue" summary="...">
 *   {text}
 * </teammate_message>
 */
export function formatTeammateMessages(
  messages: Array<{
    from: string
    text: string
    timestamp: string
    color?: string
    summary?: string
  }>,
): string {
  return messages
    .map(m => {
      const colorAttr = m.color ? ` color="${m.color}"` : ''
      const summaryAttr = m.summary ? ` summary="${m.summary}"` : ''
      return `<teammate_message teammate_id="${m.from}"${colorAttr}${summaryAttr}>\n${m.text}\n</teammate_message>`
    })
    .join('\n\n')
}

// ─── 结构化协议消息类型（完整枚举） ──────────────────────────────────────────
//
// 这些类型定义了 Agent 间的完整协作协议。
// 对你的价值：借鉴此模式定义你自己的角色协作消息协议。

/**
 * Idle 通知：Agent 完成任务后向 team-lead 发送的空闲通知
 * 触发：Stop hook 时自动发送
 */
export type IdleNotificationMessage = {
  type: 'idle_notification'
  from: string
  timestamp: string
  idleReason?: 'available' | 'interrupted' | 'failed'
  summary?: string             // 最后一次 DM 的简短摘要
  completedTaskId?: string
  completedStatus?: 'resolved' | 'blocked' | 'failed'
  failureReason?: string
}

/**
 * 权限请求：Worker → Leader，申请执行敏感操作
 * leaderPermissionBridge 模式的核心消息
 */
export type PermissionRequestMessage = {
  type: 'permission_request'
  request_id: string
  agent_id: string
  tool_name: string
  tool_use_id: string
  description: string
  input: Record<string, unknown>
  permission_suggestions: unknown[]
}

/**
 * 权限响应：Leader → Worker，批准/拒绝敏感操作
 */
export type PermissionResponseMessage =
  | {
      type: 'permission_response'
      request_id: string
      subtype: 'success'
      response?: {
        updated_input?: Record<string, unknown>
        permission_updates?: unknown[]
      }
    }
  | {
      type: 'permission_response'
      request_id: string
      subtype: 'error'
      error: string
    }

/**
 * 沙盒权限请求：Worker → Leader，申请网络访问
 */
export type SandboxPermissionRequestMessage = {
  type: 'sandbox_permission_request'
  requestId: string
  workerId: string
  workerName: string
  workerColor?: string
  hostPattern: { host: string }
  createdAt: number
}

export type SandboxPermissionResponseMessage = {
  type: 'sandbox_permission_response'
  requestId: string
  host: string
  allow: boolean
  timestamp: string
}

/**
 * 关机请求/响应：Leader ↔ Worker 的优雅关机协议
 */
export type ShutdownRequestMessage = {
  type: 'shutdown_request'
  requestId: string
  from: string
  reason?: string
  timestamp: string
}

export type ShutdownApprovedMessage = {
  type: 'shutdown_approved'
  requestId: string
  from: string
  timestamp: string
  paneId?: string
  backendType?: string
}

export type ShutdownRejectedMessage = {
  type: 'shutdown_rejected'
  requestId: string
  from: string
  reason: string
  timestamp: string
}

/**
 * Plan 审批：Worker → Leader（请求）、Leader → Worker（响应）
 * planModeRequired 模式下，Worker 必须先获得 Leader 审批才能执行写操作
 */
export type PlanApprovalRequestMessage = {
  type: 'plan_approval_request'
  from: string
  timestamp: string
  planFilePath: string
  planContent: string
  requestId: string
}

export type PlanApprovalResponseMessage = {
  type: 'plan_approval_response'
  requestId: string
  approved: boolean
  feedback?: string
  timestamp: string
  permissionMode?: string  // 批准后切换到的权限模式
}

/**
 * 任务分配：Leader → Worker
 */
export type TaskAssignmentMessage = {
  type: 'task_assignment'
  taskId: string
  subject: string
  description: string
  assignedBy: string
  timestamp: string
}

/**
 * 团队权限更新：Leader → 所有成员，广播共享路径白名单变更
 */
export type TeamPermissionUpdateMessage = {
  type: 'team_permission_update'
  permissionUpdate: {
    type: 'addRules'
    rules: Array<{ toolName: string; ruleContent?: string }>
    behavior: 'allow' | 'deny' | 'ask'
    destination: 'session'
  }
  directoryPath: string
  toolName: string
}

/**
 * 模式切换请求：Leader → Worker，远程设置 Worker 的权限模式
 */
export type ModeSetRequestMessage = {
  type: 'mode_set_request'
  mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  from: string
}

// ─── 协议消息识别器 ──────────────────────────────────────────────────────────
//
// 设计模式：每种消息类型都有对应的 is*() 识别函数
// 识别器在 useInboxPoller 中用于路由消息到正确的处理队列
// 未被识别器处理的消息才会作为普通文本注入 LLM context

/**
 * 判断消息是否为需要特殊路由的结构化协议消息
 * 这些消息有专属处理器，不应直接注入 LLM context
 */
export function isStructuredProtocolMessage(messageText: string): boolean {
  try {
    const parsed = JSON.parse(messageText)
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return false
    const type = (parsed as { type: unknown }).type
    return (
      type === 'permission_request' ||
      type === 'permission_response' ||
      type === 'sandbox_permission_request' ||
      type === 'sandbox_permission_response' ||
      type === 'shutdown_request' ||
      type === 'shutdown_approved' ||
      type === 'team_permission_update' ||
      type === 'mode_set_request' ||
      type === 'plan_approval_request' ||
      type === 'plan_approval_response'
    )
  } catch {
    return false
  }
}

export function isIdleNotification(messageText: string): IdleNotificationMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'idle_notification') return parsed as IdleNotificationMessage
  } catch { /* not JSON */ }
  return null
}

export function isPermissionRequest(messageText: string): PermissionRequestMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'permission_request') return parsed as PermissionRequestMessage
  } catch { /* not JSON */ }
  return null
}

export function isPermissionResponse(messageText: string): PermissionResponseMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'permission_response') return parsed as PermissionResponseMessage
  } catch { /* not JSON */ }
  return null
}

export function isShutdownRequest(messageText: string): ShutdownRequestMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'shutdown_request') return parsed as ShutdownRequestMessage
  } catch { /* not JSON */ }
  return null
}

export function isShutdownApproved(messageText: string): ShutdownApprovedMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'shutdown_approved') return parsed as ShutdownApprovedMessage
  } catch { /* not JSON */ }
  return null
}

export function isShutdownRejected(messageText: string): ShutdownRejectedMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'shutdown_rejected') return parsed as ShutdownRejectedMessage
  } catch { /* not JSON */ }
  return null
}

export function isPlanApprovalRequest(messageText: string): PlanApprovalRequestMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'plan_approval_request') return parsed as PlanApprovalRequestMessage
  } catch { /* not JSON */ }
  return null
}

export function isPlanApprovalResponse(messageText: string): PlanApprovalResponseMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'plan_approval_response') return parsed as PlanApprovalResponseMessage
  } catch { /* not JSON */ }
  return null
}

export function isTeamPermissionUpdate(messageText: string): TeamPermissionUpdateMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'team_permission_update') return parsed as TeamPermissionUpdateMessage
  } catch { /* not JSON */ }
  return null
}

export function isModeSetRequest(messageText: string): ModeSetRequestMessage | null {
  try {
    const parsed = JSON.parse(messageText)
    if (parsed?.type === 'mode_set_request') return parsed as ModeSetRequestMessage
  } catch { /* not JSON */ }
  return null
}

// ─── 消息工厂函数 ────────────────────────────────────────────────────────────

export function createIdleNotification(
  agentId: string,
  options?: {
    idleReason?: IdleNotificationMessage['idleReason']
    summary?: string
    completedTaskId?: string
    completedStatus?: 'resolved' | 'blocked' | 'failed'
    failureReason?: string
  },
): IdleNotificationMessage {
  return {
    type: 'idle_notification',
    from: agentId,
    timestamp: new Date().toISOString(),
    ...options,
  }
}

export function createPermissionRequestMessage(params: {
  request_id: string
  agent_id: string
  tool_name: string
  tool_use_id: string
  description: string
  input: Record<string, unknown>
  permission_suggestions?: unknown[]
}): PermissionRequestMessage {
  return {
    type: 'permission_request',
    ...params,
    permission_suggestions: params.permission_suggestions || [],
  }
}

export function createPermissionResponseMessage(params: {
  request_id: string
  subtype: 'success' | 'error'
  error?: string
  updated_input?: Record<string, unknown>
  permission_updates?: unknown[]
}): PermissionResponseMessage {
  if (params.subtype === 'error') {
    return {
      type: 'permission_response',
      request_id: params.request_id,
      subtype: 'error',
      error: params.error || 'Permission denied',
    }
  }
  return {
    type: 'permission_response',
    request_id: params.request_id,
    subtype: 'success',
    response: {
      updated_input: params.updated_input,
      permission_updates: params.permission_updates,
    },
  }
}

export function createShutdownRequestMessage(params: {
  requestId: string
  from: string
  reason?: string
}): ShutdownRequestMessage {
  return {
    type: 'shutdown_request',
    requestId: params.requestId,
    from: params.from,
    reason: params.reason,
    timestamp: new Date().toISOString(),
  }
}

export function createShutdownApprovedMessage(params: {
  requestId: string
  from: string
  paneId?: string
  backendType?: string
}): ShutdownApprovedMessage {
  return {
    type: 'shutdown_approved',
    requestId: params.requestId,
    from: params.from,
    timestamp: new Date().toISOString(),
    paneId: params.paneId,
    backendType: params.backendType,
  }
}

export function createShutdownRejectedMessage(params: {
  requestId: string
  from: string
  reason: string
}): ShutdownRejectedMessage {
  return {
    type: 'shutdown_rejected',
    requestId: params.requestId,
    from: params.from,
    reason: params.reason,
    timestamp: new Date().toISOString(),
  }
}

export function createSandboxPermissionRequestMessage(params: {
  requestId: string
  workerId: string
  workerName: string
  workerColor?: string
  host: string
}): SandboxPermissionRequestMessage {
  return {
    type: 'sandbox_permission_request',
    requestId: params.requestId,
    workerId: params.workerId,
    workerName: params.workerName,
    workerColor: params.workerColor,
    hostPattern: { host: params.host },
    createdAt: Date.now(),
  }
}

export function createSandboxPermissionResponseMessage(params: {
  requestId: string
  host: string
  allow: boolean
}): SandboxPermissionResponseMessage {
  return {
    type: 'sandbox_permission_response',
    requestId: params.requestId,
    host: params.host,
    allow: params.allow,
    timestamp: new Date().toISOString(),
  }
}

export function createModeSetRequestMessage(params: {
  mode: string
  from: string
}): ModeSetRequestMessage {
  return {
    type: 'mode_set_request',
    mode: params.mode as ModeSetRequestMessage['mode'],
    from: params.from,
  }
}

/**
 * 高级工具函数：向 teammate inbox 发送关机请求
 * 封装了请求 ID 生成 + 消息构造 + mailbox 写入
 */
export async function sendShutdownRequestToMailbox(
  targetName: string,
  teamName?: string,
  reason?: string,
): Promise<{ requestId: string; target: string }> {
  const resolvedTeamName = teamName || getTeamName()
  const senderName = getAgentName() || 'team-lead'
  const requestId = `shutdown-${targetName}-${Date.now()}`

  const shutdownMessage = createShutdownRequestMessage({
    requestId,
    from: senderName,
    reason,
  })

  await writeToMailbox(
    targetName,
    {
      from: senderName,
      text: JSON.stringify(shutdownMessage),
      timestamp: new Date().toISOString(),
      color: getTeammateColor(),
    },
    resolvedTeamName,
  )

  return { requestId, target: targetName }
}

/**
 * 从最后一条 assistant 消息中提取 SendMessage tool_use 的 peer DM 摘要
 * 用于 idle 通知中的 summary 字段
 */
export function getLastPeerDmSummary(messages: Array<{
  type: string
  message: { content: string | Array<{ type: string; name?: string; input?: Record<string, unknown> }> }
}>): string | undefined {
  const SEND_MESSAGE_TOOL_NAME = 'SendMessage'
  const TEAM_LEAD_NAME = 'team-lead'

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) continue
    // 遇到用户消息边界则停止
    if (msg.type === 'user' && typeof msg.message.content === 'string') break
    if (msg.type !== 'assistant') continue

    const content = msg.message.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (
        block.type === 'tool_use' &&
        block.name === SEND_MESSAGE_TOOL_NAME &&
        block.input &&
        typeof block.input.to === 'string' &&
        block.input.to !== '*' &&
        block.input.to.toLowerCase() !== TEAM_LEAD_NAME.toLowerCase() &&
        typeof block.input.message === 'string'
      ) {
        const to = block.input.to
        const summary =
          typeof block.input.summary === 'string'
            ? block.input.summary
            : block.input.message.slice(0, 80)
        return `[to ${to}] ${summary}`
      }
    }
  }
  return undefined
}

// ─── 辅助函数（占位符，实际实现在各自模块中） ────────────────────────────────
declare function readFile(path: string, encoding: string): Promise<string>
declare function writeFile(path: string, data: string, options?: { encoding?: string; flag?: string } | string): Promise<void>
declare function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
declare function join(...paths: string[]): string
declare function getTeamsDir(): string
declare function getTeamName(teamContext?: unknown): string | undefined
declare function getAgentName(): string | undefined
declare function getTeammateColor(): string | undefined
declare function sanitizePathComponent(name: string): string
declare function logError(error: unknown): void
declare const lockfile: {
  lock(path: string, options: unknown): Promise<() => Promise<void>>
}
