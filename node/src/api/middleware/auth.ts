/**
 * 认证中间件
 *
 * API Key 认证 - 支持静态 Key 和 ApiKeyManager
 *
 * @deprecated 对于生产环境，请使用 ApiKeyManager 获得更安全的认证
 */

import { Request, Response, NextFunction } from 'express';

import type { ApiKeyManager } from './api-key-manager.js';

export interface AuthMiddlewareOptions {
  // 静态 API Key（仅用于开发环境）
  apiKey?: string;
  // ApiKeyManager 实例（推荐用于生产环境）
  apiKeyManager?: ApiKeyManager;
  // 是否要求必须使用环境变量（防止默认 Key）
  requireEnvVar?: boolean;
  // 环境变量名称
  envVarName?: string;
}

/**
 * 创建认证中间件
 *
 * @example
 * // 开发环境（不推荐）
 * app.use(authMiddleware({ apiKey: 'dev-key' }));
 *
 * @example
 * // 生产环境（推荐）
 * const apiKeyManager = createApiKeyManager();
 * app.use(authMiddleware({ apiKeyManager }));
 */
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    // 检查 Authorization 头
    if (!authHeader) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing Authorization header',
      });
      return;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid authorization type. Expected: Bearer',
      });
      return;
    }

    // 如果提供了 ApiKeyManager，使用安全的验证方式
    if (options.apiKeyManager) {
      const result = await options.apiKeyManager.validateKey(token);

      if (!result.valid) {
        const statusCode = result.error === 'revoked' ? 403 : 401;
        res.status(statusCode).json({
          error: result.error === 'revoked' ? 'forbidden' : 'unauthorized',
          message:
            result.error === 'expired'
              ? 'API key has expired'
              : result.error === 'revoked'
                ? 'API key has been revoked'
                : 'Invalid API key',
          errorCode: result.error,
        });
        return;
      }

      // 附加 Key 信息到请求对象（可选）
      (req as Request & { apiKeyInfo?: unknown }).apiKeyInfo = result.keyInfo;
      next();
      return;
    }

    // 回退到静态 Key 验证（仅用于开发）
    if (options.apiKey) {
      // 安全检查：拒绝默认 Key
      const dangerousKeys = ['eket-dev-key', 'dev-key', 'test-key', 'changeme'];
      if (dangerousKeys.includes(options.apiKey)) {
        console.error(
          '[Security] DANGEROUS: Using default API key in production! Set OPENCLAW_API_KEY environment variable.'
        );
      }

      if (token !== options.apiKey) {
        res.status(403).json({
          error: 'forbidden',
          message: 'Invalid API key',
        });
        return;
      }

      next();
      return;
    }

    // 如果要求必须使用环境变量
    if (options.requireEnvVar !== false) {
      const envVarName = options.envVarName || 'OPENCLAW_API_KEY';
      const envApiKey = process.env[envVarName];

      if (!envApiKey) {
        console.error(`[Security] API key not configured. Set ${envVarName} environment variable.`);
        res.status(500).json({
          error: 'misconfigured',
          message: 'API key not configured on server',
        });
        return;
      }

      if (token !== envApiKey) {
        res.status(403).json({
          error: 'forbidden',
          message: 'Invalid API key',
        });
        return;
      }

      next();
      return;
    }

    // 没有配置任何认证方式
    console.error('[Security] No authentication method configured');
    res.status(500).json({
      error: 'misconfigured',
      message: 'Server authentication not properly configured',
    });
  };
}

/**
 * @deprecated 使用 authMiddleware({ apiKey }) 替代
 */
export function legacyAuthMiddleware(apiKey: string) {
  return authMiddleware({ apiKey });
}
