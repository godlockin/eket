/**
 * HTTP Hook Server Module
 *
 * 常驻 HTTP 服务器，接收 Agent Hook 事件通知。
 *
 * 核心职责：
 * - 接收 28 种 Agent 生命周期事件（PreToolUse, PostToolUse, TeammateIdle, TaskCompleted 等）
 * - 权限决策：在 PreToolUse 时审批敏感操作
 * - 任务调度：在 TeammateIdle 时分配新任务
 * - 工作流编排：在 TaskCompleted 时触发下游 Agent
 * - 审计日志：记录所有工具调用和结果
 *
 * 端点：
 * - POST /hooks/pre-tool-use
 * - POST /hooks/post-tool-use
 * - POST /hooks/teammate-idle
 * - POST /hooks/task-completed
 * - POST /hooks/permission-request
 * - GET /health
 *
 * @module HttpHookServer
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';
import * as zlib from 'zlib';

// ============================================================================
// JWT 工具函数
// ============================================================================

/**
 * JWT Payload 结构
 */
export interface JWTPayload {
  /** 用户/Agent ID */
  sub: string;
  /** 发行时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
  /** 发行者 */
  iss?: string;
  /** 角色 */
  role?: string;
}

/**
 * Base64Url 编码
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64Url 解码
 */
function base64UrlDecode(str: string): Buffer {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64 + padding, 'base64');
}

/**
 * 生成 JWT Token
 */
export function generateJWT(payload: JWTPayload, secret: string, expiresIn?: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: expiresIn ? now + expiresIn : undefined,
  };

  const headerEncoded = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('hex');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * 验证 JWT Token
 */
export function verifyJWT(
  token: string,
  secret: string
): { valid: boolean; payload?: JWTPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' };
    }

    const [headerEncoded, payloadEncoded, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest('hex');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid JWT signature' };
    }

    const payload = JSON.parse(base64UrlDecode(payloadEncoded).toString('utf-8')) as JWTPayload;

    // 检查过期时间
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'JWT has expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: `JWT verification failed: ${(error as Error).message}` };
  }
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Hook 事件类型（28 种）
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'Setup'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'InstructionsLoaded'
  | 'CwdChanged'
  | 'FileChanged';

/**
 * 需要脱敏的敏感字段名（不区分大小写）
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'secret',
  'apikey',
  'api_key',
  'api-key',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'auth',
  'authorization',
  'credential',
  'credentials',
  'private_key',
  'privateKey',
  'signing_key',
  'signingKey',
];

/**
 * 脱敏函数：递归检测并替换敏感字段值
 * 将敏感字段值替换为 '[REDACTED]'
 *
 * @param obj - 需要脱敏的对象
 * @returns 脱敏后的新对象
 */
function redactSensitiveFields<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field));

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveFields(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * HTTP Hook 请求体
 */
export interface HttpHookPayload {
  event: HookEvent;
  sessionId: string;
  agentName?: string;
  teamName?: string;
  data: {
    // PreToolUse / PostToolUse 数据
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolResult?: unknown;
    toolError?: string;
    toolUseId?: string;
    durationMs?: number;

    // TeammateIdle 数据
    idleReason?: 'available' | 'interrupted' | 'failed';
    completedTaskId?: string;
    completedStatus?: 'resolved' | 'blocked' | 'failed';
    failureReason?: string;

    // TaskCompleted 数据
    taskId?: string;
    taskStatus?: string;

    // PermissionRequest 数据
    permissionTool?: string;
    permissionDescription?: string;
  };
}

/**
 * HTTP Hook 响应
 */
export interface HttpHookResponse {
  /** 'allow'：允许继续（默认）；'deny'：拒绝操作 */
  action?: 'allow' | 'deny';
  /** 拒绝时的原因（显示给 LLM） */
  reason?: string;
  /** 允许时，修改后的工具输入 */
  updatedInput?: Record<string, unknown>;
  /** 额外的反馈信息（注入 LLM context） */
  feedback?: string;
}

/**
 * 事件处理器接口
 */
export type HookEventHandler = (payload: HttpHookPayload) => Promise<HttpHookResponse | void>;

/**
 * HTTP Hook Server 配置
 */
export interface HttpHookServerConfig {
  port: number;
  host?: string;
  /** 预共享密钥（用于认证） */
  secret?: string;
  /** 允许的 CORS 源列表（生产环境必须配置） */
  allowedOrigins?: string[];
  /** 速率限制配置 */
  rateLimit?: {
    /** 时间窗口（毫秒） */
    windowMs: number;
    /** 每个 IP 在窗口期内的最大请求数 */
    maxRequests: number;
  };
  /** JWT 配置（可选） */
  jwt?: {
    /** JWT 密钥（如果提供，则启用 JWT 认证） */
    secret: string;
    /** issuer */
    issuer?: string;
    /** 令牌过期时间（秒） */
    expiresIn?: number;
  };
  /** 生产环境强制认证（默认 true） */
  requireAuth?: boolean;
}

// ============================================================================
// HTTP Hook Server
// ============================================================================

export class HttpHookServer {
  private server: http.Server | null = null;
  private handlers: Map<HookEvent, HookEventHandler[]> = new Map();
  private config: HttpHookServerConfig;
  /** 速率限制：IP -> { 请求时间戳列表 } */
  private rateLimitMap: Map<string, number[]> = new Map();
  /** 速率限制清理定时器 */
  private rateLimitCleanupInterval: NodeJS.Timeout | null = null;
  /** 服务器启动时间 */
  private startTime: number = Date.now();
  /** Redis 客户端引用（用于健康检查） */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private redisClientInstance: import('../core/redis-client.js').RedisClient | null = null;
  /** 跟踪所有活动连接（用于强制关闭） */
  private connections: Set<import('net').Socket> = new Set();

  constructor(config: HttpHookServerConfig) {
    this.config = config;
  }

  /**
   * 注册事件处理器
   */
  on(event: HookEvent, handler: HookEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 生产环境强制认证检查
      const isProduction = process.env.NODE_ENV === 'production';
      const requireAuth = this.config.requireAuth ?? isProduction;

      if (requireAuth) {
        const hasSecret =
          !!this.config.secret || !!this.config.jwt?.secret || !!process.env.EKET_HOOK_SECRET;
        if (!hasSecret) {
          const error = new Error(
            'Production mode requires authentication. ' +
              'Set EKET_HOOK_SECRET or EKET_HOOK_JWT_SECRET environment variable, ' +
              'or configure secret/jwt in HttpHookServerConfig.'
          );
          reject(error);
          return;
        }
      }

      this.server = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      // HTTP Keep-Alive 配置：优化连接复用
      // keepAliveTimeout: 保持连接的超时时间（默认 65 秒）
      // headersTimeout: 等待请求头的超时时间（必须大于 keepAliveTimeout）
      this.server.keepAliveTimeout = 65000;
      this.server.headersTimeout = 66000;

      // Socket 超时配置：30 秒无活动则关闭
      this.server.timeout = 30000;

      // 跟踪所有连接，以便在停止时强制关闭
      this.server.on('connection', (socket) => {
        this.connections.add(socket);
        socket.on('close', () => {
          this.connections.delete(socket);
        });
      });

      // 启动速率限制清理定时器（每 60 秒清理一次过期数据）
      if (this.config.rateLimit) {
        this.rateLimitCleanupInterval = setInterval(() => {
          this.cleanupRateLimitMap();
        }, 60000);
      }

      this.server.listen(this.config.port, this.config.host || '0.0.0.0', (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(
            `[HTTP Hook Server] Listening on ${this.config.host || '0.0.0.0'}:${this.config.port}`
          );
          resolve();
        }
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // 清理速率限制定时器
      if (this.rateLimitCleanupInterval) {
        clearInterval(this.rateLimitCleanupInterval);
        this.rateLimitCleanupInterval = null;
      }

      // 强制关闭所有活动连接（立即释放端口）
      for (const socket of this.connections) {
        socket.destroy();
      }
      this.connections.clear();

      // 保存服务器引用，然后立即置空（防止重复调用）
      const serverToClose = this.server;
      this.server = null;

      // 关闭服务器
      serverToClose.close((err) => {
        if (err) {
          // 即使有错误也 resolve，确保测试可以继续
          console.warn('[HTTP Hook Server] Stop error (ignored):', err.message);
        } else {
          console.log('[HTTP Hook Server] Stopped');
        }
        resolve();
      });
    });
  }

  /**
   * 设置 CORS 头（限制允许的源）
   */
  private setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
    const allowedOrigins = this.config.allowedOrigins;
    const requestOrigin = req.headers.origin;

    if (allowedOrigins && allowedOrigins.length > 0) {
      // 配置了允许的源列表
      if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      }
      // 如果没有 origin 头或者是允许的源，不设置 CORS 头（同源访问）
    } else {
      // 未配置 allowedOrigins 时，保持原有行为（允许所有）
      // 但在生产环境强烈建议配置 allowedOrigins
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    this.setCorsHeaders(req, res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check with dependency status
    if (pathname && pathname === '/health' && req.method === 'GET') {
      const health = await this.getHealthStatus();
      const statusCode = health.healthy ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
      return;
    }

    // Hook endpoints
    if (pathname && pathname.startsWith('/hooks/') && req.method === 'POST') {
      // Rate limiting check
      if (this.config.rateLimit) {
        const rateLimitResult = this.checkRateLimit(req);
        if (!rateLimitResult.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Too many requests', retryAfter: rateLimitResult.retryAfter })
          );
          return;
        }
      }

      const event = this.pathToEvent(pathname);
      if (!event) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown hook endpoint' }));
        return;
      }

      try {
        const body = await this.readBody(req);
        const payload = JSON.parse(body) as HttpHookPayload;

        // 认证检查：支持 Bearer Token（PSK 或 JWT）
        const authResult = this.authenticate(req);
        if (!authResult.authenticated) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: authResult.error || 'Unauthorized' }));
          return;
        }

        // Process the hook
        const response = await this.processHook(event, payload);

        // Gzip 响应压缩：检测 Accept-Encoding 头
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const bodyJson = JSON.stringify(response);

        if (acceptEncoding.includes('gzip')) {
          zlib.gzip(bodyJson, (err, compressed) => {
            if (err) {
              console.error('[HTTP Hook Server] Gzip error:', err);
              // Fallback to uncompressed
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(bodyJson);
            } else {
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
              });
              res.end(compressed);
            }
          });
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(bodyJson);
        }
      } catch (error) {
        console.error('[HTTP Hook Server] Request error:', error);

        // 处理请求体过大错误
        if (error instanceof Error && error.message === 'Payload too large') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large', maxsize: '1MB' }));
          return;
        }

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'Internal server error', message: (error as Error).message })
        );
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * 定时安全比较（防止时序攻击）
   */
  private timingSafeCompare(a: string, b: string): boolean {
    const aEncoded = Buffer.from(a, 'utf8');
    const bEncoded = Buffer.from(b, 'utf8');
    const lengthA = aEncoded.length;
    const lengthB = bEncoded.length;
    const maxLen = Math.max(lengthA, lengthB);

    const bufA = Buffer.alloc(maxLen, 0);
    const bufB = Buffer.alloc(maxLen, 0);

    aEncoded.copy(bufA);
    bEncoded.copy(bufB);

    try {
      const result = crypto.timingSafeEqual(bufA, bufB);
      return result && lengthA === lengthB;
    } catch {
      return false;
    }
  }

  /**
   * 认证检查：支持 Bearer Token（PSK 或 JWT）
   * 生产环境强制认证：无 secret 时拒绝启动
   */
  private authenticate(req: http.IncomingMessage): {
    authenticated: boolean;
    error?: string;
    userId?: string;
  } {
    const authHeader = req.headers.authorization;

    // 如果没有 Authorization 头
    if (!authHeader) {
      // 默认所有环境都要求认证（除非显式设置 requireAuth: false）
      const requireAuth = this.config.requireAuth ?? true;

      if (requireAuth && !this.config.secret && !this.config.jwt?.secret) {
        // 无密钥配置，拒绝服务并提示配置方式
        console.error(
          '[Security] CRITICAL: Authentication required, but no secret is configured. ' +
            'Set EKET_HOOK_SECRET or EKET_HOOK_JWT_SECRET environment variable.'
        );
        return {
          authenticated: false,
          error: 'Server misconfigured: authentication required but not configured',
        };
      }

      if (requireAuth) {
        return { authenticated: false, error: 'Missing Authorization header' };
      }

      // 仅在显式设置 requireAuth: false 时允许无认证访问（开发调试用）
      console.warn('[Security] WARNING: Hook server running without authentication. Set requireAuth: true in production.');
      return { authenticated: true };
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      return { authenticated: false, error: 'Invalid authorization type. Expected: Bearer' };
    }

    // 1. 优先尝试 JWT 认证（如果配置了 JWT secret）
    if (this.config.jwt?.secret) {
      const jwtResult = verifyJWT(token, this.config.jwt.secret);
      if (jwtResult.valid && jwtResult.payload) {
        // 验证 issuer（如果配置）
        if (this.config.jwt.issuer && jwtResult.payload.iss !== this.config.jwt.issuer) {
          return { authenticated: false, error: 'Invalid JWT issuer' };
        }
        return { authenticated: true, userId: jwtResult.payload.sub };
      }
      // JWT 验证失败，但不立即拒绝，继续尝试 PSK
    }

    // 2. 尝试 PSK（预共享密钥）认证
    if (this.config.secret) {
      if (this.timingSafeCompare(token, this.config.secret)) {
        return { authenticated: true };
      }
    }

    // 3. 尝试从环境变量读取 secret
    const envSecret = process.env.EKET_HOOK_SECRET;
    if (envSecret && this.timingSafeCompare(token, envSecret)) {
      return { authenticated: true };
    }

    return { authenticated: false, error: 'Invalid credentials' };
  }

  /**
   * 检查速率限制
   */
  private checkRateLimit(req: http.IncomingMessage): { allowed: boolean; retryAfter?: number } {
    const clientIp = this.getClientIp(req);
    const now = Date.now();
    const windowMs = this.config.rateLimit!.windowMs;
    const maxRequests = this.config.rateLimit!.maxRequests;

    // 获取该 IP 的请求记录
    const requests = this.rateLimitMap.get(clientIp) || [];

    // 过滤出窗口期内的请求
    const validRequests = requests.filter((timestamp) => now - timestamp < windowMs);

    // 检查是否超出限制
    if (validRequests.length >= maxRequests) {
      // 计算重试等待时间
      const oldestRequest = validRequests[0];
      const retryAfter = Math.ceil((windowMs - (now - oldestRequest)) / 1000);
      return { allowed: false, retryAfter };
    }

    // 记录新请求
    validRequests.push(now);
    this.rateLimitMap.set(clientIp, validRequests);

    return { allowed: true };
  }

  /**
   * 获取客户端 IP
   */
  private getClientIp(req: http.IncomingMessage): string {
    // 检查 X-Forwarded-For 头（反向代理场景）
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor && typeof forwardedFor === 'string') {
      // 取第一个 IP（最外层客户端）
      return forwardedFor.split(',')[0].trim();
    }

    // 检查 X-Real-IP 头
    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      return realIp.trim();
    }

    // 直接连接的 IP
    return req.socket.remoteAddress || '127.0.0.1';
  }

  /**
   * 清理速率限制 Map 中的过期数据
   */
  private cleanupRateLimitMap(): void {
    const now = Date.now();
    const windowMs = this.config.rateLimit?.windowMs || 3600000; // 默认 1 小时

    for (const [ip, requests] of this.rateLimitMap.entries()) {
      const validRequests = requests.filter((timestamp) => now - timestamp < windowMs);
      if (validRequests.length === 0) {
        this.rateLimitMap.delete(ip);
      } else {
        this.rateLimitMap.set(ip, validRequests);
      }
    }
  }

  /**
   * 将路径转换为事件类型
   */
  private pathToEvent(pathname: string): HookEvent | null {
    const mapping: Record<string, HookEvent> = {
      '/hooks/pre-tool-use': 'PreToolUse',
      '/hooks/post-tool-use': 'PostToolUse',
      '/hooks/post-tool-use-failure': 'PostToolUseFailure',
      '/hooks/notification': 'Notification',
      '/hooks/user-prompt-submit': 'UserPromptSubmit',
      '/hooks/session-start': 'SessionStart',
      '/hooks/session-end': 'SessionEnd',
      '/hooks/stop': 'Stop',
      '/hooks/stop-failure': 'StopFailure',
      '/hooks/subagent-start': 'SubagentStart',
      '/hooks/subagent-stop': 'SubagentStop',
      '/hooks/pre-compact': 'PreCompact',
      '/hooks/post-compact': 'PostCompact',
      '/hooks/permission-request': 'PermissionRequest',
      '/hooks/permission-denied': 'PermissionDenied',
      '/hooks/setup': 'Setup',
      '/hooks/teammate-idle': 'TeammateIdle',
      '/hooks/task-created': 'TaskCreated',
      '/hooks/task-completed': 'TaskCompleted',
      '/hooks/elicitation': 'Elicitation',
      '/hooks/elicitation-result': 'ElicitationResult',
      '/hooks/config-change': 'ConfigChange',
      '/hooks/worktree-create': 'WorktreeCreate',
      '/hooks/worktree-remove': 'WorktreeRemove',
      '/hooks/instructions-loaded': 'InstructionsLoaded',
      '/hooks/cwd-changed': 'CwdChanged',
      '/hooks/file-changed': 'FileChanged',
    };
    return mapping[pathname] || null;
  }

  /**
   * 读取请求体（带大小限制）
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      const maxSize = 1024 * 1024; // 1MB

      if (contentLength > maxSize) {
        reject(new Error('Payload too large'));
        return;
      }

      let body = '';
      let receivedLength = 0;

      req.on('data', (chunk) => {
        receivedLength += chunk.length;
        if (receivedLength > maxSize) {
          reject(new Error('Payload too large'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        resolve(body);
      });

      req.on('error', reject);
    });
  }

  /**
   * 处理 Hook 事件
   */
  private async processHook(event: HookEvent, payload: HttpHookPayload): Promise<HttpHookResponse> {
    const handlers = this.handlers.get(event) || [];

    // 默认响应：允许继续
    let combinedResponse: HttpHookResponse = { action: 'allow' };

    // 按顺序执行所有处理器
    for (const handler of handlers) {
      try {
        const response = await handler(payload);
        if (response) {
          // 合并响应（deny 优先）
          if (response.action === 'deny') {
            combinedResponse = response;
            break;
          }
          if (response.updatedInput) {
            combinedResponse.updatedInput = response.updatedInput;
          }
          if (response.feedback) {
            combinedResponse.feedback = response.feedback;
          }
        }
      } catch (error) {
        console.error(`[HTTP Hook Server] Handler error for ${event}:`, error);
        // 处理器错误时，默认允许继续（容错模式）
      }
    }

    return combinedResponse;
  }

  /**
   * 获取健康状态（增强版）
   */
  private async getHealthStatus(): Promise<{
    healthy: boolean;
    timestamp: string;
    uptime: { seconds: number; formatted: string };
    memory: { heapUsed: string; heapTotal: string; usagePercent: string; rss: string };
    checks: {
      redis: { healthy: boolean; message: string; latency?: string };
      sqlite: { healthy: boolean; message: string; latency?: string };
    };
  }> {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    // 检查 Redis
    const redisCheck = await this.checkRedis();
    // 检查 SQLite
    const sqliteCheck = await this.checkSqlite();

    const healthy = redisCheck.healthy && sqliteCheck.healthy;

    return {
      healthy,
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptimeSeconds,
        formatted: this.formatUptime(uptimeSeconds),
      },
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        usagePercent: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      },
      checks: {
        redis: redisCheck,
        sqlite: sqliteCheck,
      },
    };
  }

  /**
   * 检查 Redis 连接
   */
  private async checkRedis(): Promise<{ healthy: boolean; message: string; latency?: string }> {
    // 如果已注入客户端，使用它
    if (this.redisClientInstance) {
      try {
        const start = Date.now();
        await this.redisClientInstance.ping();
        return {
          healthy: true,
          message: 'Redis 连接正常',
          latency: `${Date.now() - start}ms`,
        };
      } catch (error) {
        return {
          healthy: false,
          message: `Redis 连接失败：${(error as Error).message}`,
        };
      }
    }

    // 否则尝试创建临时客户端
    try {
      const { createRedisClient } = await import('../core/redis-client.js');
      const client = createRedisClient();
      const start = Date.now();
      const result = await client.connect();

      if (!result.success) {
        await client.disconnect();
        return { healthy: false, message: `Redis 连接失败：${result.error?.message}` };
      }

      await client.ping();
      await client.disconnect();

      return {
        healthy: true,
        message: 'Redis 连接正常',
        latency: `${Date.now() - start}ms`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Redis 检查异常：${(error as Error).message}`,
      };
    }
  }

  /**
   * 检查 SQLite 连接
   */
  private async checkSqlite(): Promise<{ healthy: boolean; message: string; latency?: string }> {
    try {
      const { createSQLiteManager } = await import('../core/sqlite-manager.js');
      const manager = await createSQLiteManager({ useWorker: false });
      const start = Date.now();

      const result = await manager.connect();
      if (!result.success) {
        return { healthy: false, message: `SQLite 连接失败：${result.error?.message}` };
      }

      // 简单查询测试
      await manager.execute('SELECT 1');
      await manager.close();

      return {
        healthy: true,
        message: 'SQLite 连接正常',
        latency: `${Date.now() - start}ms`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `SQLite 检查异常：${(error as Error).message}`,
      };
    }
  }

  /**
   * 格式化运行时间
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * 设置 Redis 客户端（用于健康检查）
   */
  setRedisClient(client: import('../core/redis-client.js').RedisClient | null): void {
    this.redisClientInstance = client;
  }

  /**
   * 设置 SQLite 客户端（用于健康检查）
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSqliteClient(_client: import('../core/sqlite-client.js').SQLiteClient | null): void {
    // Reserved for future use
  }
}

// ============================================================================
// 预定义处理器工厂
// ============================================================================

/**
 * 任务调度器：在 TeammateIdle 时分配新任务
 */
export function createTaskSchedulerHandler(
  assignTask: (
    agentName: string
  ) => Promise<{ taskId: string; subject: string; description: string } | null>
): HookEventHandler {
  return async (payload) => {
    if (payload.event !== 'TeammateIdle') {
      return { action: 'allow' };
    }

    const { agentName, data } = payload;
    if (!agentName) {
      return { action: 'allow' };
    }

    // 检查 Agent 是否真的空闲
    if (data.idleReason !== 'available') {
      return { action: 'allow' };
    }

    // 分配新任务
    const task = await assignTask(agentName);
    if (task) {
      console.log(`[Task Scheduler] Assigned task ${task.taskId} to ${agentName}`);
      return {
        action: 'allow',
        feedback: `New task assigned: ${task.subject}`,
      };
    }

    return { action: 'allow' };
  };
}

/**
 * 权限检查器：在 PreToolUse 时检查敏感操作
 */
export function createPermissionCheckerHandler(
  checkPermission: (
    toolName: string,
    input: Record<string, unknown>
  ) => Promise<{ approved: boolean; reason?: string }>
): HookEventHandler {
  return async (payload) => {
    if (payload.event !== 'PreToolUse') {
      return { action: 'allow' };
    }

    const { toolName, toolInput } = payload.data;
    if (!toolName || !toolInput) {
      return { action: 'allow' };
    }

    // 检查权限
    const result = await checkPermission(toolName, toolInput);
    if (!result.approved) {
      return {
        action: 'deny',
        reason: result.reason || 'Permission denied',
      };
    }

    return { action: 'allow' };
  };
}

/**
 * 审计日志器：记录所有工具调用
 * 自动脱敏敏感字段（password, secret, token, apiKey 等）
 */
export function createAuditLoggerHandler(
  logAudit: (event: string, details: Record<string, unknown>) => Promise<void>
): HookEventHandler {
  return async (payload) => {
    const eventsToLog: HookEvent[] = [
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PermissionRequest',
    ];

    if (!eventsToLog.includes(payload.event)) {
      return { action: 'allow' };
    }

    try {
      // 脱敏敏感字段后记录审计日志
      await logAudit(payload.event, {
        sessionId: payload.sessionId,
        agentName: payload.agentName,
        teamName: payload.teamName,
        // 脱敏 toolInput 和 toolResult
        toolInput: payload.data.toolInput
          ? redactSensitiveFields(payload.data.toolInput)
          : undefined,
        toolResult:
          payload.data.toolResult !== undefined
            ? redactSensitiveFields(payload.data.toolResult as Record<string, unknown>)
            : undefined,
        toolName: payload.data.toolName,
        toolError: payload.data.toolError,
        toolUseId: payload.data.toolUseId,
        durationMs: payload.data.durationMs,
        idleReason: payload.data.idleReason,
        completedTaskId: payload.data.completedTaskId,
        completedStatus: payload.data.completedStatus,
        failureReason: payload.data.failureReason,
        taskId: payload.data.taskId,
        taskStatus: payload.data.taskStatus,
        permissionTool: payload.data.permissionTool,
        permissionDescription: payload.data.permissionDescription,
      });
    } catch (error) {
      console.error('[Audit Logger] Log error:', error);
    }

    return { action: 'allow' };
  };
}

/**
 * 工作流编排器：在 TaskCompleted 时触发下游 Agent
 */
export function createWorkflowOrchestratorHandler(
  triggerDownstream: (completedTaskId: string, result: unknown) => Promise<void>
): HookEventHandler {
  return async (payload) => {
    if (payload.event !== 'TaskCompleted') {
      return { action: 'allow' };
    }

    const { taskId, taskStatus } = payload.data;
    if (!taskId || taskStatus !== 'completed') {
      return { action: 'allow' };
    }

    try {
      await triggerDownstream(taskId, payload.data);
    } catch (error) {
      console.error('[Workflow Orchestrator] Trigger error:', error);
    }

    return { action: 'allow' };
  };
}

// ============================================================================
// 创建服务器工厂函数
// ============================================================================

/**
 * 创建 HTTP Hook 服务器
 */
export function createHttpHookServer(config: HttpHookServerConfig): HttpHookServer {
  return new HttpHookServer(config);
}
