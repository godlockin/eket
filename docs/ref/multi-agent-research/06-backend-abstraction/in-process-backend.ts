/**
 * 来源: src/utils/swarm/backends/InProcessBackend.ts（完整实现）
 *       src/utils/swarm/spawnInProcess.ts（spawn 实现）
 *       src/utils/swarm/inProcessRunner.ts（运行循环）
 *
 * In-Process Backend 完整实现参考：在同进程中运行多个 Agent。
 *
 * 这是"常驻服务器做代理"架构中最核心的执行引擎。
 * 相比 tmux/iTerm2 外部进程模式，in-process 的优势：
 * - 共享 API client（复用连接，减少认证开销）
 * - 共享 MCP 连接
 * - 更低延迟（无跨进程通信开销）
 * - 内存共享（可通过 AppState 访问团队全局状态）
 *
 * 核心机制：AsyncLocalStorage 上下文隔离
 * - Node.js AsyncLocalStorage 提供异步上下文隔离
 * - 每个 Teammate 在独立的 AsyncLocalStorage 上下文中运行
 * - getTeamName() / getAgentName() 自动读取当前上下文的值
 * - 同一进程的不同 Teammate 互不干扰
 */

import { AsyncLocalStorage } from 'async_hooks'

// ─── AsyncLocalStorage 上下文设计 ────────────────────────────────────────────

/**
 * Teammate 执行上下文（存储在 AsyncLocalStorage 中）
 *
 * 每个 in-process Teammate 在自己的 AsyncLocalStorage 中存储此上下文。
 * 所有在该上下文链中运行的代码都能通过 storage.getStore() 访问。
 */
export type TeammateContext = {
  /** Agent 唯一 ID（格式："agentName@teamName"） */
  agentId: string
  /** Agent 名（人类可读） */
  agentName: string
  /** 团队名 */
  teamName: string
  /** UI 显示颜色 */
  color?: string
  /** 是否强制 plan 模式（执行前需 Leader 审批） */
  planModeRequired: boolean
  /** 独立 AbortController（不与父 Agent 共享，防止误杀） */
  abortController: AbortController
  /** 在 AppState.tasks 中的任务 ID */
  taskId: string
}

/** 全局 AsyncLocalStorage 实例（进程单例） */
const teammateStorage = new AsyncLocalStorage<TeammateContext>()

/**
 * 在 AsyncLocalStorage 上下文中读取当前 Teammate 信息
 *
 * 关键设计：
 * - 在 Teammate 的运行上下文中调用 → 返回该 Teammate 的值
 * - 在 Leader/主进程中调用 → 返回 undefined
 * - 通过此机制，同一函数（如 getTeamName()）在不同 Agent 的上下文中返回不同值
 */
export function getCurrentTeammateContext(): TeammateContext | undefined {
  return teammateStorage.getStore()
}

export function getAgentName(): string | undefined {
  return getCurrentTeammateContext()?.agentName
}

export function getTeamName(): string | undefined {
  return getCurrentTeammateContext()?.teamName
}

export function getAgentId(): string | undefined {
  return getCurrentTeammateContext()?.agentId
}

export function getTeammateColor(): string | undefined {
  return getCurrentTeammateContext()?.color
}

export function isTeammate(): boolean {
  return getCurrentTeammateContext() !== undefined
}

// ─── In-Process Teammate 生命周期 ────────────────────────────────────────────

export type InProcessSpawnConfig = {
  name: string
  teamName: string
  prompt: string
  color?: string
  planModeRequired?: boolean
}

export type InProcessSpawnResult = {
  success: boolean
  agentId: string
  taskId: string
  abortController: AbortController
  error?: string
}

/**
 * 生成 in-process Teammate（核心函数）
 *
 * 步骤：
 * 1. 创建 TeammateContext（含独立 AbortController）
 * 2. 在 AppState.tasks 注册 InProcessTeammateTask
 * 3. 启动异步执行循环（不等待完成）
 * 4. 返回 agentId + taskId + abortController
 *
 * 注意：步骤 3 是非阻塞的，runAgent() 在后台异步运行
 */
export async function spawnInProcessTeammate(
  config: InProcessSpawnConfig,
  registerTask: (agentId: string, taskId: string, abortController: AbortController) => void,
  runAgentFn: (config: InProcessSpawnConfig, context: TeammateContext) => Promise<void>,
): Promise<InProcessSpawnResult> {
  const agentId = `${config.name}@${config.teamName}`
  const taskId = `task-${agentId}-${Date.now()}`
  const abortController = new AbortController()

  // 创建执行上下文
  const context: TeammateContext = {
    agentId,
    agentName: config.name,
    teamName: config.teamName,
    color: config.color,
    planModeRequired: config.planModeRequired ?? false,
    abortController,
    taskId,
  }

  // 在 AppState 注册（Leader 可通过 taskId 跟踪）
  registerTask(agentId, taskId, abortController)

  // 在 AsyncLocalStorage 上下文中运行 Agent（非阻塞）
  setImmediate(() => {
    // AsyncLocalStorage.run() 建立独立的上下文链
    // 所有在此 callback 中（及其异步后代）调用 getStore() 都能看到此上下文
    void teammateStorage.run(context, async () => {
      try {
        await runAgentFn(config, context)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error(`[InProcess] Teammate ${agentId} failed:`, error)
        }
      }
    })
  })

  return {
    success: true,
    agentId,
    taskId,
    abortController,
  }
}

// ─── InProcessTeammateTask（AppState 中的任务记录） ───────────────────────────

/**
 * InProcessTeammateTask：AppState.tasks 中的 in-process Teammate 记录。
 *
 * 相比 LocalAgentTask（普通 subagent），InProcessTeammateTask 额外包含：
 * - abortController：用于强制终止
 * - teamName：所属团队
 * - color：UI 颜色
 */
export type InProcessTeammateTask = {
  type: 'in-process-teammate'
  agentId: string
  agentName: string
  teamName: string
  taskId: string
  status: 'running' | 'completed' | 'failed' | 'aborted'
  color?: string
  abortController: AbortController
  createdAt: number
  completedAt?: number
  /** Pending 消息队列（SendMessage 发来的消息） */
  pendingMessages: Array<{ text: string; from: string; timestamp: string }>
}

/**
 * 通过 agentId 找到 AppState 中的 in-process Teammate 任务
 */
export function findTeammateTaskByAgentId(
  agentId: string,
  tasks: Record<string, unknown>,
): InProcessTeammateTask | undefined {
  for (const task of Object.values(tasks)) {
    if (
      task &&
      typeof task === 'object' &&
      'type' in task &&
      (task as { type: string }).type === 'in-process-teammate' &&
      'agentId' in task &&
      (task as { agentId: string }).agentId === agentId
    ) {
      return task as InProcessTeammateTask
    }
  }
  return undefined
}

// ─── Pending Message 队列 ────────────────────────────────────────────────────

/**
 * 向正在运行的 in-process Teammate 排队发送消息。
 *
 * 工作机制：
 * 1. SendMessageTool 调用 queuePendingMessage()
 * 2. 消息加入 InProcessTeammateTask.pendingMessages
 * 3. Teammate 在下次工具循环开始时（runAgent 轮询）检查并消费队列
 * 4. 消息作为 user 消息注入 Teammate 的对话历史
 *
 * 对比 tmux 模式：tmux 直接通过文件 mailbox 写入，进程间无共享状态
 * in-process 可以更高效地通过共享内存传递消息
 */
export function queuePendingMessage(
  agentId: string,
  text: string,
  from: string,
  tasks: Record<string, unknown>,
): boolean {
  const task = findTeammateTaskByAgentId(agentId, tasks)
  if (!task || task.status !== 'running') return false

  task.pendingMessages.push({
    text,
    from,
    timestamp: new Date().toISOString(),
  })
  return true
}

// ─── 设计总结 ────────────────────────────────────────────────────────────────
/**
 * In-Process Backend 关键设计决策总结：
 *
 * 1. AsyncLocalStorage vs 全局变量
 *    - AsyncLocalStorage 天然支持并发（不同 Teammate 互不干扰）
 *    - 全局变量会导致多 Teammate 时状态混乱
 *    - 实现成本：每次 getAgentName() 等调用需从存储读取
 *
 * 2. 独立 AbortController vs 共享父 Controller
 *    - 独立：Leader abort 不会误杀 Teammate
 *    - 独立：Teammate abort 不会导致 Leader 停止
 *    - 权衡：需要手动管理 Teammate 生命周期
 *
 * 3. 文件 mailbox vs 内存队列
 *    - 文件 mailbox：跨进程一致，持久化，调试友好
 *    - 内存队列（pendingMessages）：更低延迟，但非持久化
 *    - 实际设计：两者并用，内存队列作为优化，文件 mailbox 作为标准协议
 *
 * 4. setImmediate vs Promise
 *    - setImmediate 确保 spawn() 立即返回（非阻塞）
 *    - Agent 执行循环在事件循环的下一个 tick 开始
 *    - 避免 spawn() 的调用者被阻塞
 */
