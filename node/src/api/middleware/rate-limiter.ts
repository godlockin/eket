/**
 * 速率限制中间件
 *
 * 防止 API 滥用和 DoS 攻击
 *
 * @module rate-limiter
 */

export interface RateLimiterConfig {
  // 时间窗口（毫秒）
  windowMs: number;
  // 窗口内最大请求数
  maxRequests: number;
  // 错误消息
  message?: string;
  // 是否包含 X-RateLimit-* 响应头
  headers?: boolean;
  // 信任的代理（用于获取真实 IP）
  trustProxy?: boolean;
}

export interface RateLimitInfo {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitInfo> = new Map();
  private config: Required<RateLimiterConfig>;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimiterConfig) {
    this.config = {
      windowMs: config.windowMs || 15 * 60 * 1000, // 默认 15 分钟
      maxRequests: config.maxRequests || 100,
      message: config.message || 'Too many requests, please try again later.',
      headers: config.headers ?? true,
      trustProxy: config.trustProxy ?? false,
    };

    // 定期清理过期数据
    this.startCleanup();
  }

  /**
   * Express 中间件
   */
  middleware() {
    return (req: any, res: any, next: () => void): void => {
      const clientId = this.getClientId(req);
      const info = this.getOrCreateInfo(clientId);
      const now = Date.now();

      // 检查是否需要重置窗口
      if (now > info.resetAt) {
        info.count = 1;
        info.resetAt = now + this.config.windowMs;
      } else {
        info.count++;
      }

      // 添加响应头
      if (this.config.headers) {
        res.setHeader('X-RateLimit-Limit', String(this.config.maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.config.maxRequests - info.count)));
        res.setHeader('X-RateLimit-Reset', String(info.resetAt));
      }

      // 检查是否超限
      if (info.count > this.config.maxRequests) {
        res.status(429).json({
          error: 'rate_limit_exceeded',
          message: this.config.message,
          retryAfter: Math.ceil((info.resetAt - now) / 1000),
        });
        return;
      }

      next();
    };
  }

  /**
   * 获取客户端标识（IP 地址）
   */
  private getClientId(req: any): string {
    // 信任代理的情况下，使用 X-Forwarded-For
    if (this.config.trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
      }
    }

    // 直接使用远程地址
    return req.socket?.remoteAddress || 'unknown';
  }

  /**
   * 获取或创建速率限制信息
   */
  private getOrCreateInfo(clientId: string): RateLimitInfo {
    let info = this.store.get(clientId);

    if (!info) {
      info = {
        count: 0,
        resetAt: Date.now() + this.config.windowMs,
      };
      this.store.set(clientId, info);
    }

    return info;
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    const cleanupIntervalMs = Math.min(this.config.windowMs / 2, 60000); // 最多 1 分钟

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, info] of this.store.entries()) {
        if (now > info.resetAt) {
          this.store.delete(clientId);
        }
      }
    }, cleanupIntervalMs);

    // 防止进程退出时资源泄露
    this.cleanupInterval.unref();
  }

  /**
   * 停止清理定时器
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * 重置特定客户端的速率限制
   */
  reset(clientId: string): boolean {
    return this.store.delete(clientId);
  }

  /**
   * 获取客户端当前速率限制状态
   */
  getStatus(clientId: string): RateLimitInfo | undefined {
    return this.store.get(clientId);
  }
}

/**
 * 创建速率限制器实例
 */
export function createRateLimiter(config?: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config || {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  });
}

/**
 * 预设配置
 */
export const presets = {
  // 严格限制（用于敏感操作）
  strict: {
    windowMs: 60 * 1000,
    maxRequests: 10,
  },
  // 标准限制（用于一般 API）
  standard: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
  },
  // 宽松限制（用于公开 API）
  lenient: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 1000,
  },
} as const;
