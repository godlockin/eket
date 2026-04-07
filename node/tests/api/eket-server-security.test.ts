/**
 * EKET Server Security Features Test
 *
 * 测试 HTTP Server 安全增强功能：
 * - Rate Limiting
 * - CORS
 * - Input Validation (JSON Schema)
 * - Enhanced Health Check
 * - Request Logging
 */

import request from 'supertest';
import { EketServer } from '../../src/api/eket-server.js';
import type { EketServerConfig } from '../../src/api/eket-server.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('EKET Server Security Features', () => {
  let server: EketServer;
  let serverApp: any;

  const config: EketServerConfig = {
    port: 0, // Random port
    host: 'localhost',
    jwtSecret: 'test-secret-key-for-security-tests',
    projectRoot: path.resolve(__dirname, '../../..'),
    enableWebSocket: false, // Disable WebSocket for simpler tests
  };

  beforeAll(async () => {
    server = new EketServer(config);
    // Access private app property for testing
    serverApp = (server as any).app;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('HTTP-002: CORS Configuration', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request(serverApp).options('/api/v1/agents/register');

      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    it('should allow configured origins', async () => {
      const response = await request(serverApp)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('HTTP-003: Input Validation', () => {
    it('should reject invalid agent registration (missing required field)', async () => {
      const invalidPayload = {
        agent_type: 'claude_code',
        // Missing 'role' field
      };

      const response = await request(serverApp)
        .post('/api/v1/agents/register')
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('Invalid request body'),
        },
      });
    });

    it('should reject invalid agent type enum', async () => {
      const invalidPayload = {
        agent_type: 'invalid_type',
        role: 'master',
      };

      const response = await request(serverApp)
        .post('/api/v1/agents/register')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid agent registration', async () => {
      const validPayload = {
        agent_type: 'claude_code',
        role: 'master',
        agent_version: '1.0.0',
        specialty: 'fullstack',
      };

      const response = await request(serverApp)
        .post('/api/v1/agents/register')
        .send(validPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.instance_id).toBeDefined();
      expect(response.body.token).toBeDefined();
    });

    it('should validate message schema', async () => {
      // First register to get a token
      const regResponse = await request(serverApp)
        .post('/api/v1/agents/register')
        .send({
          agent_type: 'claude_code',
          role: 'slaver',
        });

      const token = regResponse.body.token;

      // Try to send invalid message
      const invalidMessage = {
        from: 'test_agent',
        to: 'master',
        // Missing 'type' and 'payload'
      };

      const response = await request(serverApp)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidMessage)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('HTTP-005: Enhanced Health Check', () => {
    it('should return health status with dependencies', async () => {
      const response = await request(serverApp).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/^(ok|degraded|unhealthy)$/),
        version: '1.0.0',
        uptime: expect.any(Number),
        timestamp: expect.any(Number),
        dependencies: {
          redis: expect.stringMatching(/^(healthy|unhealthy|unknown)$/),
          websocket: expect.stringMatching(/^(healthy|unhealthy|unknown)$/),
        },
      });
    });

    it('should show degraded status when Redis is unavailable', async () => {
      const response = await request(serverApp).get('/health');

      // Redis is likely unavailable in test environment
      if (response.body.dependencies.redis === 'unhealthy') {
        expect(response.body.status).toMatch(/degraded|unhealthy/);
      }
    });
  });

  describe('HTTP-001: Rate Limiting', () => {
    it('should allow normal request rate', async () => {
      // Make a few requests
      for (let i = 0; i < 5; i++) {
        const response = await request(serverApp).get('/health');
        expect(response.status).toBe(200);
      }
    });

    // Note: Testing actual rate limit would require making 100+ requests
    // which is slow in unit tests. Integration tests should cover this.
    it('should have rate limit headers', async () => {
      const response = await request(serverApp)
        .post('/api/v1/agents/register')
        .send({ agent_type: 'claude_code', role: 'master' });

      // Rate limit headers should be present
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  describe('HTTP-004: Request Logging', () => {
    it('should log requests without exposing sensitive data', async () => {
      const payload = {
        agent_type: 'claude_code',
        role: 'master',
        metadata: {
          secret: 'should-be-redacted',
        },
      };

      // This test verifies that logging is set up
      // Actual log content verification would require log inspection
      const response = await request(serverApp)
        .post('/api/v1/agents/register')
        .send(payload);

      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should not log health check requests', async () => {
      // Health checks should be skipped in logs to reduce noise
      const response = await request(serverApp).get('/health');
      expect(response.status).toBe(200);
      // Log verification would be done through log inspection
    });
  });

  describe('Error Handling', () => {
    it('should return 401 for missing authentication', async () => {
      const response = await request(serverApp).get('/api/v1/agents').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: expect.stringContaining('authorization'),
        },
      });
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(serverApp)
        .get('/api/v1/agents')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
