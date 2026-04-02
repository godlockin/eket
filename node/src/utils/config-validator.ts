/**
 * Configuration Validator
 *
 * 验证 OpenCLAW 集成相关配置
 *
 * - Redis 连接配置验证
 * - API Key 配置验证
 * - OpenCLAW 配置验证
 */

import { createRedisClient } from '../core/redis-client.js';
import type { Result } from '../types/index.js';
import { EketErrorClass } from '../types/index.js';

/**
 * OpenCLAW 配置接口
 */
export interface OpenCLAWConfig {
  enabled: boolean;
  mode: 'managed' | 'autonomous';
  gateway: {
    port: number;
    host: string;
    auth: {
      type: 'api_key' | 'oauth2';
      keyEnv: string;
    };
  };
  messageQueue: {
    type: 'redis' | 'rabbitmq' | 'file';
    connection: {
      host: string;
      port: number;
      password?: string;
    };
    channels: {
      taskAssignment: string;
      statusUpdate: string;
      agentLifecycle: string;
    };
  };
  agents: {
    autoSpawn: boolean;
    maxConcurrent: number;
    idleTimeout: number;
  };
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    redis?: {
      configured: boolean;
      reachable: boolean;
    };
    apiKey?: {
      configured: boolean;
      valid: boolean;
    };
    gateway?: {
      portAvailable: boolean;
      hostValid: boolean;
    };
  };
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: OpenCLAWConfig = {
  enabled: false,
  mode: 'autonomous',
  gateway: {
    port: 8080,
    host: 'localhost',
    auth: {
      type: 'api_key',
      keyEnv: 'OPENCLAW_API_KEY',
    },
  },
  messageQueue: {
    type: 'redis',
    connection: {
      host: 'localhost',
      port: 6379,
    },
    channels: {
      taskAssignment: 'openclaw:tasks:assign',
      statusUpdate: 'openclaw:tasks:status',
      agentLifecycle: 'openclaw:agents:lifecycle',
    },
  },
  agents: {
    autoSpawn: true,
    maxConcurrent: 5,
    idleTimeout: 3600,
  },
};

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): OpenCLAWConfig {
  const config: OpenCLAWConfig = {
    ...DEFAULT_CONFIG,
    enabled: process.env.EKET_OPENCLAW_ENABLED === 'true',
    mode: (process.env.EKET_OPENCLAW_MODE as 'managed' | 'autonomous') || 'autonomous',
    gateway: {
      ...DEFAULT_CONFIG.gateway,
      port: parseInt(process.env.EKET_OPENCLAW_GATEWAY_PORT || '8080', 10),
      host: process.env.EKET_OPENCLAW_GATEWAY_HOST || 'localhost',
      auth: {
        type: (process.env.EKET_OPENCLAW_AUTH_TYPE as 'api_key' | 'oauth2') || 'api_key',
        keyEnv: process.env.EKET_OPENCLAW_API_KEY_ENV || 'OPENCLAW_API_KEY',
      },
    },
    messageQueue: {
      ...DEFAULT_CONFIG.messageQueue,
      type: (process.env.EKET_OPENCLAW_MQ_TYPE as 'redis' | 'rabbitmq' | 'file') || 'redis',
      connection: {
        host: process.env.EKET_OPENCLAW_MQ_HOST || 'localhost',
        port: parseInt(process.env.EKET_OPENCLAW_MQ_PORT || '6379', 10),
        password: process.env.EKET_OPENCLAW_MQ_PASSWORD,
      },
    },
    agents: {
      autoSpawn: process.env.EKET_OPENCLAW_AUTO_SPAWN !== 'false',
      maxConcurrent: parseInt(process.env.EKET_OPENCLAW_MAX_CONCURRENT || '5', 10),
      idleTimeout: parseInt(process.env.EKET_OPENCLAW_IDLE_TIMEOUT || '3600', 10),
    },
  };

  return config;
}

/**
 * 验证 Redis 连接配置
 */
export async function validateRedisConfig(
  host: string,
  port: number,
  password?: string
): Promise<Result<{ configured: boolean; reachable: boolean }>> {
  try {
    // 使用环境变量临时覆盖配置
    const originalHost = process.env.EKET_REDIS_HOST;
    const originalPort = process.env.EKET_REDIS_PORT;
    const originalPassword = process.env.EKET_REDIS_PASSWORD;

    process.env.EKET_REDIS_HOST = host;
    process.env.EKET_REDIS_PORT = String(port);
    if (password) {
      process.env.EKET_REDIS_PASSWORD = password;
    }

    const redisClient = createRedisClient();
    const connectResult = await redisClient.connect();

    // 恢复原始配置
    if (originalHost) {
      process.env.EKET_REDIS_HOST = originalHost;
    }
    if (originalPort) {
      process.env.EKET_REDIS_PORT = originalPort;
    }
    if (originalPassword) {
      process.env.EKET_REDIS_PASSWORD = originalPassword;
    }

    if (connectResult.success) {
      await redisClient.disconnect();
      return {
        success: true,
        data: {
          configured: true,
          reachable: true,
        },
      };
    }

    return {
      success: true,
      data: {
        configured: true,
        reachable: false,
      },
    };
  } catch {
    return {
      success: true,
      data: {
        configured: false,
        reachable: false,
      },
    };
  }
}

/**
 * 验证 API Key 配置
 */
export function validateApiKeyConfig(keyEnv: string): {
  configured: boolean;
  valid: boolean;
} {
  const apiKey = process.env[keyEnv];

  if (!apiKey) {
    return {
      configured: false,
      valid: false,
    };
  }

  // 验证 API Key 格式（至少 8 个字符）
  if (apiKey.length < 8) {
    return {
      configured: true,
      valid: false,
    };
  }

  return {
    configured: true,
    valid: true,
  };
}

/**
 * 验证端口是否可用
 */
export async function validatePortAvailability(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const http = require('http');
    const server = http.createServer();

    server.on('error', () => {
      resolve(false);
    });

    server.listen(port, host, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

/**
 * 验证 IP 地址格式
 */
export function validateHost(host: string): boolean {
  // 简单的 IP 地址或 localhost 验证
  if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1') {
    return true;
  }

  // IPv4 地址验证
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(host)) {
    const parts = host.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // 简化的域名验证
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/;
  return domainRegex.test(host);
}

/**
 * 完整配置验证
 */
export async function validateOpenCLAWConfig(
  config?: Partial<OpenCLAWConfig>
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: ValidationResult['details'] = {};

  // 合并配置
  const finalConfig: OpenCLAWConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // 1. 验证 Redis 配置
  const redisResult = await validateRedisConfig(
    finalConfig.messageQueue.connection.host,
    finalConfig.messageQueue.connection.port,
    finalConfig.messageQueue.connection.password
  );

  details.redis = redisResult.success ? redisResult.data : { configured: false, reachable: false };

  if (!details.redis.configured) {
    errors.push('Redis not configured: Message queue will not work');
  } else if (!details.redis.reachable) {
    warnings.push('Redis configured but not reachable');
  }

  // 2. 验证 API Key 配置
  const apiKeyResult = validateApiKeyConfig(finalConfig.gateway.auth.keyEnv);
  details.apiKey = apiKeyResult;

  if (!apiKeyResult.configured) {
    errors.push(
      `API Key not configured: Missing environment variable ${finalConfig.gateway.auth.keyEnv}`
    );
  } else if (!apiKeyResult.valid) {
    warnings.push('API Key format may be invalid (too short)');
  }

  // 3. 验证 Gateway 配置
  const portAvailable = await validatePortAvailability(
    finalConfig.gateway.host,
    finalConfig.gateway.port
  );
  const hostValid = validateHost(finalConfig.gateway.host);

  details.gateway = {
    portAvailable,
    hostValid,
  };

  if (!hostValid) {
    errors.push(`Invalid gateway host: ${finalConfig.gateway.host}`);
  }

  if (!portAvailable) {
    errors.push(`Gateway port ${finalConfig.gateway.port} is not available`);
  }

  // 4. 其他验证
  if (finalConfig.agents.maxConcurrent < 1) {
    warnings.push('maxConcurrent should be at least 1');
  }

  if (finalConfig.agents.idleTimeout < 60) {
    warnings.push('idleTimeout should be at least 60 seconds');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    details,
  };
}

/**
 * 便捷函数：验证配置并返回错误信息
 */
export async function validateConfig(
  config?: Partial<OpenCLAWConfig>
): Promise<Result<OpenCLAWConfig>> {
  const validationResult = await validateOpenCLAWConfig(config);

  if (!validationResult.valid) {
    return {
      success: false,
      error: new EketErrorClass(
        'INVALID_CONFIG',
        `Configuration validation failed:\n${validationResult.errors.join('\n')}`
      ),
    };
  }

  // 返回带有警告的配置
  const configToReturn: OpenCLAWConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  if (validationResult.warnings.length > 0) {
    console.warn('[ConfigValidator] Warnings:');
    validationResult.warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  return {
    success: true,
    data: configToReturn,
  };
}
