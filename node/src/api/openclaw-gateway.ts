/**
 * OpenCLAW API Gateway
 *
 * 协议转换层：将 OpenCLAW 的 REST API 请求转换为 EKET 内部协议
 *
 * @module openclaw-gateway
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';

import { authMiddleware } from './middleware/auth.js';
import { AgentRouter } from './routes/agent.js';
import { MemoryRouter } from './routes/memory.js';
import { TaskRouter } from './routes/task.js';
import { WorkflowRouter } from './routes/workflow.js';

export interface OpenCLAWGatewayConfig {
  port: number;
  host: string;
  apiKey: string;
  projectRoot: string;
}

export class OpenCLAWGateway {
  private app: Express;
  private config: OpenCLAWGatewayConfig;

  constructor(config: OpenCLAWGatewayConfig) {
    this.config = config;
    this.app = express();
    this.initialize();
  }

  private initialize(): void {
    // 中间件
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // JSON 解析错误处理 - 放在所有中间件之前
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      if (err instanceof SyntaxError || (err as any).type === 'entity.parse.failed') {
        return res.status(400).json({
          error: 'parse_error',
          message: 'Invalid JSON in request body',
        });
      }
      next(err);
    });

    // 认证中间件
    this.app.use(authMiddleware({ apiKey: this.config.apiKey }));

    // 路由注册
    this.app.use('/api/v1/workflow', WorkflowRouter);
    this.app.use('/api/v1/task', TaskRouter);
    this.app.use('/api/v1/agent', AgentRouter);
    this.app.use('/api/v1/memory', MemoryRouter);

    // 健康检查
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    });

    // 通用错误处理（兜底）
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      console.error('[OpenCLAW Gateway] Error:', err);
      res.status(500).json({
        error: 'internal_error',
        message: err.message,
      });
    });
  }

  private server: any = null;

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 使用 createServer 并设置 reusePort: false 来禁止端口复用
      const httpServer = http.createServer({ reusePort: false }, this.app);
      this.server = httpServer;

      httpServer.listen(this.config.port, this.config.host, () => {
        console.log(
          `[OpenCLAW Gateway] Server running on http://${this.config.host}:${this.config.port}`
        );
        console.log(`[OpenCLAW Gateway] API endpoints:`);
        console.log(`  POST/GET /api/v1/workflow - Workflow 管理`);
        console.log(`  POST/GET /api/v1/task     - Task 管理`);
        console.log(`  POST/GET /api/v1/agent    - Agent 管理`);
        console.log(`  GET  /api/v1/memory       - Memory 查询`);
        resolve();
      });

      httpServer.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve();
      }
      this.server.close((err?: Error) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }
}
