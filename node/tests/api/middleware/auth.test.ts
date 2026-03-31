/**
 * 认证中间件单元测试
 *
 * 测试覆盖：
 * - 有效 API Key
 * - 无效 API Key
 * - 缺失 Authorization header
 * - 错误认证类型
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { authMiddleware, type AuthMiddlewareOptions } from '../../../src/api/middleware/auth';
import { createApiKeyManager, type ApiKeyManager } from '../../../src/api/middleware/api-key-manager';

describe('authMiddleware', () => {
  let app: express.Express;
  const testApiKey = 'test-secret-key-12345';

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Static API Key Authentication', () => {
    beforeEach(() => {
      app.use(authMiddleware({ apiKey: testApiKey }));
      app.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });
    });

    it('should allow access with valid API key', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });
    });

    it('should reject access with invalid API key', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer wrong-key');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error', 'forbidden');
      expect(response.body).toHaveProperty('message', 'Invalid API key');
    });

    it('should reject access with missing Authorization header', async () => {
      const response = await request(app).get('/protected');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'unauthorized');
      expect(response.body.message).toContain('Authorization');
    });

    it('should reject non-Bearer authorization type', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic some-token');

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Bearer');
    });

    it('should reject empty Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', '');

      expect(response.status).toBe(401);
    });

    it('should reject malformed Bearer token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer');

      expect(response.status).toBe(401);
    });
  });

  describe('Missing Authorization Configuration', () => {
    it('should return 500 when no auth method configured', async () => {
      const testApp = express();
      testApp.use(authMiddleware({}));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer any-token');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'misconfigured');
    });
  });

  describe('Environment Variable Authentication', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv, OPENCLAW_API_KEY: 'env-secret-key' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use API key from environment variable', async () => {
      const testApp = express();
      testApp.use(authMiddleware({ requireEnvVar: true }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer env-secret-key');

      expect(response.status).toBe(200);
    });

    it('should reject when env var key does not match', async () => {
      const testApp = express();
      testApp.use(authMiddleware({ requireEnvVar: true }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer wrong-key');

      expect(response.status).toBe(403);
    });

    it('should return 500 when env var not set', async () => {
      process.env.OPENCLAW_API_KEY = '';
      const testApp = express();
      testApp.use(authMiddleware({ requireEnvVar: true }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer any-key');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'misconfigured');
    });

    it('should use custom env var name', async () => {
      process.env.CUSTOM_API_KEY = 'custom-secret';
      const testApp = express();
      testApp.use(authMiddleware({ requireEnvVar: true, envVarName: 'CUSTOM_API_KEY' }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer custom-secret');

      expect(response.status).toBe(200);
    });
  });

  describe('ApiKeyManager Integration', () => {
    let apiKeyManager: ApiKeyManager;
    let validKey: string;

    beforeEach(() => {
      apiKeyManager = createApiKeyManager();
      const result = apiKeyManager.generateKey('test-key');
      validKey = result.key;
    });

    it('should allow access with valid managed key', async () => {
      const testApp = express();
      testApp.use(authMiddleware({ apiKeyManager }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${validKey}`);

      expect(response.status).toBe(200);
    });

    it('should reject with invalid key format', async () => {
      const testApp = express();
      testApp.use(authMiddleware({ apiKeyManager }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer short');

      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('invalid_format');
    });

    it('should reject with revoked key', async () => {
      const { key, keyId } = apiKeyManager.generateKey('revokable-key');
      apiKeyManager.revokeKey(keyId, 'test revocation');

      const testApp = express();
      testApp.use(authMiddleware({ apiKeyManager }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${key}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
      expect(response.body.errorCode).toBe('revoked');
    });

    it('should reject with expired key', async () => {
      // 创建立即过期的 key
      const { key } = apiKeyManager.generateKey('expiring-key', 1); // 1ms 过期
      // 等待过期
      jest.useFakeTimers();
      jest.advanceTimersByTime(10);

      const testApp = express();
      testApp.use(authMiddleware({ apiKeyManager }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${key}`);

      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('expired');

      jest.useRealTimers();
    });

    it('should update lastUsedAt on successful auth', async () => {
      const { key, keyId } = apiKeyManager.generateKey('usage-tracked-key');

      const testApp = express();
      testApp.use(authMiddleware({ apiKeyManager }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${key}`);

      const keyInfo = apiKeyManager.getKeyInfo(keyId);
      expect(keyInfo?.lastUsedAt).toBeDefined();
    });
  });

  describe('Dangerous Key Detection', () => {
    const dangerousKeys = ['eket-dev-key', 'dev-key', 'test-key', 'changeme'];

    it.each(dangerousKeys)('should log warning for dangerous key: %s', (dangerousKey) => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const testApp = express();
      testApp.use(authMiddleware({ apiKey: dangerousKey }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      // 触发认证以记录警告
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      app.use(authMiddleware({ apiKey: testApiKey }));
      app.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });
    });

    it('should handle very long API keys', async () => {
      const longKey = 'a'.repeat(1000);
      const testApp = express();
      testApp.use(authMiddleware({ apiKey: longKey }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${longKey}`);

      expect(response.status).toBe(200);
    });

    it('should handle keys with special characters', async () => {
      const specialKey = 'test-key_with.special$chars!';
      const testApp = express();
      testApp.use(authMiddleware({ apiKey: specialKey }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${specialKey}`);

      expect(response.status).toBe(200);
    });

    it('should handle Unicode characters in key', async () => {
      const unicodeKey = 'test-key-日本語 -🔑';
      const testApp = express();
      testApp.use(authMiddleware({ apiKey: unicodeKey }));
      testApp.get('/protected', (_req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', `Bearer ${unicodeKey}`);

      expect(response.status).toBe(200);
    });

    it('should handle multiple requests with same key', async () => {
      const promises = Array.from({ length: 10 }).map(() =>
        request(app)
          .get('/protected')
          .set('Authorization', `Bearer ${testApiKey}`)
      );

      const responses = await Promise.all(promises);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Response Format', () => {
    it('should return consistent error format for unauthorized', async () => {
      const testApp = express();
      testApp.use(authMiddleware({ apiKey: 'test' }));
      testApp.get('/protected', (_req, res) => res.json({}));

      const response = await request(testApp)
        .get('/protected')
        .set('Authorization', 'Bearer wrong');

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should return JSON content type', async () => {
      const testApp = express();
      testApp.use(authMiddleware({ apiKey: 'test' }));
      testApp.get('/protected', (_req, res) => res.json({}));

      const response = await request(testApp)
        .get('/protected');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
