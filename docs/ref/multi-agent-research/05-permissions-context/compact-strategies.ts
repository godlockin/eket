/**
 * 来源: src/services/compact/autoCompact.ts
 *       src/utils/toolResultStorage.ts（工具结果外置）
 *
 * 上下文压缩策略：多 Agent 场景的 Context 管理。
 *
 * 核心问题：多 Agent 场景中 context 是稀缺资源
 * - 每个 Agent 有独立的 context window（200K tokens）
 * - Agent 越多，总 context 消耗越大
 * - 需要精细化管理每个 Agent 的 context 使用
 *
 * 三层策略：
 * 1. autoCompact：token 超过阈值时自动压缩整个对话历史
 * 2. toolResultStorage：大型工具结果外置到文件（结果引用内置）
 * 3. microCompact：细粒度压缩（部分历史）
 *
 * 对你的价值：
 * - "结果外置，引用内置"可显著降低每个 Agent 的 token 消耗
 * - autoCompact 阈值配置策略（工程经验）
 * - 压缩前后 Hook 让你的服务端感知 Agent 状态变化
 */

// ─── AutoCompact 阈值配置 ─────────────────────────────────────────────────────

/**
 * AutoCompact 相关缓冲值（工程实测数据）
 *
 * 这些数值来自 Anthropic 内部 p99.99 数据：
 * - MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000（压缩摘要的最大输出）
 * - AUTOCOMPACT_BUFFER = 13,000（触发压缩前保留的 token 缓冲）
 * - WARNING_THRESHOLD_BUFFER = 20,000（警告阈值缓冲）
 */
export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000

/** 触发自动压缩前的剩余 token 缓冲 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000

/** 显示警告时的剩余 token 缓冲 */
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000

/** 显示错误警告时的缓冲 */
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000

/** 手动压缩时的缓冲 */
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000

/** 连续压缩失败次数上限（电路断路器，防止无效重试） */
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3

/**
 * 计算有效 context 窗口大小
 *
 * = 模型 context window - 为压缩摘要预留的 token
 * = 200_000 - min(maxOutput, 20_000)
 *
 * 环境变量 CLAUDE_CODE_AUTO_COMPACT_WINDOW 可覆盖（测试用）
 */
export function getEffectiveContextWindowSize(
  modelContextWindow: number,
  maxOutputTokens: number,
): number {
  const reservedForSummary = Math.min(maxOutputTokens, MAX_OUTPUT_TOKENS_FOR_SUMMARY)
  const contextWindow = modelContextWindow

  // 允许通过环境变量降低 context window（用于测试更小 context 场景）
  const envOverride = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
  if (envOverride) {
    const parsed = parseInt(envOverride, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(contextWindow, parsed) - reservedForSummary
    }
  }

  return contextWindow - reservedForSummary
}

/**
 * 计算 AutoCompact 触发阈值
 * = 有效 context window - AUTOCOMPACT_BUFFER
 */
export function getAutoCompactThreshold(
  modelContextWindow: number,
  maxOutputTokens: number,
): number {
  const effectiveWindow = getEffectiveContextWindowSize(modelContextWindow, maxOutputTokens)
  const threshold = effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS

  // 允许按百分比覆盖（CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 → 80% 时触发）
  const envPercent = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
  if (envPercent) {
    const parsed = parseFloat(envPercent)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      const percentThreshold = Math.floor(effectiveWindow * (parsed / 100))
      return Math.min(percentThreshold, threshold)
    }
  }

  return threshold
}

// ─── Token 警告状态 ──────────────────────────────────────────────────────────

/** Token 使用警告级别 */
export type TokenWarningState = {
  percentLeft: number
  isAboveWarningThreshold: boolean   // 接近上限，显示警告
  isAboveErrorThreshold: boolean     // 非常接近上限，显示错误
  isAboveAutoCompactThreshold: boolean  // 已触发 AutoCompact
  isAtBlockingLimit: boolean         // 已超出 context window，无法继续
}

export function calculateTokenWarningState(
  tokenUsage: number,
  modelContextWindow: number,
  maxOutputTokens: number,
  autoCompactEnabled: boolean,
): TokenWarningState {
  const autoCompactThreshold = getAutoCompactThreshold(modelContextWindow, maxOutputTokens)
  const effectiveWindow = getEffectiveContextWindowSize(modelContextWindow, maxOutputTokens)

  const threshold = autoCompactEnabled ? autoCompactThreshold : effectiveWindow

  const percentLeft = Math.max(
    0,
    Math.round(((threshold - tokenUsage) / threshold) * 100),
  )

  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS

  return {
    percentLeft,
    isAboveWarningThreshold: tokenUsage >= warningThreshold,
    isAboveErrorThreshold: tokenUsage >= errorThreshold,
    isAboveAutoCompactThreshold: autoCompactEnabled && tokenUsage >= autoCompactThreshold,
    isAtBlockingLimit: tokenUsage >= effectiveWindow,
  }
}

// ─── AutoCompact 追踪状态 ─────────────────────────────────────────────────────

/** AutoCompact 会话状态（存储在 AppState 中） */
export type AutoCompactTrackingState = {
  compacted: boolean
  turnCounter: number
  turnId: string           // 每轮唯一 ID
  consecutiveFailures?: number  // 连续压缩失败次数（电路断路器）
}

/** 检查是否应该继续尝试 AutoCompact（防止无限重试） */
export function shouldAttemptAutoCompact(state: AutoCompactTrackingState): boolean {
  const failures = state.consecutiveFailures ?? 0
  return failures < MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
}

// ─── 工具结果外置（toolResultStorage） ───────────────────────────────────────
// 来源: src/utils/toolResultStorage.ts

/**
 * 工具结果外置：大型工具输出不放入 context，写文件并返回引用。
 *
 * 解决的问题：
 * - grep/bash 等工具可能返回数万 token 的输出
 * - 直接放入 context 会迅速消耗 context window
 * - 大量工具结果导致后续 API 调用费用激增
 *
 * 工作机制：
 * 1. 工具执行完成，输出超过阈值（如 10,000 chars）
 * 2. 将完整输出写入临时文件：~/.claude/tool-results/{sessionId}/{toolUseId}.txt
 * 3. 在 LLM context 中替换为引用标记：
 *    "[Result stored in /path/to/file - use Read tool to access]"
 * 4. LLM 需要时调用 Read 工具读取，按需加载
 *
 * 对你的价值：
 * - 多 Agent 场景中每个 Agent 的 context 都是稀缺资源
 * - "结果外置，引用内置"可显著降低每个 Agent instance 的 token 消耗
 * - 特别适合搜索结果、日志输出、大型文件读取等场景
 */

export type ToolResultStorageConfig = {
  /** 外置阈值（chars），超过此长度的工具结果外置 */
  externalizeThresholdChars: number
  /** 外置文件存储目录 */
  storageDir: string
  /** 文件保留时间（ms），过期后可清理 */
  retentionMs: number
}

export const DEFAULT_TOOL_RESULT_STORAGE_CONFIG: ToolResultStorageConfig = {
  externalizeThresholdChars: 10_000,   // 约 2,500 tokens
  storageDir: '~/.claude/tool-results',
  retentionMs: 24 * 60 * 60 * 1000,   // 24小时
}

/** 工具结果引用格式（注入 LLM context 的占位符） */
export type ContentReplacementState = {
  type: 'content_replacement'
  storageId: string          // 文件唯一 ID
  filePath: string           // 完整文件路径
  /** 内嵌摘要（前 200 chars），避免完全不可见 */
  preview?: string
  originalLength: number     // 原始内容长度（chars）
}

export function formatContentReplacement(state: ContentReplacementState): string {
  const preview = state.preview ? `\nPreview: ${state.preview}...` : ''
  return `[Content (${state.originalLength.toLocaleString()} chars) stored externally.${preview}\nFull content in: ${state.filePath}\nUse Read tool to access]`
}

// ─── Compact 策略枚举 ─────────────────────────────────────────────────────────

/**
 * Compact 策略说明（来自 README）：
 *
 * 1. Full Compact（autoCompact）
 *    - 将整个对话历史摘要为一条消息
 *    - 触发：token 使用超过 autoCompactThreshold
 *    - 结果：context 重置为极小（仅含摘要）
 *    - 适合：长时间运行的 Agent
 *
 * 2. Micro Compact（microCompact）
 *    - 仅压缩最近 N 轮的工具调用
 *    - 触发：上下文达到一定深度
 *    - 结果：删除中间步骤，保留结论
 *    - 适合：有大量探索性工具调用的场景
 *
 * 3. Tool Result Externalization（toolResultStorage）
 *    - 大型工具结果替换为引用
 *    - 触发：工具结果超过阈值（如 10KB）
 *    - 结果：context 中只有引用，完整结果在文件中
 *    - 适合：grep/bash 等可能产生大量输出的工具
 *
 * 你的框架建议：
 * - 优先使用 toolResultStorage（无损，随时可访问）
 * - 其次 microCompact（保留重要上下文）
 * - 最后 full compact（丢失中间状态，但可继续工作）
 */

// ─── PreCompact / PostCompact Hook 数据 ──────────────────────────────────────

/** PreCompact Hook 携带的数据（可用于服务端保存重要上下文） */
export type PreCompactHookData = {
  sessionId: string
  tokenUsage: number
  contextWindowSize: number
  /** 即将被压缩的消息数 */
  messageCount: number
}

/** PostCompact Hook 携带的数据（压缩完成后的状态） */
export type PostCompactHookData = {
  sessionId: string
  /** 压缩前 token 使用量 */
  tokensBeforeCompact: number
  /** 压缩后 token 使用量 */
  tokensAfterCompact: number
  /** 压缩摘要内容 */
  summaryContent: string
}
