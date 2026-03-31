/**
 * 来源: src/tools/SendMessageTool/SendMessageTool.ts
 *
 * SendMessage 工具：Agent 间消息发送的完整协议与实现。
 *
 * 核心设计：
 * 1. 寻址方式多元化：
 *    - 按名字单播：`to: "alice"`
 *    - 广播：`to: "*"`
 *    - Unix Domain Socket：`to: "uds:<socket-path>"` （本地跨进程）
 *    - Bridge 远程：`to: "bridge:<session-id>"` （跨机器）
 *
 * 2. 消息类型二元化：
 *    - 普通文本：`message: string`（需附 summary 5-10 词摘要）
 *    - 结构化消息：`message: StructuredMessage`（shutdown/plan_approval 等）
 *
 * 3. 智能路由：
 *    - 优先检查 in-process subagent（AsyncLocalStorage 隔离的本地 Agent）
 *    - 已停止的 Agent 自动从 transcript 恢复（resumeAgentBackground）
 *    - 最后才走文件 mailbox（tmux/external 进程）
 *
 * 4. 权限控制：
 *    - bridge: 目标需要用户明确同意（防跨机器 prompt injection）
 *    - 结构化消息不能跨会话发送
 *
 * 对你的价值：
 * - 完整的 Agent 间寻址协议设计
 * - 结构化消息类型 → 扩展为你的角色协作协议
 * - in-process Agent 路由 → 你的常驻服务器内 Agent 通信模型
 */

// ─── 输入 Schema ──────────────────────────────────────────────────────────────

/**
 * 结构化消息联合类型：通过 discriminatedUnion 实现类型安全的消息路由
 *
 * 扩展点：在此添加你自己的结构化消息类型
 *   | { type: 'task_delegation'; taskId: string; description: string }
 *   | { type: 'result_report'; taskId: string; status: 'success' | 'failure'; output: string }
 */
type StructuredMessage =
  | {
      type: 'shutdown_request'
      reason?: string
    }
  | {
      type: 'shutdown_response'
      request_id: string
      approve: boolean
      reason?: string
    }
  | {
      type: 'plan_approval_response'
      request_id: string
      approve: boolean
      feedback?: string
    }

type SendMessageInput = {
  to: string          // 收件人：名字 / "*" / "uds:<path>" / "bridge:<id>"
  summary?: string    // 5-10 词摘要（纯文本消息必填）
  message: string | StructuredMessage
}

// ─── 输出类型 ─────────────────────────────────────────────────────────────────

/** 单播结果，附带路由信息（用于 UI 显示） */
type MessageOutput = {
  success: boolean
  message: string
  routing?: {
    sender: string
    senderColor?: string
    target: string
    targetColor?: string
    summary?: string
    content?: string
  }
}

/** 广播结果，附带实际收件人列表 */
type BroadcastOutput = {
  success: boolean
  message: string
  recipients: string[]
  routing?: MessageOutput['routing']
}

/** 请求类消息（shutdown_request）的结果，附带 request_id 供后续响应使用 */
type RequestOutput = {
  success: boolean
  message: string
  request_id: string
  target: string
}

/** 响应类消息（shutdown_response / plan_approval_response）的结果 */
type ResponseOutput = {
  success: boolean
  message: string
  request_id?: string
}

type SendMessageToolOutput =
  | MessageOutput
  | BroadcastOutput
  | RequestOutput
  | ResponseOutput

// ─── 核心路由逻辑（精简版） ───────────────────────────────────────────────────

/**
 * SendMessage 工具 call() 方法的路由决策树：
 *
 * 1. bridge: 目标 → postInterClaudeMessage（通过 Anthropic 服务器跨机器传送）
 * 2. uds: 目标  → sendToUdsSocket（本地 Unix Domain Socket）
 * 3. 同名 in-process subagent:
 *    - 运行中 → queuePendingMessage（下一轮工具循环时送达）
 *    - 已停止 → resumeAgentBackground（从 transcript 恢复并注入消息）
 *    - 已驱逐 → 尝试从磁盘 transcript 恢复
 * 4. 普通文本 + to="*" → handleBroadcast（写入所有 teammate mailbox）
 * 5. 普通文本 + 名字  → handleMessage（写入单个 teammate mailbox）
 * 6. 结构化消息：
 *    - shutdown_request    → handleShutdownRequest
 *    - shutdown_response   → handleShutdownApproval / handleShutdownRejection
 *    - plan_approval_response → handlePlanApproval / handlePlanRejection
 */

// ─── 单播处理 ─────────────────────────────────────────────────────────────────

/**
 * 向单个 teammate 发送普通文本消息（通过文件 mailbox）
 */
async function handleMessage(
  recipientName: string,
  content: string,
  summary: string | undefined,
  teamName: string | undefined,
  senderName: string,
  senderColor: string | undefined,
): Promise<{ data: MessageOutput }> {
  await writeToMailbox(
    recipientName,
    {
      from: senderName,
      text: content,
      summary,
      timestamp: new Date().toISOString(),
      color: senderColor,
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Message sent to ${recipientName}'s inbox`,
      routing: {
        sender: senderName,
        senderColor,
        target: `@${recipientName}`,
        summary,
        content,
      },
    },
  }
}

// ─── 广播处理 ─────────────────────────────────────────────────────────────────

/**
 * 向所有 teammate 广播消息（排除自己）
 * 读取 teamFile.members 确定收件人列表
 */
async function handleBroadcast(
  content: string,
  summary: string | undefined,
  teamName: string,
  senderName: string,
  senderColor: string | undefined,
  teamMembers: Array<{ name: string }>,
): Promise<{ data: BroadcastOutput }> {
  const recipients = teamMembers
    .filter(m => m.name.toLowerCase() !== senderName.toLowerCase())
    .map(m => m.name)

  if (recipients.length === 0) {
    return {
      data: {
        success: true,
        message: 'No teammates to broadcast to (you are the only team member)',
        recipients: [],
      },
    }
  }

  for (const recipientName of recipients) {
    await writeToMailbox(
      recipientName,
      {
        from: senderName,
        text: content,
        summary,
        timestamp: new Date().toISOString(),
        color: senderColor,
      },
      teamName,
    )
  }

  return {
    data: {
      success: true,
      message: `Message broadcast to ${recipients.length} teammate(s): ${recipients.join(', ')}`,
      recipients,
      routing: {
        sender: senderName,
        senderColor,
        target: '@team',
        summary,
        content,
      },
    },
  }
}

// ─── 关机协议处理 ─────────────────────────────────────────────────────────────

/**
 * Leader → Worker：发送关机请求
 *
 * 设计亮点：生成带时间戳的 request_id，Worker 响应时必须携带同一 ID
 * 这实现了无状态的请求-响应匹配
 */
async function handleShutdownRequest(
  targetName: string,
  reason: string | undefined,
  teamName: string | undefined,
  senderName: string,
): Promise<{ data: RequestOutput }> {
  const requestId = `shutdown-${targetName}-${Date.now()}`
  const shutdownMessage = {
    type: 'shutdown_request',
    requestId,
    from: senderName,
    reason,
    timestamp: new Date().toISOString(),
  }

  await writeToMailbox(
    targetName,
    {
      from: senderName,
      text: JSON.stringify(shutdownMessage),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Shutdown request sent to ${targetName}. Request ID: ${requestId}`,
      request_id: requestId,
      target: targetName,
    },
  }
}

/**
 * Worker → Leader：批准关机请求
 *
 * 关键行为差异：
 * - in-process Worker：abort AbortController，由任务管理器感知并清理
 * - tmux/外部进程 Worker：调用 gracefulShutdown(0) 退出进程
 */
async function handleShutdownApproval(
  requestId: string,
  agentName: string,
  teamName: string | undefined,
  isInProcess: boolean,
  abortController?: AbortController,
): Promise<{ data: ResponseOutput }> {
  const approvedMessage = {
    type: 'shutdown_approved',
    requestId,
    from: agentName,
    timestamp: new Date().toISOString(),
  }

  await writeToMailbox(
    'team-lead',
    {
      from: agentName,
      text: JSON.stringify(approvedMessage),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  if (isInProcess && abortController) {
    // in-process：通过 AbortController 通知任务管理器
    abortController.abort()
  } else {
    // 外部进程：延迟退出（让消息发送完成后再退出）
    setImmediate(async () => {
      process.exit(0)
    })
  }

  return {
    data: {
      success: true,
      message: `Shutdown approved. Sent confirmation to team-lead. Agent ${agentName} is now exiting.`,
      request_id: requestId,
    },
  }
}

/**
 * Worker → Leader：拒绝关机请求（Worker 当前正在处理重要任务）
 */
async function handleShutdownRejection(
  requestId: string,
  reason: string,
  agentName: string,
  teamName: string | undefined,
): Promise<{ data: ResponseOutput }> {
  const rejectedMessage = {
    type: 'shutdown_rejected',
    requestId,
    from: agentName,
    reason,
    timestamp: new Date().toISOString(),
  }

  await writeToMailbox(
    'team-lead',
    {
      from: agentName,
      text: JSON.stringify(rejectedMessage),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Shutdown rejected. Reason: "${reason}". Continuing to work.`,
      request_id: requestId,
    },
  }
}

// ─── Plan 审批协议处理 ────────────────────────────────────────────────────────

/**
 * Leader → Worker：批准计划并指定后续执行的权限模式
 *
 * 关键设计：Leader 当前是 plan 模式，但传给 Worker 的是实际执行模式（default/acceptEdits）
 * 防止 Worker 以 plan 模式执行（plan 模式只能规划，不能写代码）
 */
async function handlePlanApproval(
  recipientName: string,
  requestId: string,
  leaderMode: string,
  teamName: string | undefined,
): Promise<{ data: ResponseOutput }> {
  // Leader 是 plan 模式时，Worker 继承 default（否则 Worker 也会卡在 plan 模式）
  const modeToInherit = leaderMode === 'plan' ? 'default' : leaderMode

  const approvalResponse = {
    type: 'plan_approval_response',
    requestId,
    approved: true,
    timestamp: new Date().toISOString(),
    permissionMode: modeToInherit,
  }

  await writeToMailbox(
    recipientName,
    {
      from: 'team-lead',
      text: JSON.stringify(approvalResponse),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Plan approved for ${recipientName}. They will receive the approval and can proceed with implementation.`,
      request_id: requestId,
    },
  }
}

/**
 * Leader → Worker：拒绝计划并提供反馈
 */
async function handlePlanRejection(
  recipientName: string,
  requestId: string,
  feedback: string,
  teamName: string | undefined,
): Promise<{ data: ResponseOutput }> {
  const rejectionResponse = {
    type: 'plan_approval_response',
    requestId,
    approved: false,
    feedback,
    timestamp: new Date().toISOString(),
  }

  await writeToMailbox(
    recipientName,
    {
      from: 'team-lead',
      text: JSON.stringify(rejectionResponse),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Plan rejected for ${recipientName} with feedback: "${feedback}"`,
      request_id: requestId,
    },
  }
}

// ─── 权限校验规则摘要 ─────────────────────────────────────────────────────────

/**
 * SendMessage 工具的权限校验规则：
 *
 * checkPermissions():
 *   - bridge: 目标 → behavior: 'ask'（需用户明确同意，classifierApprovable: false）
 *   - 其他 → behavior: 'allow'
 *
 * validateInput():
 *   1. to 不能为空
 *   2. bridge:/uds: 目标名不能为空
 *   3. to 不能含 @ 符号（每 session 只有一个 team）
 *   4. bridge: 目标的 message 必须是字符串（结构化消息不能跨 session）
 *   5. bridge: 目标要求 ReplBridge 已连接
 *   6. 字符串 message 必须提供 summary（UDS 除外）
 *   7. 广播（to: "*"）不能发结构化消息
 *   8. shutdown_response 必须发给 "team-lead"
 *   9. 拒绝 shutdown 时 reason 必填
 */

// ─── 地址解析工具（来源 src/utils/peerAddress.ts） ────────────────────────────

/**
 * 解析 to 字段的地址格式
 * 支持：名字(other) / "uds:<path>" / "bridge:<id>"
 */
export function parseAddress(
  to: string,
): { scheme: 'uds' | 'bridge' | 'other'; target: string } {
  if (to.startsWith('uds:')) return { scheme: 'uds', target: to.slice(4) }
  if (to.startsWith('bridge:')) return { scheme: 'bridge', target: to.slice(7) }
  return { scheme: 'other', target: to }
}

// ─── 占位符声明 ──────────────────────────────────────────────────────────────
declare function writeToMailbox(
  recipientName: string,
  message: { from: string; text: string; summary?: string; timestamp: string; color?: string },
  teamName?: string,
): Promise<void>
