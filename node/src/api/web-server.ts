/**
 * EKET Web Dashboard Server
 * Phase 5.1 - Web UI 监控面板
 *
 * 轻量级 HTTP 服务器，提供监控面板 API 和静态文件服务
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type {
  DashboardData,
  DashboardSystemStatus,
  DashboardInstance,
  DashboardTask,
  DashboardStats,
  Result
} from '../types/index.js';
import { EketError } from '../types/index.js';
import { createRedisClient } from '../core/redis-client.js';
import { createSQLiteClient } from '../core/sqlite-client.js';
import { createInstanceRegistry } from '../core/instance-registry.js';

// ES module compatibility
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Web Server 配置
 */
export interface WebServerConfig {
  port: number;
  host: string;
  staticPath: string;
}

/**
 * API 响应类型
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * EKET Web Dashboard Server
 */
export class WebDashboardServer {
  private server: http.Server | null = null;
  private config: WebServerConfig;
  private redisClient: ReturnType<typeof createRedisClient>;
  private sqliteClient: ReturnType<typeof createSQLiteClient>;
  private instanceRegistry: ReturnType<typeof createInstanceRegistry>;

  constructor(config: Partial<WebServerConfig> = {}) {
    // Defensive copy
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      staticPath: config.staticPath || path.resolve(__dirname, '../../../web'),
    };

    this.redisClient = createRedisClient();
    this.sqliteClient = createSQLiteClient();
    this.instanceRegistry = createInstanceRegistry();
  }

  /**
   * 启动服务器
   */
  async start(): Promise<Result<void>> {
    try {
      // 连接 Redis
      const redisResult = await this.redisClient.connect();
      if (!redisResult.success) {
        console.warn('[WebServer] Redis 连接失败，部分功能可能不可用');
      }

      // 连接 SQLite
      const sqliteResult = this.sqliteClient.connect();
      if (!sqliteResult.success) {
        console.warn('[WebServer] SQLite 连接失败，部分功能可能不可用');
      }

      // 连接 Instance Registry
      const registryResult = await this.instanceRegistry.connect();
      if (!registryResult.success) {
        console.warn('[WebServer] Instance Registry 连接失败');
      }

      // 创建 HTTP 服务器
      this.server = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      // 启动监听
      await new Promise<void>((resolve) => {
        this.server!.listen(this.config.port, this.config.host, () => {
          console.log(`[WebServer] Dashboard 启动：http://${this.config.host}:${this.config.port}`);
          resolve();
        });
      });

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('SERVER_START_FAILED', `Failed to start web server: ${errorMessage}`),
      };
    }
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    await this.redisClient.disconnect();
    this.sqliteClient.close();
    await this.instanceRegistry.disconnect();
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (url.startsWith('/api/')) {
      await this.handleApiRequest(req, res);
      return;
    }

    // Static files
    await this.handleStaticFile(req, res);
  }

  /**
   * 处理 API 请求
   */
  private async handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    if (method !== 'GET') {
      this.sendJson(res, 405, { success: false, error: 'Method not allowed', timestamp: Date.now() });
      return;
    }

    try {
      switch (url) {
        case '/api/status':
          await this.handleGetStatus(res);
          break;
        case '/api/instances':
          await this.handleGetInstances(res);
          break;
        case '/api/tasks':
          await this.handleGetTasks(res);
          break;
        case '/api/stats':
          await this.handleGetStats(res);
          break;
        case '/api/dashboard':
          await this.handleGetDashboard(res);
          break;
        default:
          this.sendJson(res, 404, { success: false, error: 'Not found', timestamp: Date.now() });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.sendJson(res, 500, {
        success: false,
        error: errorMessage,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理静态文件请求
   */
  private async handleStaticFile(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let url = req.url === '/' ? '/index.html' : req.url;
    if (!url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    const filePath = path.join(this.config.staticPath, url);

    // Security check: prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(this.config.staticPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      // Set content type based on extension
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };

      res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
      res.writeHead(200);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  /**
   * GET /api/status - 获取系统状态
   */
  private async handleGetStatus(res: http.ServerResponse): Promise<void> {
    const status = await this.getSystemStatus();
    this.sendJson(res, 200, { success: true, data: status, timestamp: Date.now() });
  }

  /**
   * GET /api/instances - 获取所有 Instance
   */
  private async handleGetInstances(res: http.ServerResponse): Promise<void> {
    const result = await this.instanceRegistry.listAllInstances();

    if (result.success) {
      const instances: DashboardInstance[] = result.data.map((inst) => ({
        id: inst.id,
        type: inst.type,
        agent_type: inst.agent_type,
        skills: inst.skills,
        status: inst.status,
        currentTaskId: inst.currentTaskId,
        currentLoad: inst.currentLoad,
        lastHeartbeat: inst.lastHeartbeat,
        updatedAt: inst.updatedAt,
      }));
      this.sendJson(res, 200, { success: true, data: { instances }, timestamp: Date.now() });
    } else {
      this.sendJson(res, 500, {
        success: false,
        error: result.error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * GET /api/tasks - 获取任务列表
   */
  private async handleGetTasks(res: http.ServerResponse): Promise<void> {
    // TODO: 实现任务获取（需要从 Jira 或 SQLite 读取）
    // 暂时返回空数组
    const tasks: DashboardTask[] = [];
    this.sendJson(res, 200, { success: true, data: { tasks }, timestamp: Date.now() });
  }

  /**
   * GET /api/stats - 获取统计数据
   */
  private async handleGetStats(res: http.ServerResponse): Promise<void> {
    const stats = await this.getDashboardStats();
    this.sendJson(res, 200, { success: true, data: stats, timestamp: Date.now() });
  }

  /**
   * GET /api/dashboard - 获取完整仪表盘数据
   */
  private async handleGetDashboard(res: http.ServerResponse): Promise<void> {
    const [systemStatus, instancesResult, tasks, stats] = await Promise.all([
      this.getSystemStatus(),
      this.instanceRegistry.listAllInstances(),
      this.getTasks(),
      this.getDashboardStats(),
    ]);

    const instances: DashboardInstance[] = instancesResult.success
      ? instancesResult.data.map((inst) => ({
          id: inst.id,
          type: inst.type,
          agent_type: inst.agent_type,
          skills: inst.skills,
          status: inst.status,
          currentTaskId: inst.currentTaskId,
          currentLoad: inst.currentLoad,
          lastHeartbeat: inst.lastHeartbeat,
          updatedAt: inst.updatedAt,
        }))
      : [];

    const dashboardData: DashboardData = {
      systemStatus,
      instances,
      tasks,
      stats,
      timestamp: Date.now(),
    };

    this.sendJson(res, 200, { success: true, data: dashboardData, timestamp: Date.now() });
  }

  /**
   * 获取系统状态
   */
  private async getSystemStatus(): Promise<DashboardSystemStatus> {
    const status: DashboardSystemStatus = {
      level: 1,
      description: 'Level 1 (Redis+SQLite)',
      redisConnected: false,
      sqliteConnected: false,
      messageQueueConnected: false,
    };

    // Check Redis
    try {
      const redisResult = await this.redisClient.connect();
      status.redisConnected = redisResult.success;
      if (redisResult.success) {
        status.messageQueueConnected = true;
      }
    } catch {
      status.redisConnected = false;
    }

    // Check SQLite
    try {
      const sqliteResult = this.sqliteClient.connect();
      status.sqliteConnected = sqliteResult.success;
    } catch {
      status.sqliteConnected = false;
    }

    // Determine degradation level
    if (status.redisConnected && status.sqliteConnected) {
      status.level = 1;
      status.description = 'Level 1 (Redis+SQLite)';
    } else if (status.redisConnected) {
      status.level = 2;
      status.description = 'Level 2 (Redis only)';
    } else if (status.sqliteConnected) {
      status.level = 3;
      status.description = 'Level 3 (SQLite only)';
    } else {
      status.level = 5;
      status.description = 'Level 5 (Degraded)';
    }

    return status;
  }

  /**
   * 获取任务列表
   */
  private async getTasks(): Promise<DashboardTask[]> {
    // TODO: 从 Jira 或 SQLite 获取任务
    return [];
  }

  /**
   * 获取仪表盘统计数据
   */
  private async getDashboardStats(): Promise<DashboardStats> {
    const instancesResult = await this.instanceRegistry.listAllInstances();
    const instances = instancesResult.success ? instancesResult.data : [];

    const activeInstances = instances.filter((i) => i.status === 'busy').length;
    const idleInstances = instances.filter((i) => i.status === 'idle').length;
    const offlineInstances = instances.filter((i) => i.status === 'offline').length;

    // TODO: 从数据库获取任务统计
    const totalTasks = 0;
    const inProgressTasks = 0;
    const completedTasksToday = 0;

    return {
      totalInstances: instances.length,
      activeInstances,
      idleInstances,
      offlineInstances,
      totalTasks,
      inProgressTasks,
      completedTasksToday,
      successRate: 100, // 默认 100%
    };
  }

  /**
   * 发送 JSON 响应
   */
  private sendJson<T>(res: http.ServerResponse, statusCode: number, data: ApiResponse<T>): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

/**
 * 创建 Web Dashboard 服务器
 */
export function createWebDashboardServer(config?: Partial<WebServerConfig>): WebDashboardServer {
  return new WebDashboardServer(config);
}
