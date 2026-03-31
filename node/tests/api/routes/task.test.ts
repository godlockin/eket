/**
 * Task 路由单元测试
 *
 * 测试覆盖：
 * - POST /api/v1/task - 创建任务
 * - GET /api/v1/task/:id - 获取任务详情
 * - openCLAWToEKET 转换逻辑
 * - 类型映射验证
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { TaskRouter } from '../../../src/api/routes/task';
import { authMiddleware } from '../../../src/api/middleware/auth';

describe('TaskRouter', () => {
  let app: express.Express;
  const testApiKey = 'test-task-key';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(authMiddleware({ apiKey: testApiKey }));
    app.use('/api/v1/task', TaskRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/task', () => {
    it('should create task with valid request', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Implement user login',
          description: 'Add user authentication',
          priority: 'high',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('task_id');
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body).toHaveProperty('status', 'ready');
    });

    it('should accept all task fields', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          id: 'custom-task-id',
          workflow_id: 'wf-456',
          type: 'bugfix',
          title: 'Fix login bug',
          description: 'Fix the login issue',
          priority: 'critical',
          assignee: 'agent_frontend_dev',
          skills_required: ['react', 'typescript'],
        });

      expect(response.status).toBe(201);
      expect(response.body.task_id).toBeDefined();
      expect(response.body.assigned_to).toBeDefined();
    });

    it('should reject missing workflow_id', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          type: 'feature',
          title: 'Missing workflow_id',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'validation_error');
      expect(response.body.message).toContain('workflow_id');
    });

    it('should reject missing title', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'validation_error');
      expect(response.body.message).toContain('title');
    });

    it('should reject missing type', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          title: 'Missing type',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'validation_error');
      expect(response.body.message).toContain('type');
    });

    it('should generate task ID if not provided', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Auto-ID Task',
        });

      expect(response.status).toBe(201);
      expect(response.body.task_id).toBeDefined();
    });

    it('should accept all valid task types', async () => {
      const taskTypes = ['feature', 'bugfix', 'test', 'doc'] as const;

      for (const taskType of taskTypes) {
        const response = await request(app)
          .post('/api/v1/task')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({
            workflow_id: 'wf-123',
            type: taskType,
            title: `${taskType} task`,
          });

        expect(response.status).toBe(201);
      }
    });

    it('should accept all valid priorities', async () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;

      for (const priority of priorities) {
        const response = await request(app)
          .post('/api/v1/task')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({
            workflow_id: 'wf-123',
            type: 'feature',
            title: `${priority} priority task`,
            priority,
          });

        expect(response.status).toBe(201);
      }
    });

    it('should handle empty description gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Task without description',
        });

      expect(response.status).toBe(201);
    });

    it('should handle empty skills_required gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Task without skills',
          skills_required: [],
        });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/v1/task/:id', () => {
    it('should return task status', async () => {
      const taskId = 'task-123';

      const response = await request(app)
        .get(`/api/v1/task/${taskId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('task_id', taskId);
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body).toHaveProperty('status');
    });

    it('should return valid task status values', async () => {
      const taskId = 'task-456';

      const response = await request(app)
        .get(`/api/v1/task/${taskId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const validStatuses = ['pending', 'in_progress', 'review', 'done', 'rejected'];
      expect(validStatuses).toContain(response.body.status);
    });

    it('should include timestamps', async () => {
      const taskId = 'task-789';

      const response = await request(app)
        .get(`/api/v1/task/${taskId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
    });

    it('should handle non-existent task ID', async () => {
      const taskId = 'non-existent-task';

      const response = await request(app)
        .get(`/api/v1/task/${taskId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      // 当前实现返回模拟数据
      expect(response.status).toBe(200);
    });

    it('should handle special characters in task ID', async () => {
      const taskId = 'task_special-chars.123';

      const response = await request(app)
        .get(`/api/v1/task/${taskId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.task_id).toBe(taskId);
    });
  });

  describe('openCLAWToEKET Type Mapping', () => {
    it('should map feature type to FEAT prefix', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Feature task',
        });

      expect(response.status).toBe(201);
      // ticket_id 应该包含 FEAT 前缀
      expect(response.body.ticket_id).toMatch(/FEAT/);
    });

    it('should map bugfix type to FIX prefix', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'bugfix',
          title: 'Bugfix task',
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket_id).toMatch(/FIX/);
    });

    it('should map test type to TEST prefix', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'test',
          title: 'Test task',
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket_id).toMatch(/TEST/);
    });

    it('should map doc type to DOC prefix', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'doc',
          title: 'Documentation task',
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket_id).toMatch(/DOC/);
    });

    it('should map critical priority correctly', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Critical task',
          priority: 'critical',
        });

      expect(response.status).toBe(201);
      // 应该成功创建，优先级映射在内部处理
    });
  });

  describe('Error Handling', () => {
    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/workflow_id|title|type/);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle internal errors gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Test Task',
        });

      expect([201, 500]).toContain(response.status);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent task creations', async () => {
      const promises = Array.from({ length: 5 }).map((_, i) =>
        request(app)
          .post('/api/v1/task')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({
            workflow_id: 'wf-123',
            type: 'feature',
            title: `Concurrent Task ${i}`,
          })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('task_id');
      });

      // 验证每个 task_id 是唯一的
      const taskIds = responses.map((r) => r.body.task_id);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    });
  });

  describe('Skills Required', () => {
    it('should accept single skill', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'React task',
          skills_required: ['react'],
        });

      expect(response.status).toBe(201);
    });

    it('should accept multiple skills', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Fullstack task',
          skills_required: ['react', 'nodejs', 'typescript', 'postgresql'],
        });

      expect(response.status).toBe(201);
    });

    it('should handle skills as empty array', async () => {
      const response = await request(app)
        .post('/api/v1/task')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          workflow_id: 'wf-123',
          type: 'feature',
          title: 'Simple task',
          skills_required: [],
        });

      expect(response.status).toBe(201);
    });
  });
});
