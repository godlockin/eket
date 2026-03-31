/**
 * HTTP Hook Server Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { HttpHookServer, createHttpHookServer } from '../src/hooks/http-hook-server';

const TEST_PORT = 18999;

describe('HttpHookServer', () => {
  let server: HttpHookServer;
  let serverStarted = false;

  afterEach(async () => {
    // Clean up any running server
    if (serverStarted) {
      try {
        await server.stop();
      } catch {
        // Ignore if server not running
      }
      serverStarted = false;
    }
  });

  describe('Server lifecycle', () => {
    beforeEach(() => {
      server = createHttpHookServer({ port: TEST_PORT });
      serverStarted = false;
    });

    it('should start and stop', async () => {
      await server.start();
      serverStarted = true;
      await server.stop();
      serverStarted = false;
      // Server stopped successfully
      expect(true).toBe(true);
    });

    it('should respond to health check', async () => {
      await server.start();
      serverStarted = true;

      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('Hook endpoints', () => {
    beforeEach(() => {
      server = createHttpHookServer({ port: TEST_PORT });
      serverStarted = true;
      return server.start();
    });

    it('should accept PreToolUse hook', async () => {
      let handlerCalled = false;
      let receivedPayload: unknown = null;

      server.on('PreToolUse', (payload) => {
        handlerCalled = true;
        receivedPayload = payload;
        return { action: 'allow' };
      });

      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/pre-tool-use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'PreToolUse',
          sessionId: 'test-session',
          agentName: 'test-agent',
          data: {
            toolName: 'Bash',
            toolInput: { command: 'echo hello' },
          },
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.action).toBe('allow');
      expect(handlerCalled).toBe(true);
    });

    it('should accept TeammateIdle hook', async () => {
      let handlerCalled = false;

      server.on('TeammateIdle', () => {
        handlerCalled = true;
        return { action: 'allow', feedback: 'Task assigned' };
      });

      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/teammate-idle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'TeammateIdle',
          sessionId: 'test-session',
          agentName: 'agent-001',
          data: {
            idleReason: 'available',
            completedTaskId: 'task-123',
            completedStatus: 'resolved',
          },
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.action).toBe('allow');
      expect(result.feedback).toBe('Task assigned');
      expect(handlerCalled).toBe(true);
    });

    it('should accept TaskCompleted hook', async () => {
      let handlerCalled = false;

      server.on('TaskCompleted', () => {
        handlerCalled = true;
        return { action: 'allow' };
      });

      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/task-completed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'TaskCompleted',
          sessionId: 'test-session',
          agentName: 'agent-001',
          data: {
            taskId: 'task-456',
            taskStatus: 'completed',
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(handlerCalled).toBe(true);
    });

    it('should deny operation via PreToolUse hook', async () => {
      server.on('PreToolUse', (payload) => {
        if (payload.data.toolName === 'Bash' &&
            (payload.data.toolInput as { command?: string })?.command?.includes('rm -rf')) {
          return {
            action: 'deny',
            reason: 'Dangerous command detected',
          };
        }
        return { action: 'allow' };
      });

      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/pre-tool-use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'PreToolUse',
          sessionId: 'test-session',
          agentName: 'test-agent',
          data: {
            toolName: 'Bash',
            toolInput: { command: 'rm -rf /' },
          },
        }),
      });

      const result = await response.json();
      expect(result.action).toBe('deny');
      expect(result.reason).toBe('Dangerous command detected');
    });

    it('should handle multiple handlers for same event', async () => {
      let handler1Called = false;
      let handler2Called = false;

      server.on('PreToolUse', () => {
        handler1Called = true;
        return { action: 'allow', feedback: 'Handler 1' };
      });

      server.on('PreToolUse', () => {
        handler2Called = true;
        return { action: 'allow', feedback: 'Handler 2' };
      });

      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/pre-tool-use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'PreToolUse',
          sessionId: 'test-session',
          data: {},
        }),
      });

      const result = await response.json();
      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
      // 最后一个 handler 的反馈生效
      expect(result.feedback).toBe('Handler 2');
    });

    it('should return 404 for unknown hook endpoint', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/unknown-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'UnknownEvent' }),
      });

      expect(response.status).toBe(404);
    });

    it('should support CORS preflight', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/hooks/pre-tool-use`, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('Secret authentication', () => {
    it('should reject requests without valid secret', async () => {
      const securedServer = createHttpHookServer({
        port: TEST_PORT + 1,
        secret: 'test-secret-123',
      });

      try {
        await securedServer.start();

        const response = await fetch(`http://localhost:${TEST_PORT + 1}/hooks/pre-tool-use`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'PreToolUse', sessionId: 'test', data: {} }),
        });

        expect(response.status).toBe(401);
      } finally {
        await securedServer.stop();
      }
    });

    it('should accept requests with valid secret', async () => {
      const securedServer = createHttpHookServer({
        port: TEST_PORT + 1,
        secret: 'test-secret-123',
      });

      try {
        await securedServer.start();

        securedServer.on('PreToolUse', () => ({ action: 'allow' }));

        const response = await fetch(`http://localhost:${TEST_PORT + 1}/hooks/pre-tool-use`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-secret-123',
          },
          body: JSON.stringify({ event: 'PreToolUse', sessionId: 'test', data: {} }),
        });

        expect(response.status).toBe(200);
      } finally {
        await securedServer.stop();
      }
    });
  });
});
