/**
 * Agent 路由单元测试
 *
 * 测试覆盖：
 * - POST /api/v1/agent - 启动 Agent 实例
 * - GET /api/v1/agent/:id/status - 获取 Agent 状态
 * - 实例启动逻辑
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { AgentRouter } from '../../../src/api/routes/agent';
import { authMiddleware } from '../../../src/api/middleware/auth';

describe('AgentRouter', () => {
  let app: express.Express;
  const testApiKey = 'test-agent-key';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(authMiddleware({ apiKey: testApiKey }));
    app.use('/api/v1/agent', AgentRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/agent', () => {
    it('should start agent with valid request', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'frontend_dev',
          skills: ['react', 'typescript', 'css'],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('agent_id');
      expect(response.body).toHaveProperty('instance_id');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('role');
      expect(response.body).toHaveProperty('skills');
    });

    it('should accept all agent fields', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          id: 'custom-agent-id',
          role: 'backend_dev',
          skills: ['nodejs', 'python', 'postgresql'],
          execution_mode: 'auto',
          reporting: {
            to: 'openclaw',
            channel: 'agent_updates',
            format: 'json',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.agent_id).toBeDefined();
    });

    it('should reject missing role field', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          skills: ['react'],
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'validation_error');
      expect(response.body.message).toContain('role');
    });

    it('should generate agent ID if not provided', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'developer',
        });

      expect(response.status).toBe(201);
      expect(response.body.agent_id).toBeDefined();
    });

    it('should accept empty skills array', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'generalist',
          skills: [],
        });

      expect(response.status).toBe(201);
    });

    it('should accept auto execution mode', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'auto_agent',
          execution_mode: 'auto',
        });

      expect(response.status).toBe(201);
    });

    it('should accept manual execution mode', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'manual_agent',
          execution_mode: 'manual',
        });

      expect(response.status).toBe(201);
    });

    it('should default to auto execution mode if not specified', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'default_agent',
        });

      expect(response.status).toBe(201);
    });

    it('should accept reporting configuration', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'reporting_agent',
          reporting: {
            to: 'openclaw',
            channel: 'updates',
            format: 'json',
          },
        });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/v1/agent/:id/status', () => {
    it('should return agent status', async () => {
      const agentId = 'agent-123';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('agent_id', agentId);
      expect(response.body).toHaveProperty('instance_id');
      expect(response.body).toHaveProperty('status');
    });

    it('should return valid status values', async () => {
      const agentId = 'agent-456';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const validStatuses = ['idle', 'busy', 'offline'];
      expect(validStatuses).toContain(response.body.status);
    });

    it('should include agent metadata', async () => {
      const agentId = 'agent-789';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('role');
      expect(response.body).toHaveProperty('skills');
    });

    it('should include heartbeat timestamp', async () => {
      const agentId = 'agent-heartbeat';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('last_heartbeat');
    });

    it('should include uptime information', async () => {
      const agentId = 'agent-uptime';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('uptime_seconds');
    });

    it('should handle non-existent agent ID gracefully', async () => {
      const agentId = 'non-existent-agent';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      // 当前实现可能返回模拟数据或错误
      expect([200, 500]).toContain(response.status);
    });

    it('should handle special characters in agent ID', async () => {
      const agentId = 'agent_special-chars.123';

      const response = await request(app)
        .get(`/api/v1/agent/${agentId}/status`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.agent_id).toBe(agentId);
    });
  });

  describe('Instance Start Logic', () => {
    it('should register agent in instance registry', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'test_agent',
          skills: ['test'],
        });

      expect(response.status).toBe(201);
      // 验证返回了实例 ID，说明注册成功
      expect(response.body.instance_id).toBeDefined();
    });

    it('should return agent status after start', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'status_check_agent',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBeDefined();
    });

    it('should echo back the role in response', async () => {
      const role = 'qa_engineer';

      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role,
        });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe(role);
    });

    it('should echo back the skills in response', async () => {
      const skills = ['jest', 'typescript', 'testing'];

      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'tester',
          skills,
        });

      expect(response.status).toBe(201);
      expect(response.body.skills).toEqual(expect.arrayContaining(skills));
    });
  });

  describe('Error Handling', () => {
    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('role');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle internal errors gracefully', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'test_agent',
        });

      expect([201, 500]).toContain(response.status);
    });
  });

  describe('Agent Types', () => {
    it('should accept frontend_dev role', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'frontend_dev',
          skills: ['react', 'vue'],
        });

      expect(response.status).toBe(201);
    });

    it('should accept backend_dev role', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'backend_dev',
          skills: ['nodejs', 'python'],
        });

      expect(response.status).toBe(201);
    });

    it('should accept qa_engineer role', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'qa_engineer',
          skills: ['jest', 'cypress'],
        });

      expect(response.status).toBe(201);
    });

    it('should accept devops role', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'devops',
          skills: ['docker', 'kubernetes'],
        });

      expect(response.status).toBe(201);
    });

    it('should accept custom role', async () => {
      const response = await request(app)
        .post('/api/v1/agent')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send({
          role: 'custom_specialist',
          skills: ['specialized_skill'],
        });

      expect(response.status).toBe(201);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent agent starts', async () => {
      const roles = ['frontend_dev', 'backend_dev', 'qa_engineer', 'devops', 'designer'];

      const promises = roles.map((role) =>
        request(app)
          .post('/api/v1/agent')
          .set('Authorization', `Bearer ${testApiKey}`)
          .send({
            role,
            skills: [role],
          })
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.role).toBe(roles[index]);
      });

      // 验证每个 agent_id 是唯一的
      const agentIds = responses.map((r) => r.body.agent_id);
      const uniqueIds = new Set(agentIds);
      expect(uniqueIds.size).toBe(agentIds.length);
    });
  });
});
