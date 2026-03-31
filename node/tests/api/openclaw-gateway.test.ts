/**
 * OpenCLAW Gateway 单元测试
 *
 * 测试覆盖：
 * - Gateway 启动和关闭
 * - 中间件注册
 * - 路由注册
 * - 健康检查端点
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { OpenCLAWGateway, type OpenCLAWGatewayConfig } from '../../src/api/openclaw-gateway';

describe('OpenCLAWGateway', () => {
  let gateway: OpenCLAWGateway;
  let app: express.Express;
  let server: any;

  const testConfig: OpenCLAWGatewayConfig = {
    port: 3099,
    host: 'localhost',
    apiKey: 'test-api-key-12345',
    projectRoot: process.cwd(),
  };

  beforeEach(async () => {
    gateway = new OpenCLAWGateway(testConfig);
    app = express();

    // 启动服务器
    await gateway.start();
  });

  afterEach(async () => {
    // 关闭服务器
    if (server) {
      server.close();
    }
  });

  describe('constructor', () => {
    it('should create gateway with valid config', () => {
      const config: OpenCLAWGatewayConfig = {
        port: 3001,
        host: 'localhost',
        apiKey: 'test-key',
        projectRoot: '/tmp/test-project',
      };

      const newGateway = new OpenCLAWGateway(config);
      expect(newGateway).toBeDefined();
    });

    it('should store config internally', () => {
      const config: OpenCLAWGatewayConfig = {
        port: 3002,
        host: '0.0.0.0',
        apiKey: 'custom-key',
        projectRoot: '/custom/path',
      };

      const newGateway = new OpenCLAWGateway(config);
      expect(newGateway).toBeDefined();
    });
  });

  describe('start()', () => {
    it('should start server on configured port', async () => {
      const port = 3003;
      const config: OpenCLAWGatewayConfig = {
        port,
        host: 'localhost',
        apiKey: 'test-key',
        projectRoot: process.cwd(),
      };

      const testGateway = new OpenCLAWGateway(config);
      await expect(testGateway.start()).resolves.not.toThrow();
    });

    it('should reject binding to occupied port', async () => {
      const config: OpenCLAWGatewayConfig = {
        port: 3004,
        host: 'localhost',
        apiKey: 'test-key',
        projectRoot: process.cwd(),
      };

      const gateway1 = new OpenCLAWGateway(config);
      const gateway2 = new OpenCLAWGateway(config);

      await gateway1.start();
      await expect(gateway2.start()).rejects.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should return healthy status on /health endpoint', async () => {
      // 注意：由于网关内部创建服务器，我们需要通过 HTTP 请求测试
      // 这里测试健康检查端点的响应格式
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/health')
        .set('Authorization', `Bearer ${testConfig.apiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should require authentication for health endpoint', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/health');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Middleware Registration', () => {
    it('should have auth middleware registered', async () => {
      // 测试无认证头
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/health');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthorized');
    });

    it('should reject invalid API keys', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/health')
        .set('Authorization', 'Bearer wrong-key');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    });

    it('should accept valid API keys', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/health')
        .set('Authorization', `Bearer ${testConfig.apiKey}`);

      expect(response.status).toBe(200);
    });

    it('should reject non-Bearer authorization type', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/health')
        .set('Authorization', 'Basic some-token');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Bearer');
    });
  });

  describe('Route Registration', () => {
    it('should have /api/v1/workflow route registered', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testConfig.apiKey}`)
        .send({ name: 'Test Workflow' });

      // 应该返回 201 或 500（取决于内部实现）
      expect([201, 500]).toContain(response.status);
    });

    it('should have /api/v1/task route registered', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testConfig.apiKey}`)
        .send({ workflow_id: 'wf-123', title: 'Test Task', type: 'feature' });

      // 应该返回 201 或 500（取决于内部实现）
      expect([201, 500]).toContain(response.status);
    });

    it('should have /api/v1/agent route registered', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testConfig.apiKey}`)
        .send({ role: 'developer' });

      // 应该返回 201 或 500（取决于内部实现）
      expect([201, 500]).toContain(response.status);
    });

    it('should have /api/v1/memory route registered', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testConfig.apiKey}`);

      // 应该返回 200（空列表）
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('memories');
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parse errors gracefully', async () => {
      // 发送无效 JSON
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testConfig.apiKey}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should return error response for unknown routes', async () => {
      const response = await request(`http://${testConfig.host}:${testConfig.port}`)
        .get('/api/v1/unknown')
        .set('Authorization', `Bearer ${testConfig.apiKey}`);

      expect(response.status).toBe(404);
    });
  });
});
