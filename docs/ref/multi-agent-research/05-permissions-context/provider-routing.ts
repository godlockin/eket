/**
 * 来源: src/utils/model/providers.ts
 *       src/utils/model/configs.ts（模型配置）
 *
 * 多提供商模型路由：每个 Agent 可独立选择提供商和模型。
 *
 * 支持的提供商：
 * - firstParty：Anthropic API（默认）
 * - bedrock：AWS Bedrock
 * - vertex：GCP Vertex AI
 * - foundry：Azure AI Foundry
 *
 * 激活方式（环境变量）：
 * - CLAUDE_CODE_USE_BEDROCK=1 → AWS Bedrock
 * - CLAUDE_CODE_USE_VERTEX=1 → GCP Vertex AI
 * - CLAUDE_CODE_USE_FOUNDRY=1 → Azure Foundry
 *
 * 对你的价值：
 * - 不同角色的 Agent 可用不同提供商（成本/速度权衡）
 * - 路由逻辑简单（环境变量优先级），便于在 Agent 启动时注入
 * - 每个 Agent 独立的模型配置 → 廉价模型做路由/规划，高级模型做核心推理
 */

// ─── 提供商类型 ──────────────────────────────────────────────────────────────

/** API 提供商类型 */
export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

/**
 * 读取当前会话的提供商配置（从环境变量）
 *
 * 优先级：bedrock > vertex > foundry > firstParty
 */
export function getAPIProvider(): APIProvider {
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') return 'bedrock'
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1') return 'vertex'
  if (process.env.CLAUDE_CODE_USE_FOUNDRY === '1') return 'foundry'
  return 'firstParty'
}

// ─── 多 Agent 模型路由策略 ───────────────────────────────────────────────────

/**
 * 每个 Agent 的模型配置（存储在 TeamFile.members[].model）
 *
 * 设计亮点：
 * - 每个 member 可独立指定模型，覆盖全局配置
 * - 结合 agentType 可实现角色-模型映射策略
 */
export type AgentModelConfig = {
  /** Agent 名 */
  agentName: string
  /** 角色类型（如 "researcher", "test-runner", "orchestrator"） */
  agentType?: string
  /** 使用的模型名（如 "claude-opus-4-5", "claude-haiku-3-5"） */
  model?: string
  /** 提供商（留空使用全局配置） */
  provider?: APIProvider
}

/**
 * 角色-模型路由策略示例
 *
 * 可借鉴此模式定义你的 Agent 角色到模型的映射策略。
 * 根据任务复杂度选择合适的模型可以显著降低成本。
 */
export const EXAMPLE_ROLE_MODEL_STRATEGY: Record<string, {
  model: string
  rationale: string
}> = {
  // 核心推理角色：使用最强模型
  orchestrator: {
    model: 'claude-opus-4-5',
    rationale: '全局协调、复杂决策，需要最高推理能力',
  },
  researcher: {
    model: 'claude-opus-4-5',
    rationale: '深度分析，需要广泛知识和推理能力',
  },

  // 执行角色：平衡速度和能力
  implementer: {
    model: 'claude-sonnet-4-5',
    rationale: '代码实现，需要良好的编程能力，速度重要',
  },
  reviewer: {
    model: 'claude-sonnet-4-5',
    rationale: '代码审查，中等复杂度',
  },

  // 路由/过滤角色：使用最快模型
  router: {
    model: 'claude-haiku-3-5',
    rationale: '任务路由决策，简单分类，速度优先',
  },
  'test-runner': {
    model: 'claude-haiku-3-5',
    rationale: '执行测试脚本，任务明确，不需要复杂推理',
  },
}

// ─── 提供商路由配置 ──────────────────────────────────────────────────────────

/**
 * 多提供商路由配置
 *
 * 适用场景：
 * - 降低成本：不同角色路由到不同提供商（如价格更低的 Bedrock）
 * - 合规要求：数据驻留要求特定区域的提供商
 * - 负载均衡：多个提供商分担请求
 * - 功能差异：某些功能仅特定提供商支持
 */
export type ProviderRoutingConfig = {
  /** 默认提供商 */
  default: APIProvider
  /** 各角色类型的提供商覆盖 */
  overrideByRole?: Record<string, APIProvider>
  /** 模型名到提供商的映射（某些模型仅特定提供商支持） */
  overrideByModel?: Record<string, APIProvider>
}

/**
 * 为 Agent 生成启动时的环境变量（包含提供商配置）
 *
 * 用于 in-process Teammate 时，通过 AsyncLocalStorage 注入；
 * 用于外部进程 Teammate 时，作为子进程的环境变量。
 */
export function buildAgentEnvVars(config: AgentModelConfig & {
  providerRouting?: ProviderRoutingConfig
}): Record<string, string> {
  const env: Record<string, string> = {}

  // 确定使用的提供商
  const provider = config.provider ??
    config.providerRouting?.overrideByRole?.[config.agentType ?? ''] ??
    (config.model && config.providerRouting?.overrideByModel?.[config.model]) ??
    config.providerRouting?.default ??
    'firstParty'

  // 设置提供商环境变量
  switch (provider) {
    case 'bedrock':
      env.CLAUDE_CODE_USE_BEDROCK = '1'
      break
    case 'vertex':
      env.CLAUDE_CODE_USE_VERTEX = '1'
      break
    case 'foundry':
      env.CLAUDE_CODE_USE_FOUNDRY = '1'
      break
  }

  // 设置模型覆盖（如果指定）
  if (config.model) {
    // 注：实际模型覆盖通过 ANTHROPIC_MODEL 或框架内部机制传递
    env.CLAUDE_CODE_MODEL_OVERRIDE = config.model
  }

  return env
}

// ─── Bedrock 配置参考 ─────────────────────────────────────────────────────────

/**
 * AWS Bedrock 模型 ID 映射（参考）
 *
 * Anthropic 模型在 Bedrock 上有不同的模型 ID 格式：
 * anthropic.claude-opus-4-5-20241022-v1:0
 * anthropic.claude-sonnet-4-5-20241022-v1:0
 * anthropic.claude-haiku-3-5-20241022-v1:0
 *
 * 通过环境变量激活：
 * CLAUDE_CODE_USE_BEDROCK=1
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 */

/**
 * GCP Vertex AI 配置参考
 *
 * 模型端点格式：
 * projects/{project}/locations/{region}/publishers/anthropic/models/{model}
 *
 * 通过环境变量激活：
 * CLAUDE_CODE_USE_VERTEX=1
 * GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_REGION
 * 或 GOOGLE_APPLICATION_CREDENTIALS
 */

// ─── isFirstPartyAnthropicBaseUrl ────────────────────────────────────────────

/**
 * 检查 ANTHROPIC_BASE_URL 是否为 Anthropic 官方 API 地址。
 * 用于判断是否启用某些仅官方 API 支持的功能。
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) return true  // 未设置则默认使用官方 API
  try {
    const host = new URL(baseUrl).host
    return host === 'api.anthropic.com'
  } catch {
    return false
  }
}
