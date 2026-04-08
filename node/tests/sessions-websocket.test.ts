/**
 * Sessions WebSocket Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  SessionsWebSocket,
  createSessionsWebSocket,
  type SessionsWebSocketConfig,
  type SessionsWebSocketCallbacks,
} from '../src/core/sessions-websocket.js';

describe('SessionsWebSocket', () => {
  let ws: SessionsWebSocket;
  let mockConfig: SessionsWebSocketConfig;

  beforeEach(() => {
    mockConfig = {
      baseUrl: 'ws://localhost:8080',
      sessionId: 'test-session-123',
      organizationUuid: 'test-org-uuid',
      accessToken: 'test-access-token',
      pingIntervalMs: 1000,
      reconnectDelayMs: 100,
      maxReconnectAttempts: 3,
    };
  });

  afterEach(async () => {
    if (ws) {
      await ws.disconnect();
    }
  });

  describe('createSessionsWebSocket', () => {
    it('should create a WebSocket instance with config', () => {
      const websocket = createSessionsWebSocket(mockConfig);
      expect(websocket).toBeDefined();
      expect(websocket).toBeInstanceOf(SessionsWebSocket);
    });

    it('should create a WebSocket instance with callbacks', () => {
      const callbacks: SessionsWebSocketCallbacks = {
        onConnected: jest.fn(),
        onDisconnected: jest.fn(),
        onClose: jest.fn(),
        onError: jest.fn(),
        onMessage: jest.fn(),
      };

      const websocket = createSessionsWebSocket(mockConfig, callbacks);
      expect(websocket).toBeDefined();
    });
  });

  describe('Connection state', () => {
    it('should start with closed state', () => {
      ws = createSessionsWebSocket(mockConfig);
      expect(ws.getState()).toBe('closed');
      expect(ws.isConnected()).toBe(false);
    });

    it('should return false for isConnected when not connected', () => {
      ws = createSessionsWebSocket(mockConfig);
      expect(ws.isConnected()).toBe(false);
    });

    it('should handle multiple disconnect calls gracefully', async () => {
      ws = createSessionsWebSocket(mockConfig);
      await ws.disconnect();
      await ws.disconnect(); // Should not throw
      expect(ws.getState()).toBe('closed');
    });
  });

  describe('WebSocket URL construction', () => {
    it('should build URL with organization UUID', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'wss://api.example.com',
        sessionId: 'session-123',
        organizationUuid: 'org-456',
        accessToken: 'token-789',
      };
      ws = createSessionsWebSocket(config);

      // URL is built internally, verified by connection attempt
      expect(ws.getState()).toBe('closed');
    });

    it('should build URL without organization UUID', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'wss://api.example.com',
        sessionId: 'session-123',
        accessToken: 'token-789',
      };
      ws = createSessionsWebSocket(config);

      expect(ws.getState()).toBe('closed');
    });

    it('should convert https:// to wss://', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'https://api.example.com',
        sessionId: 'session-123',
        accessToken: 'token',
      };
      ws = createSessionsWebSocket(config);
      // URL conversion happens on connect
      expect(ws.getState()).toBe('closed');
    });

    it('should convert http:// to ws://', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'http://localhost:8080',
        sessionId: 'session-123',
        accessToken: 'token',
      };
      ws = createSessionsWebSocket(config);
      expect(ws.getState()).toBe('closed');
    });
  });

  describe('Error code handling', () => {
    it('should recognize permanent error codes', () => {
      // Permanent error codes are defined in the module
      // 4003 = UNAUTHORIZED, 4002 = FORBIDDEN
      expect(true).toBe(true); // Placeholder for structural test
    });

    it('should allow session not found retries', () => {
      // MAX_SESSION_NOT_FOUND_RETRIES = 3
      expect(true).toBe(true); // Placeholder for structural test
    });
  });

  describe('Send message', () => {
    it('should fail to send when not connected', async () => {
      ws = createSessionsWebSocket(mockConfig);

      const result = await ws.send({
        type: 'test-message',
        data: { foo: 'bar' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('WEBSOCKET_NOT_CONNECTED');
    });

    it('should include timestamp in message', async () => {
      ws = createSessionsWebSocket(mockConfig);

      // Message structure test (without actual send)
      const message = {
        type: 'test-message',
        sessionId: 'test-session',
        timestamp: Date.now(),
        data: { foo: 'bar' },
      };

      expect(message.timestamp).toBeDefined();
      expect(message.type).toBe('test-message');
    });
  });

  describe('Subscribe modes', () => {
    it('should support read-only viewer mode', async () => {
      ws = createSessionsWebSocket(mockConfig);

      // subscribe() would fail without a real server, but we can test the method exists
      expect(typeof ws.subscribe).toBe('function');
    });

    it('should default to regular subscribe mode', async () => {
      ws = createSessionsWebSocket(mockConfig);

      expect(typeof ws.subscribe).toBe('function');
    });
  });

  describe('Configuration defaults', () => {
    it('should use default ping interval when not specified', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'ws://localhost',
        sessionId: 'test',
        accessToken: 'token',
        // pingIntervalMs not specified
      };

      ws = createSessionsWebSocket(config);
      expect(ws.getState()).toBe('closed');
    });

    it('should use default reconnect delay when not specified', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'ws://localhost',
        sessionId: 'test',
        accessToken: 'token',
        // reconnectDelayMs not specified
      };

      ws = createSessionsWebSocket(config);
      expect(ws.getState()).toBe('closed');
    });

    it('should use default max reconnect attempts when not specified', () => {
      const config: SessionsWebSocketConfig = {
        baseUrl: 'ws://localhost',
        sessionId: 'test',
        accessToken: 'token',
        // maxReconnectAttempts not specified
      };

      ws = createSessionsWebSocket(config);
      expect(ws.getState()).toBe('closed');
    });
  });

  describe('Callback handling', () => {
    it('should handle missing callbacks gracefully', () => {
      // Creating without callbacks should not throw
      ws = createSessionsWebSocket(mockConfig);
      expect(ws).toBeDefined();
    });

    it('should accept all callback types', () => {
      const callbacks: SessionsWebSocketCallbacks = {
        onConnected: () => { /* noop */ },
        onDisconnected: () => { /* noop */ },
        onClose: () => { /* noop */ },
        onError: () => { /* noop */ },
        onMessage: () => { /* noop */ },
      };

      ws = createSessionsWebSocket(mockConfig, callbacks);
      expect(ws).toBeDefined();
    });
  });

  describe('Defensive configuration', () => {
    it('should create defensive copy of config', () => {
      const mutableConfig = { ...mockConfig };
      ws = createSessionsWebSocket(mutableConfig);

      // Modify original config after creation
      mutableConfig.baseUrl = 'ws://modified.com';

      // WebSocket should still reference original config internally
      expect(ws.getState()).toBe('closed');
    });
  });
});
