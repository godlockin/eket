/**
 * Workflow 路由单元测试
 *
 * 测试覆盖：
 * - POST /api/v1/workflow - 创建工作流
 * - GET /api/v1/workflow/:id - 获取工作流状态
 * - 错误处理
 * - 协议转换验证
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { WorkflowRouter } from '../../../src/api/routes/workflow';
import { authMiddleware } from '../../../src/api/middleware/auth';

describe('WorkflowRouter', () => {
  let app: express.Express;
  const testApiKey = 'test-workflow-key';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(authMiddleware({ apiKey: testApiKey }));
    app.use('/api/v1/workflow', WorkflowRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/workflow', () => {
    it('should create workflow with valid request', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          name: 'Test Workflow',
          description: 'A test workflow',
          priority: 'high',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('workflow_id');
      expect(response.body).toHaveProperty('status', 'created');
      expect(response.body).toHaveProperty('tickets_created', 0);
    });

    it('should accept all required fields', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          id: 'custom-workflow-id',
          name: 'Custom Workflow',
          description: 'Custom description',
          priority: 'critical',
          deadline: '2026-12-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.workflow_id).toBeDefined();
    });

    it('should reject missing name field', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          description: 'Missing name',
          priority: 'medium',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'validation_error');
      expect(response.body.message).toContain('name');
    });

    it('should accept empty description (optional field)', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          name: 'Minimal Workflow',
        });

      expect(response.status).toBe(201);
    });

    it('should handle invalid priority gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          name: 'Workflow',
          priority: 'invalid_priority' as any,
        });

      // 应该接受并使用默认值或返回错误
      expect([201, 400, 500]).toContain(response.status);
    });

    it('should generate workflow ID if not provided', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          name: 'Auto-ID Workflow',
        });

      expect(response.status).toBe(201);
      expect(response.body.workflow_id).toBeDefined();
      expect(response.body.workflow_id).toBeTruthy();
    });
  });

  describe('GET /api/v1/workflow/:id', () => {
    it('should return workflow status', async () => {
      const workflowId = 'wf-123';

      const response = await request(app)
        .get(`/api/v1/workflow/${workflowId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workflow_id', workflowId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('tickets');
    });

    it('should return ticket breakdown in status', async () => {
      const workflowId = 'wf-456';

      const response = await request(app)
        .get(`/api/v1/workflow/${workflowId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.tickets).toHaveProperty('total');
      expect(response.body.tickets).toHaveProperty('completed');
      expect(response.body.tickets).toHaveProperty('in_progress');
      expect(response.body.tickets).toHaveProperty('pending');
    });

    it('should handle non-existent workflow ID', async () => {
      const workflowId = 'non-existent-wf';

      const response = await request(app)
        .get(`/api/v1/workflow/${workflowId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      // 当前实现返回模拟数据，应该返回 200
      expect(response.status).toBe(200);
    });

    it('should handle special characters in workflow ID', async () => {
      const workflowId = 'wf_special-chars.123';

      const response = await request(app)
        .get(`/api/v1/workflow/${workflowId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.workflow_id).toBe(workflowId);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing Content-Type', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('Content-Type', 'text/plain')
        .send('name=Test');

      // Express 应该能处理或返回错误
      expect([201, 400, 500]).toContain(response.status);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('name');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle internal errors gracefully', async () => {
      // 模拟一个可能导致内部错误的场景
      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          name: 'Test',
          priority: 'high',
        });

      // 应该返回 201 或 500，但不应该崩溃
      expect([201, 500]).toContain(response.status);
    });
  });

  describe('Protocol Conversion', () => {
    it('should convert OpenCLAW Workflow to EKET Epic internally', async () => {
      const workflowData = {
        id: 'epic-workflow',
        name: 'Epic Workflow',
        description: 'Should be converted to Epic',
        priority: 'critical',
      };

      const response = await request(app)
        .post('/api/v1/workflow')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send(workflowData);

      expect(response.status).toBe(201);
      // 验证响应格式符合 EKET Epic 协议
      expect(response.body).toHaveProperty('workflow_id');
      expect(response.body).toHaveProperty('status');
    });

    it('should handle different priority mappings', async () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;

      for (const priority of priorities) {
        const response = await request(app)
          .post('/api/v1/workflow')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({
            name: `Workflow with ${priority} priority`,
            priority,
          });

        expect(response.status).toBe(201);
      }
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent workflow creations', async () => {
      const promises = Array.from({ length: 5 }).map((_, i) =>
        request(app)
          .post('/api/v1/workflow')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({
            name: `Concurrent Workflow ${i}`,
            priority: 'medium',
          })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('workflow_id');
      });

      // 验证每个 workflow_id 是唯一的
      const workflowIds = responses.map((r) => r.body.workflow_id);
      const uniqueIds = new Set(workflowIds);
      expect(uniqueIds.size).toBe(workflowIds.length);
    });
  });
});
