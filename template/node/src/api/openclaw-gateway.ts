/**
 * OpenCLAW API Gateway
 *
 * 协议转换层：将 OpenCLAW 的 REST API 请求转换为 EKET 内部协议
 *
 * @module openclaw-gateway
 */

import express, { Express, Request, Response } from 'express';
import { WorkflowRouter } from './routes/workflow.js';
import { TaskRouter } from './routes/task.js';
import { AgentRouter } from './routes/agent.js';
import { MemoryRouter } from './routes/memory.js';
import { authMiddleware } from './middleware/auth.js';

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

    // 认证中间件
    this.app.use(authMiddleware(this.config.apiKey));

    // 路由注册
    this.app.use('/api/v1/workflow', WorkflowRouter);
    this.app.use('/api/v1/task', TaskRouter);
    this.app.use('/api/v1/agent', AgentRouter);
    this.app.use('/api/v1/memory', MemoryRouter);

    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // 错误处理
    this.app.use((err: Error, req: Request, res: Response, next: any) => {
      console.error('[OpenCLAW Gateway] Error:', err);
      res.status(500).json({
        error: 'internal_error',
        message: err.message
      });
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.config.port, this.config.host, () => {
        console.log(`[OpenCLAW Gateway] Server running on http://${this.config.host}:${this.config.port}`);
        console.log(`[OpenCLAW Gateway] API endpoints:`);
        console.log(`  POST/GET /api/v1/workflow - Workflow 管理`);
        console.log(`  POST/GET /api/v1/task     - Task 管理`);
        console.log(`  POST/GET /api/v1/agent    - Agent 管理`);
        console.log(`  GET  /api/v1/memory       - Memory 查询`);
        resolve();
      });

      server.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}
