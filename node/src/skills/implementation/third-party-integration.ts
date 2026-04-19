/**
 * EKET Framework - Third-Party Integration Skill
 * Version: 1.0.0
 *
 * 第三方集成技能：文档锁定 → 沙箱验证 → 错误处理 → 幂等设计 → 超时降级 → 凭证管理 → 监控
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 第三方集成输入
 */
export interface ThirdPartyIntegrationInput {
  /** 第三方服务名称 */
  serviceName: string;
  /** 集成类型 */
  integrationType?: 'REST' | 'GraphQL' | 'gRPC' | 'Webhook' | 'SDK' | 'OAuth2';
  /** 用途描述 */
  purpose?: string;
  /** 是否在关键路径上 */
  isCriticalPath?: boolean;
}

/**
 * 集成步骤
 */
export interface IntegrationStep {
  index: number;
  title: string;
  description: string;
  checkPoints: string[];
  codeTemplate?: string;
  antiPatterns?: string[];
}

/**
 * 第三方集成输出
 */
export interface ThirdPartyIntegrationOutput {
  /** 集成步骤 */
  steps: IntegrationStep[];
  /** Circuit Breaker 配置模板 */
  circuitBreakerConfig: Record<string, unknown>;
  /** 监控指标清单 */
  monitoringMetrics: string[];
  /** .env 变量模板 */
  envTemplate: string;
}

/**
 * 第三方集成 Skill 实例
 */
export const ThirdPartyIntegrationSkill: Skill<ThirdPartyIntegrationInput, ThirdPartyIntegrationOutput> = {
  name: 'third_party_integration',
  description: '第三方服务集成：文档锁定 → 沙箱验证 → 错误码处理 → 幂等设计 → 超时降级 → 凭证管理 → 监控接入',
  category: SkillCategory.IMPLEMENTATION,
  tags: ['integration', 'third-party', 'api', 'circuit-breaker', 'idempotency', 'monitoring'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['serviceName'],
    properties: {
      serviceName: { type: 'string', description: '第三方服务名称' },
      integrationType: {
        type: 'string',
        enum: ['REST', 'GraphQL', 'gRPC', 'Webhook', 'SDK', 'OAuth2'],
        description: '集成类型',
      },
      purpose: { type: 'string', description: '集成用途描述' },
      isCriticalPath: { type: 'boolean', description: '是否在关键业务路径上' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['steps', 'circuitBreakerConfig', 'monitoringMetrics', 'envTemplate'],
  },

  async execute(input: SkillInput<ThirdPartyIntegrationInput>): Promise<SkillOutput<ThirdPartyIntegrationOutput>> {
    const startTime = Date.now();
    const {
      serviceName,
      integrationType = 'REST',
      isCriticalPath = false,
    } = input.data;

    const SERVICE_CONST = serviceName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    const steps: IntegrationStep[] = [
      {
        index: 1,
        title: '获取接口文档（版本号锁定）',
        description:
          '在开始集成前，必须获取并锁定 API 版本，避免第三方 API 变更导致无感知的破坏性变更。',
        checkPoints: [
          '获取官方 API 文档（OpenAPI / Swagger / Postman Collection）',
          '明确使用的 API 版本号，记录在 package.json 注释或 README',
          '订阅第三方的 API 变更通知/Changelog',
          '确认 API 的 Deprecation Policy（多久前通知？）',
          '识别所有需要使用的 Endpoint，评估权限需求',
          '确认 Rate Limit 策略（请求数/时间窗口/超限响应）',
        ],
        codeTemplate: `// 版本锁定注释示例
/**
 * ${serviceName} API Integration
 * API Version: v2.3.1 (locked ${new Date().toISOString().split('T')[0]})
 * Docs: https://docs.${serviceName.toLowerCase()}.com/api/v2
 * Changelog: https://docs.${serviceName.toLowerCase()}.com/changelog
 *
 * IMPORTANT: Before upgrading API version, review changelog for breaking changes
 */
const ${SERVICE_CONST}_API_VERSION = 'v2';
const ${SERVICE_CONST}_BASE_URL = \`https://api.${serviceName.toLowerCase()}.com/\${${SERVICE_CONST}_API_VERSION}\`;`,
        antiPatterns: [
          '❌ 不锁定版本，使用 /latest 端点',
          '❌ 不订阅变更通知，靠测试发现破坏性变更',
        ],
      },
      {
        index: 2,
        title: '沙箱环境验证（所有接口功能测试）',
        description:
          '在沙箱/测试环境验证所有需要用到的 API 功能，发现文档与实现的差异。',
        checkPoints: [
          '申请沙箱/测试环境账号和 API Key',
          '测试所有需要使用的 Endpoint（Happy Path）',
          '测试错误场景（无效参数、权限不足、资源不存在）',
          '测试 Rate Limit 触发时的响应格式',
          '验证 Webhook 的签名验证机制（如适用）',
          '记录实际响应格式（与文档差异点）',
        ],
        codeTemplate: `// 沙箱验证脚本
async function validateSandboxIntegration(): Promise<void> {
  const client = create${serviceName}Client({
    baseUrl: process.env.${SERVICE_CONST}_SANDBOX_URL!,
    apiKey: process.env.${SERVICE_CONST}_SANDBOX_API_KEY!,
  });

  console.log('Testing ${serviceName} API integration...');

  // Happy path
  const result = await client.someEndpoint({ param: 'test' });
  console.assert(result.status === 'success', 'Happy path failed');

  // Error handling
  try {
    await client.someEndpoint({ param: '' });
    throw new Error('Expected error not thrown');
  } catch (e: unknown) {
    const error = e as { code?: string };
    console.assert(error.code === 'INVALID_PARAM', 'Error format mismatch');
  }

  console.log('✓ ${serviceName} sandbox validation passed');
}`,
      },
      {
        index: 3,
        title: '错误码处理（所有异常码有对应处理逻辑）',
        description:
          '第三方 API 的每个错误码都需要明确的处理策略，不能用 catch-all 吞掉异常。',
        checkPoints: [
          '枚举所有可能的错误码（查文档 + 沙箱测试发现的实际错误）',
          '4xx：客户端错误（参数错误、权限不足、资源不存在）→ 不重试，向上传递',
          '429：Rate Limit → 使用 Retry-After header，指数退避重试',
          '5xx：服务端错误 → 重试（有上限），触发 Circuit Breaker',
          '网络超时/连接错误 → 重试，触发 Circuit Breaker',
          '错误信息包含 requestId，便于联系第三方排查',
        ],
        codeTemplate: `// 错误处理枚举和处理器
enum ${serviceName}ErrorCode {
  INVALID_PARAM = 'INVALID_PARAM',
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
}

async function handle${serviceName}Error(
  error: unknown,
  context: { requestId?: string; endpoint: string }
): Promise<never> {
  const e = error as { code?: string; message?: string; retryAfter?: number };

  logger.error({
    service: '${serviceName}',
    endpoint: context.endpoint,
    requestId: context.requestId,
    errorCode: e.code,
    message: e.message,
  });

  switch (e.code) {
    case ${serviceName}ErrorCode.RATE_LIMITED:
      throw new RateLimitError(\`${serviceName} rate limited, retry after \${e.retryAfter}s\`);
    case ${serviceName}ErrorCode.UNAUTHORIZED:
      throw new AuthError('${serviceName} authentication failed - check API key');
    case ${serviceName}ErrorCode.SERVER_ERROR:
      throw new ExternalServiceError(\`${serviceName} server error: \${e.message}\`);
    default:
      throw new ExternalServiceError(\`${serviceName} error [\${e.code}]: \${e.message}\`);
  }
}`,
        antiPatterns: [
          '❌ catch (e) { console.error(e); } // 吞掉错误，上层无感知',
          '❌ 对所有错误无差别重试（4xx 不应该重试）',
        ],
      },
      {
        index: 4,
        title: '幂等性设计（重试不产生副作用）',
        description:
          '网络不可靠，重试是必然的。幂等性确保重试不会产生重复操作（如重复扣款、重复发邮件）。',
        checkPoints: [
          '查阅文档：哪些 Endpoint 支持幂等性？使用什么机制（Idempotency-Key header）？',
          '写操作（POST/PATCH）必须带 Idempotency-Key',
          'Idempotency-Key 基于业务 ID 生成（不用随机 UUID，要可重现）',
          '本地记录已提交的 Idempotency-Key，避免重复请求',
          '测试：相同 Idempotency-Key 重复调用，结果应一致',
          '不支持幂等的 Endpoint：使用本地状态机确保只调用一次',
        ],
        codeTemplate: `// 幂等性请求包装
function generateIdempotencyKey(businessId: string, operation: string): string {
  // 基于业务 ID 和操作类型生成确定性 key
  return \`\${operation}:\${businessId}:\${new Date().toISOString().split('T')[0]}\`;
}

async function idempotentApiCall<T>(
  businessId: string,
  operation: string,
  apiCall: (idempotencyKey: string) => Promise<T>
): Promise<T> {
  const idempotencyKey = generateIdempotencyKey(businessId, operation);

  // 检查本地缓存，避免重复调用
  const cached = await idempotencyCache.get(idempotencyKey);
  if (cached) {
    logger.info('Idempotency cache hit', { idempotencyKey });
    return cached as T;
  }

  const result = await apiCall(idempotencyKey);
  await idempotencyCache.set(idempotencyKey, result, { ttl: 86400 }); // 24h
  return result;
}`,
      },
      {
        index: 5,
        title: '超时和降级（Circuit Breaker 配置）',
        description:
          '第三方服务不可用时，不能让自己的服务也跟着崩溃。Circuit Breaker 是保护机制。',
        checkPoints: [
          '设置连接超时（通常 5s）和读取超时（根据 API SLA 设置）',
          '配置 Circuit Breaker：失败阈值、半开状态、恢复时间',
          '降级策略：Circuit Open 时返回什么？（缓存值/默认值/错误提示）',
          `降级是否影响核心功能？${isCriticalPath ? '（关键路径！必须有降级方案）' : '（非关键路径，可返回空结果）'}`,
          '测试 Circuit Breaker 生效（模拟第三方超时）',
          '监控 Circuit Breaker 状态变化',
        ],
        codeTemplate: `// Circuit Breaker 配置（使用 opossum 或类似库）
import CircuitBreaker from 'opossum';

const ${serviceName.toLowerCase()}CircuitBreaker = new CircuitBreaker(
  async (params: unknown) => await ${serviceName.toLowerCase()}ApiCall(params),
  {
    timeout: ${isCriticalPath ? 3000 : 10000},        // ms，请求超时
    errorThresholdPercentage: 50,  // 错误率超过 50% 触发断路
    resetTimeout: 30000,           // 30s 后尝试半开状态
    volumeThreshold: 5,            // 最少 5 次请求才统计错误率
  }
);

${serviceName.toLowerCase()}CircuitBreaker.fallback(() => {
  logger.warn('${serviceName} circuit open, using fallback');
  return ${isCriticalPath ? 'null /* 关键路径：需要业务层处理 null */' : '{ data: [], fromCache: true }'};
});

${serviceName.toLowerCase()}CircuitBreaker.on('open', () =>
  metrics.increment('circuit_breaker.opened', { service: '${serviceName}' })
);`,
      },
      {
        index: 6,
        title: '凭证管理（放 .env，不入 git）',
        description:
          '第三方 API 凭证是高价值攻击目标，绝不能进入代码仓库。',
        checkPoints: [
          '所有凭证（API Key/Secret/Token）存储在环境变量中',
          '.gitignore 包含 .env 文件',
          '.env.example 有所有变量的占位符和注释说明（无真实值）',
          '生产环境凭证使用 Secrets Manager（AWS/GCP/Vault）而非直接的环境变量',
          '凭证最小权限原则：只申请必要的权限 Scope',
          '凭证轮换策略：多久更换一次？过期提醒机制？',
          '泄露响应计划：如果凭证泄露，如何快速撤销？',
        ],
        codeTemplate: `// .env.example 模板
# ${serviceName} Integration
# 申请地址: https://dashboard.${serviceName.toLowerCase()}.com/api-keys
${SERVICE_CONST}_API_KEY=your-api-key-here
${SERVICE_CONST}_API_SECRET=your-api-secret-here
${SERVICE_CONST}_SANDBOX_URL=https://sandbox.${serviceName.toLowerCase()}.com/api/v2
${SERVICE_CONST}_PRODUCTION_URL=https://api.${serviceName.toLowerCase()}.com/api/v2
# Webhook 签名验证密钥（如适用）
${SERVICE_CONST}_WEBHOOK_SECRET=your-webhook-secret-here`,
        antiPatterns: [
          '❌ const API_KEY = "sk-1234abcd..." // 硬编码凭证',
          '❌ git commit -m "add api keys" .env // 提交 .env',
          '❌ 在日志中打印 API Key',
        ],
      },
      {
        index: 7,
        title: '监控接入（调用成功率 / 延迟 / 错误率）',
        description:
          '第三方服务是外部依赖，必须有独立的监控，与内部服务监控隔离，便于快速定位问题来源。',
        checkPoints: [
          '调用成功率：按 Endpoint 分维度监控',
          '响应延迟：P50/P95/P99，与 SLA 对比',
          '错误率：按错误码分类统计',
          'Circuit Breaker 状态：Open/Half-Open/Closed 变化',
          'Rate Limit 使用率：避免超配额',
          '告警：成功率 < 95% 或 P99 > SLA * 2 时触发',
          '定期 Health Check：主动探测第三方服务可用性',
        ],
        codeTemplate: `// 监控包装器
async function monitoredApiCall<T>(
  endpoint: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const labels = { service: '${serviceName}', endpoint };

  try {
    const result = await apiCall();
    const duration = Date.now() - startTime;

    metrics.histogram('third_party.request.duration_ms', duration, labels);
    metrics.increment('third_party.request.success', labels);

    return result;
  } catch (e: unknown) {
    const duration = Date.now() - startTime;
    const error = e as { code?: string };

    metrics.histogram('third_party.request.duration_ms', duration, labels);
    metrics.increment('third_party.request.error', {
      ...labels,
      errorCode: error.code ?? 'UNKNOWN',
    });

    throw e;
  }
}`,
      },
    ];

    const circuitBreakerConfig = {
      service: serviceName,
      timeout: isCriticalPath ? 3000 : 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 5,
      halfOpenSuccessThreshold: 3,
      fallbackStrategy: isCriticalPath ? 'fail-fast' : 'return-default',
    };

    const monitoringMetrics = [
      `third_party.${serviceName.toLowerCase()}.request.total`,
      `third_party.${serviceName.toLowerCase()}.request.success`,
      `third_party.${serviceName.toLowerCase()}.request.error`,
      `third_party.${serviceName.toLowerCase()}.request.duration_ms`,
      `third_party.${serviceName.toLowerCase()}.circuit_breaker.state`,
      `third_party.${serviceName.toLowerCase()}.rate_limit.usage`,
      `third_party.${serviceName.toLowerCase()}.rate_limit.remaining`,
    ];

    const envTemplate = `# ${serviceName} Integration
# 申请地址: https://docs.${serviceName.toLowerCase()}.com/authentication
${SERVICE_CONST}_API_KEY=
${SERVICE_CONST}_API_SECRET=
${SERVICE_CONST}_SANDBOX_URL=https://sandbox-api.${serviceName.toLowerCase()}.com
${SERVICE_CONST}_PRODUCTION_URL=https://api.${serviceName.toLowerCase()}.com
${SERVICE_CONST}_WEBHOOK_SECRET=
${SERVICE_CONST}_TIMEOUT_MS=10000
${SERVICE_CONST}_MAX_RETRIES=3`;

    return {
      success: true,
      data: {
        steps,
        circuitBreakerConfig,
        monitoringMetrics,
        envTemplate,
      },
      duration: Date.now() - startTime,
      logs: [
        `[ThirdPartyIntegration] 服务: ${serviceName}`,
        `[ThirdPartyIntegration] 类型: ${integrationType}`,
        `[ThirdPartyIntegration] 关键路径: ${isCriticalPath}`,
        `[ThirdPartyIntegration] 生成 ${steps.length} 步集成流程`,
      ],
    };
  },
};
