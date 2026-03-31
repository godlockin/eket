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

import * as http from 'http';
import * as url from 'url';

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
}

// ============================================================================
// HTTP Hook Server
// ============================================================================

export class HttpHookServer {
  private server: http.Server | null = null;
  private handlers: Map<HookEvent, HookEventHandler[]> = new Map();
  private config: HttpHookServerConfig;

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
      this.server = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.host || '0.0.0.0', (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(`[HTTP Hook Server] Listening on ${this.config.host || '0.0.0.0'}:${this.config.port}`);
          resolve();
        }
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('[HTTP Hook Server] Stopped');
          resolve();
        }
      });
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (pathname && pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
      return;
    }

    // Hook endpoints
    if (pathname && pathname.startsWith('/hooks/') && req.method === 'POST') {
      const event = this.pathToEvent(pathname);
      if (!event) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown hook endpoint' }));
        return;
      }

      try {
        const body = await this.readBody(req);
        const payload = JSON.parse(body) as HttpHookPayload;

        // Verify secret if configured
        if (this.config.secret) {
          const authHeader = req.headers.authorization || '';
          if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== this.config.secret) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
        }

        // Process the hook
        const response = await this.processHook(event, payload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error('[HTTP Hook Server] Request error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', message: (error as Error).message }));
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
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
   * 读取请求体
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
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
}

// ============================================================================
// 预定义处理器工厂
// ============================================================================

/**
 * 任务调度器：在 TeammateIdle 时分配新任务
 */
export function createTaskSchedulerHandler(
  assignTask: (agentName: string) => Promise<{ taskId: string; subject: string; description: string } | null>
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
  checkPermission: (toolName: string, input: Record<string, unknown>) => Promise<{ approved: boolean; reason?: string }>
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
 */
export function createAuditLoggerHandler(
  logAudit: (event: string, details: Record<string, unknown>) => Promise<void>
): HookEventHandler {
  return async (payload) => {
    const eventsToLog: HookEvent[] = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];

    if (!eventsToLog.includes(payload.event)) {
      return { action: 'allow' };
    }

    try {
      await logAudit(payload.event, {
        sessionId: payload.sessionId,
        agentName: payload.agentName,
        teamName: payload.teamName,
        ...payload.data,
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
