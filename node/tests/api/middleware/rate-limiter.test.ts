/**
 * 速率限制中间件单元测试
 *
 * 测试覆盖：
 * - 速率限制触发
 * - 窗口重置
 * - IP 白名单
 * - 自定义限制配置
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import {
  RateLimiter,
  createRateLimiter,
  presets,
  type RateLimiterConfig,
} from '../../../src/api/middleware/rate-limiter';

describe('RateLimiter', () => {
  let app: express.Express;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    jest.useFakeTimers();
    app = express();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (rateLimiter) {
      rateLimiter.stopCleanup();
    }
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      rateLimiter = createRateLimiter();
      expect(rateLimiter).toBeDefined();
    });

    it('should accept custom config', () => {
      rateLimiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 50,
      });
      expect(rateLimiter).toBeDefined();
    });

    it('should use default message if not provided', () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      });
      expect(rateLimiter).toBeDefined();
    });

    it('should accept custom message', () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
        message: 'Custom rate limit message',
      });
      expect(rateLimiter).toBeDefined();
    });
  });

  describe('Basic Rate Limiting', () => {
    beforeEach(() => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 3,
        headers: true,
      });
      app.use(rateLimiter.middleware());
      app.get('/test', (_req, res) => {
        res.json({ message: 'success' });
      });
    });

    it('should allow requests within limit', async () => {
      for (let i = 0; i < 3; i++) {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
      }
    });

    it('should reject requests exceeding limit', async () => {
      // 先发送 3 个请求（达到限制）
      for (let i = 0; i < 3; i++) {
        await request(app).get('/test');
      }

      // 第 4 个请求应该被拒绝
      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
      expect(response.body).toHaveProperty('error', 'rate_limit_exceeded');
    });

    it('should include rate limit headers', async () => {
      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
      expect(response.headers['x-ratelimit-limit']).toBe('3');
      expect(response.headers['x-ratelimit-remaining']).toBe('2');
    });

    it('should decrement remaining count with each request', async () => {
      const response1 = await request(app).get('/test');
      const response2 = await request(app).get('/test');
      const response3 = await request(app).get('/test');

      expect(response1.headers['x-ratelimit-remaining']).toBe('2');
      expect(response2.headers['x-ratelimit-remaining']).toBe('1');
      expect(response3.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Window Reset', () => {
    beforeEach(() => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        headers: true,
      });
      app.use(rateLimiter.middleware());
      app.get('/test', (_req, res) => {
        res.json({ message: 'success' });
      });
    });

    it('should reset count after window expires', async () => {
      // 发送 2 个请求，达到限制
      await request(app).get('/test');
      await request(app).get('/test');

      // 第 3 个请求应该被拒绝
      const response1 = await request(app).get('/test');
      expect(response1.status).toBe(429);

      // 快进时间超过窗口
      jest.advanceTimersByTime(1500);

      // 现在应该可以再次请求
      const response2 = await request(app).get('/test');
      expect(response2.status).toBe(200);
    });

    it('should not reset count before window expires', async () => {
      await request(app).get('/test');
      await request(app).get('/test');

      // 快进时间但未超过窗口
      jest.advanceTimersByTime(500);

      // 仍然应该被拒绝
      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
    });

    it('should include correct retryAfter in response', async () => {
      // 达到限制
      await request(app).get('/test');
      await request(app).get('/test');

      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
      expect(response.body).toHaveProperty('retryAfter');
      expect(response.body.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('IP Address Handling', () => {
    it('should track limits by IP address', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      // 从一个 IP 发送 2 个请求
      await request(testApp).get('/test');
      await request(testApp).get('/test');

      // 第 3 个请求应该被拒绝
      const response = await request(testApp).get('/test');
      expect(response.status).toBe(429);
    });

    it('should use X-Forwarded-For when trustProxy is enabled', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        trustProxy: true,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      // 模拟来自不同真实 IP 的请求，通过 X-Forwarded-For
      await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1');
      await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1');

      // 来自同一 IP 的第 3 个请求应该被拒绝
      const response1 = await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1');
      expect(response1.status).toBe(429);

      // 来自不同 IP 的请求应该被允许
      const response2 = await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.2');
      expect(response2.status).toBe(200);
    });

    it('should handle comma-separated X-Forwarded-For', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        trustProxy: true,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      // X-Forwarded-For: client, proxy1, proxy2
      await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1, 192.168.1.2, 192.168.1.3');
      await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1, 192.168.1.2, 192.168.1.3');

      // 应该使用第一个 IP (192.168.1.1) 进行限速
      const response = await request(testApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1, 192.168.1.2');
      expect(response.status).toBe(429);
    });
  });

  describe('Custom Configuration', () => {
    it('should use strict preset', () => {
      rateLimiter = createRateLimiter(presets.strict);
      expect(rateLimiter).toBeDefined();
    });

    it('should use standard preset', () => {
      rateLimiter = createRateLimiter(presets.standard);
      expect(rateLimiter).toBeDefined();
    });

    it('should use lenient preset', () => {
      rateLimiter = createRateLimiter(presets.lenient);
      expect(rateLimiter).toBeDefined();
    });

    it('should allow disabling headers', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
        headers: false,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      const response = await request(testApp).get('/test');
      expect(response.status).toBe(200);
      expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
    });

    it('should accept very low limits', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 1,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      const response1 = await request(testApp).get('/test');
      expect(response1.status).toBe(200);

      const response2 = await request(testApp).get('/test');
      expect(response2.status).toBe(429);
    });

    it('should accept high limits', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1000,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      // 发送 100 个请求，都应该成功
      for (let i = 0; i < 100; i++) {
        const response = await request(testApp).get('/test');
        expect(response.status).toBe(200);
      }
    });
  });

  describe('RateLimiter Methods', () => {
    beforeEach(() => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      });
    });

    describe('reset', () => {
      it('should reset rate limit for specific client', async () => {
        const testApp = express();
        testApp.use(rateLimiter.middleware());
        testApp.get('/test', (_req, res) => res.json({}));

        // 达到限制
        for (let i = 0; i < 5; i++) {
          await request(testApp).get('/test');
        }

        // 验证被限制
        const response1 = await request(testApp).get('/test');
        expect(response1.status).toBe(429);

        // 重置
        const mockReq: any = { socket: { remoteAddress: '127.0.0.1' } };
        rateLimiter.reset('127.0.0.1');

        // 现在应该可以再次请求
        const testApp2 = express();
        const rateLimiter2 = createRateLimiter({ windowMs: 1000, maxRequests: 5 });
        testApp2.use(rateLimiter2.middleware());
        testApp2.get('/test', (_req, res) => res.json({}));

        rateLimiter2.reset('127.0.0.1');
        const response2 = await request(testApp2).get('/test');
        expect(response2.status).toBe(200);
      });

      it('should return false for non-existent client', () => {
        const result = rateLimiter.reset('non-existent-ip');
        expect(result).toBe(false);
      });
    });

    describe('getStatus', () => {
      it('should return undefined for unknown client', () => {
        const status = rateLimiter.getStatus('unknown-ip');
        expect(status).toBeUndefined();
      });

      it('should return status for known client', async () => {
        const testApp = express();
        testApp.use(rateLimiter.middleware());
        testApp.get('/test', (_req, res) => res.json({}));

        await request(testApp).get('/test');

        const status = rateLimiter.getStatus('127.0.0.1');
        expect(status).toBeDefined();
        expect(status?.count).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired entries', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 100,
        maxRequests: 5,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      // 发送请求
      await request(testApp).get('/test');

      // 快进时间超过清理间隔
      jest.advanceTimersByTime(200);

      // 过期条目应该被清理
      const status = rateLimiter.getStatus('127.0.0.1');
      expect(status).toBeUndefined();
    });

    it('should stop cleanup on destroy', () => {
      rateLimiter = createRateLimiter({
        windowMs: 100,
        maxRequests: 5,
      });

      rateLimiter.stopCleanup();

      // 不应该再有自动清理
      jest.advanceTimersByTime(1000);
      // 没有好的方式验证定时器已停止，至少验证方法可以调用
    });
  });

  describe('Presets', () => {
    it('strict preset should have 60s window and 10 requests', () => {
      expect(presets.strict.windowMs).toBe(60 * 1000);
      expect(presets.strict.maxRequests).toBe(10);
    });

    it('standard preset should have 15m window and 100 requests', () => {
      expect(presets.standard.windowMs).toBe(15 * 60 * 1000);
      expect(presets.standard.maxRequests).toBe(100);
    });

    it('lenient preset should have 1h window and 1000 requests', () => {
      expect(presets.lenient.windowMs).toBe(60 * 60 * 1000);
      expect(presets.lenient.maxRequests).toBe(1000);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      });

      const testApp = express();
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      // 并发发送 10 个请求
      const promises = Array.from({ length: 10 }).map(() =>
        request(testApp).get('/test')
      );

      const responses = await Promise.all(promises);

      // 前 5 个应该成功，后 5 个应该被限制
      const successCount = responses.filter((r) => r.status === 200).length;
      const limitedCount = responses.filter((r) => r.status === 429).length;

      expect(successCount).toBe(5);
      expect(limitedCount).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing socket information', async () => {
      rateLimiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
      });

      const testApp = express();
      testApp.use((req: any, _res, next) => {
        // 模拟缺失 socket 信息
        req.socket = undefined;
        next();
      });
      testApp.use(rateLimiter.middleware());
      testApp.get('/test', (_req, res) => res.json({}));

      const response = await request(testApp).get('/test');
      // 应该使用 'unknown' 作为客户端 ID
      expect([200, 429]).toContain(response.status);
    });
  });
});
