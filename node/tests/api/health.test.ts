/**
 * 健康检查端点测试
 *
 * 覆盖：
 * - EketServer: GET /health, /ready, /live
 * - WebDashboardServer: GET /health, /ready, /live
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { EketServer } from '../../src/api/eket-server.js';
import type { EketServerConfig } from '../../src/api/eket-server.js';

// ============================================================
// EketServer 健康端点
// ============================================================

describe('EketServer — health endpoints', () => {
  let server: EketServer;

  beforeAll(async () => {
    const config: EketServerConfig = {
      port: 0,
      enableWebSocket: false,
      enableAuth: false,
    };
    server = new EketServer(config);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const app = (server as any).app;
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('dependencies');
    });

    it('should return ok or degraded (not unhealthy) without Redis', async () => {
      const app = (server as any).app;
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(['ok', 'degraded']).toContain(res.body.status);
    });
  });

  describe('GET /ready', () => {
    it('should return 200 with ready: true', async () => {
      const app = (server as any).app;
      const res = await request(app).get('/ready');

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
    });
  });

  describe('GET /live', () => {
    it('should return 200 with alive: true', async () => {
      const app = (server as any).app;
      const res = await request(app).get('/live');

      expect(res.status).toBe(200);
      expect(res.body.alive).toBe(true);
    });
  });
});

// ============================================================
// WebDashboardServer 健康端点（通过 supertest http 模块）
// ============================================================

import http from 'http';
import { WebDashboardServer } from '../../src/api/web-server.js';

function httpGet(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('WebDashboardServer — health endpoints', () => {
  let dashServer: WebDashboardServer;
  let serverPort: number;

  beforeAll(async () => {
    dashServer = new WebDashboardServer({ port: 0, host: '127.0.0.1' });
    await dashServer.start();
    const httpServer = (dashServer as any).server as http.Server;
    const addr = httpServer.address() as { port: number };
    serverPort = addr.port;
  });

  afterAll(async () => {
    await dashServer.stop();
  });

  describe('GET /health', () => {
    it('should return 200 with health info', async () => {
      const { status, body } = await httpGet(serverPort, '/health');
      const b = body as Record<string, unknown>;

      expect(status).toBe(200);
      expect(b).toHaveProperty('status');
      expect(b).toHaveProperty('uptime');
      expect(b).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 with ready: true', async () => {
      const { status, body } = await httpGet(serverPort, '/ready');
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).ready).toBe(true);
    });
  });

  describe('GET /live', () => {
    it('should return 200 with alive: true', async () => {
      const { status, body } = await httpGet(serverPort, '/live');
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).alive).toBe(true);
    });
  });
});
