/**
 * 来源: src/bridge/bridgeMain.ts（核心常驻服务逻辑）
 *
 * Bridge 架构：常驻服务代理（Agent Pool 模式）。
 *
 * 核心设计：
 * 1. 退避重连配置（BackoffConfig）：生产级连接管理
 *    - 初次连接失败：指数退避，最大 2 分钟
 *    - 10 分钟内放弃重连（防止无限重试）
 * 2. Bridge 生命周期：
 *    registerWorker() → Poll/WebSocket → createSessionSpawner() → stopWork()
 * 3. 容量唤醒（capacityWake）：服务端通知可用时主动拉取工作
 * 4. 会话快照恢复：断线重连后从快照恢复 Agent 状态
 *
 * 对你的价值：
 * - 常驻服务器的生产级 Agent Pool 实现参考
 * - 指数退避、容量唤醒、会话恢复都是值得借鉴的基础设施模式
 */

// ─── 退避重连配置 ────────────────────────────────────────────────────────────

/**
 * 生产级退避配置。
 *
 * connInitialMs/connCapMs/connGiveUpMs：连接层退避
 * generalInitialMs/generalCapMs/generalGiveUpMs：通用操作退避
 *
 * 设计要点：
 * - giveUpMs (10分钟) >> capMs (2分钟) — 在放弃前有足够的重试窗口
 * - shutdownGraceMs (30s) — SIGTERM 到 SIGKILL 的优雅退出窗口
 * - stopWorkBaseDelayMs — 向服务端报告任务完成的退避基础延迟
 */
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
  connCapMs: 120_000,     // 2分钟最大重连间隔
  connGiveUpMs: 600_000,  // 10分钟后放弃
  generalInitialMs: 500,
  generalCapMs: 30_000,
  generalGiveUpMs: 600_000,
}

// ─── Bridge 核心类型 ─────────────────────────────────────────────────────────

/** Bridge 配置 */
export type BridgeConfig = {
  /** Bridge ID（用于向服务端注册） */
  bridgeId: string
  /** 工作目录 */
  cwd: string
  /** 最大并发会话数（默认 32） */
  maxSessions?: number
  /** 是否启用快照恢复 */
  enableSnapshotRestore?: boolean
}

/** 会话句柄（正在运行的 Agent 会话） */
export type SessionHandle = {
  /** 会话 ID */
  sessionId: string
  /** 中止控制器 */
  abortController: AbortController
  /** 等待会话完成 */
  waitForDone(): Promise<SessionDoneStatus>
}

/** 会话完成状态 */
export type SessionDoneStatus = {
  success: boolean
  error?: string
  /** 会话快照（用于恢复） */
  snapshot?: unknown
}

/** 会话生成配置 */
export type SessionSpawnOpts = {
  sessionId: string
  prompt: string
  /** 恢复模式：从快照恢复 */
  restore?: boolean
  /** 快照数据 */
  snapshot?: unknown
}

/** 会话生成器接口 */
export type SessionSpawner = {
  spawn(opts: SessionSpawnOpts, dir: string): SessionHandle
}

// ─── Bridge 生命周期（runBridgeLoop 核心逻辑摘要） ───────────────────────────

/**
 * Bridge 主循环逻辑（精简版）
 *
 * 完整实现见 src/bridge/bridgeMain.ts: runBridgeLoop()
 * 这里是便于理解的伪代码注释版本。
 *
 * ```
 * async function runBridgeLoop(config, api, spawner, signal, backoff):
 *   1. registerWorker()
 *      → 向服务端注册，获取 work_secret（含 sessionId + token）
 *      → 失败时指数退避重试
 *
 *   2. setupCapacityWake()
 *      → 监听服务端的容量通知（WebSocket ping）
 *      → 收到通知时立即发起 poll，不等待下次轮询间隔
 *
 *   3. POLL LOOP:
 *      while (!signal.aborted):
 *        work = await api.pollForWork()
 *        if (work exists):
 *          session = spawner.spawn(work.sessionId, work.prompt)
 *          registerActiveSessions(session)
 *          // 不等待 session 完成，直接进入下一个 poll
 *        else:
 *          await sleep(pollInterval)  // 指数退避
 *
 *   4. ON SESSION DONE:
 *      status = await session.waitForDone()
 *      await api.stopWork(sessionId, status)  // 带重试
 *      removeFromActiveSessions(session)
 *
 *   5. SHUTDOWN:
 *      signal.abort() 触发
 *      等待所有活跃 session 完成（最多 shutdownGraceMs）
 *      SIGTERM 后 shutdownGraceMs 发 SIGKILL
 * ```
 *
 * 关键设计点：
 * - 非阻塞 poll：不等待 session 完成就继续 poll，实现并发
 * - 容量唤醒：避免轮询延迟，服务端有工作时立即被通知
 * - 快照恢复：Agent 崩溃后可从中间状态恢复（无需重跑全部）
 */

// ─── 指数退避算法（来源 bridgeMain.ts 内部） ─────────────────────────────────

/**
 * 计算下次重试的等待时间（指数退避 + 抖动）
 *
 * @param attempt 当前重试次数（从 0 开始）
 * @param initialMs 初始延迟（ms）
 * @param capMs 最大延迟（ms）
 * @returns 延迟时间（ms）
 */
export function calculateBackoffDelay(
  attempt: number,
  initialMs: number,
  capMs: number,
): number {
  // 指数增长
  const exponential = initialMs * Math.pow(2, attempt)
  // 上限截断
  const capped = Math.min(exponential, capMs)
  // 随机抖动（± 10%），防止惊群效应
  const jitter = capped * (0.9 + Math.random() * 0.2)
  return Math.floor(jitter)
}

/**
 * 检测系统休眠/唤醒（Poll 循环中的睡眠唤醒检测）
 *
 * 原理：记录每次 poll 的时间戳，如果两次间隔远超预期（> 2 * capMs），
 * 说明系统可能休眠过，需要重置退避状态。
 *
 * 见 bridgeMain.ts: pollSleepDetectionThresholdMs()
 */
export function detectSleepWake(
  lastPollTime: number,
  now: number,
  backoff: BackoffConfig,
): boolean {
  const threshold = backoff.connCapMs * 2  // 2× connCapMs
  return now - lastPollTime > threshold
}

// ─── 容量唤醒（capacityWake） ────────────────────────────────────────────────

/**
 * 容量唤醒接口：服务端有新工作时主动通知 Bridge
 *
 * 实现：服务端通过 WebSocket ping 或 SSE 通知
 * Bridge 收到通知后立即跳出 sleep，执行一次 poll
 *
 * 对你的价值：
 * - 消除 Agent Pool 的轮询延迟
 * - 任务到达立即分配，不等待下次轮询间隔
 */
export type CapacityWake = {
  /** 等待容量通知（Promise）；收到通知或超时后 resolve */
  wait(timeoutMs: number): Promise<void>
  /** 触发一次唤醒（用于测试或手动触发） */
  wake(): void
  /** 关闭 */
  close(): void
}

// ─── work_secret 协议 ────────────────────────────────────────────────────────

/**
 * work_secret：Bridge 注册后获得的工作凭证
 *
 * 包含：
 * - sessionId：本次工作的 Agent 会话 ID
 * - token：临时访问令牌（有效期内有效）
 * - sdkUrl：SDK 连接端点
 *
 * 来源: src/bridge/workSecret.ts
 */
export type WorkSecret = {
  sessionId: string
  token: string
  sdkUrl: string
  /** 是否为恢复模式 */
  restore?: boolean
  /** 快照数据（恢复模式时存在） */
  snapshot?: unknown
}

// ─── 睡眠/唤醒感知 Poll 间隔配置 ─────────────────────────────────────────────
// 来源: src/bridge/pollConfig.ts

export type PollIntervalConfig = {
  /** 空闲时的基础 poll 间隔（ms），随退避增加 */
  baseMs: number
  /** 最大 poll 间隔（ms） */
  maxMs: number
  /** 连续无工作后开始退避的轮次 */
  idleThreshold: number
}

export const DEFAULT_POLL_INTERVAL: PollIntervalConfig = {
  baseMs: 2_000,
  maxMs: 30_000,
  idleThreshold: 3,
}
