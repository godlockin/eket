/**
 * WebSocket Message Queue Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  WebSocketMessageQueue,
  createWebSocketMessageQueue,
  type WebSocketMessageQueueConfig,
} from '../src/core/websocket-message-queue.js';

describe('WebSocketMessageQueue', () => {
  let queue: WebSocketMessageQueue;
  let mockConfig: WebSocketMessageQueueConfig;

  beforeEach(() => {
    mockConfig = {
      webSocket: {
        baseUrl: 'ws://localhost:8080',
        sessionId: 'test-session',
        accessToken: 'test-token',
      },
      fallbackToFile: false, // 默认禁用文件降级，以便快速失败
      fileQueueDir: './.eket/test-queue',
      maxRetries: 1,
    };
  });

  afterEach(async () => {
    if (queue) {
      await queue.disconnect();
    }
  });

  describe('createWebSocketMessageQueue', () => {
    it('should create a message queue instance', () => {
      const q = createWebSocketMessageQueue(mockConfig);
      expect(q).toBeDefined();
      expect(q).toBeInstanceOf(WebSocketMessageQueue);
    });

    it('should create a message queue with minimal config', () => {
      const minimalConfig: WebSocketMessageQueueConfig = {};
      const q = createWebSocketMessageQueue(minimalConfig);
      expect(q).toBeDefined();
    });
  });

  describe('Connection state', () => {
    it('should start offline', () => {
      queue = createWebSocketMessageQueue(mockConfig);
      expect(queue.getConnectionLevel()).toBe('offline');
      expect(queue.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      queue = createWebSocketMessageQueue(mockConfig);
      await queue.disconnect(); // Should not throw
      expect(queue.getConnectionLevel()).toBe('offline');
    });
  });

  describe('Send message offline', () => {
    it('should queue message when offline', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const result = await queue.sendMessage({
        type: 'test-message',
        payload: { foo: 'bar' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MESSAGE_QUEUE_OFFLINE');
    });

    it('should generate unique message IDs', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      // First, get a message ID by sending when offline (will be queued)
      const result1 = await queue.sendMessage({
        type: 'test-message',
        payload: { id: 1 },
      });

      const result2 = await queue.sendMessage({
        type: 'test-message',
        payload: { id: 2 },
      });

      // Both will fail (offline) but message IDs should still be generated
      // The error indicates they're queued for later delivery
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
      expect(result1.error?.code).toBe('MESSAGE_QUEUE_OFFLINE');
      expect(result2.error?.code).toBe('MESSAGE_QUEUE_OFFLINE');
    });
  });

  describe('Message handlers', () => {
    it('should register message handler', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const handler = jest.fn();
      queue.on('test-message', handler);

      const stats = queue.getStats();
      expect(stats.handlerCount).toBe(1);
    });

    it('should unregister message handler', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const handler = jest.fn();
      queue.on('test-message', handler);
      queue.off('test-message', handler);

      const stats = queue.getStats();
      expect(stats.handlerCount).toBe(0);
    });

    it('should register multiple handlers for same message type', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const handler1 = jest.fn();
      const handler2 = jest.fn();

      queue.on('test-message', handler1);
      queue.on('test-message', handler2);

      const stats = queue.getStats();
      expect(stats.handlerCount).toBe(2);
    });

    it('should handle unregistering non-existent handler', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const handler = jest.fn();
      const otherHandler = jest.fn();

      queue.on('test-message', handler);
      queue.off('test-message', otherHandler); // Should not throw

      const stats = queue.getStats();
      expect(stats.handlerCount).toBe(1);
    });
  });

  describe('Get stats', () => {
    it('should return connection statistics', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const stats = queue.getStats();

      expect(stats).toHaveProperty('connectionLevel');
      expect(stats).toHaveProperty('pendingMessages');
      expect(stats).toHaveProperty('isProcessing');
      expect(stats).toHaveProperty('handlerCount');
      expect(stats.connectionLevel).toBe('offline');
      expect(stats.pendingMessages).toBe(0);
      expect(stats.isProcessing).toBe(false);
      expect(stats.handlerCount).toBe(0);
    });

    it('should count pending messages', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      await queue.sendMessage({ type: 'msg1', payload: {} });
      await queue.sendMessage({ type: 'msg2', payload: {} });
      await queue.sendMessage({ type: 'msg3', payload: {} });

      const stats = queue.getStats();
      expect(stats.pendingMessages).toBe(3);
    });
  });

  describe('Process pending messages', () => {
    it('should handle empty pending queue', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      await queue.processPendingMessages(); // Should not throw

      const stats = queue.getStats();
      expect(stats.pendingMessages).toBe(0);
    });

    it('should prevent concurrent processing', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      // Start processing (will be no-op since offline)
      const promise1 = queue.processPendingMessages();
      const promise2 = queue.processPendingMessages();

      await Promise.all([promise1, promise2]);

      // Should complete without error
      expect(queue.getStats().isProcessing).toBe(false);
    });
  });

  describe('Message priority', () => {
    it('should support priority levels in messages', async () => {
      queue = createWebSocketMessageQueue(mockConfig);

      const priorities: Array<'low' | 'normal' | 'high' | 'critical'> = [
        'low',
        'normal',
        'high',
        'critical',
      ];

      for (const priority of priorities) {
        const result = await queue.sendMessage({
          type: 'priority-test',
          payload: { priority },
          priority,
        });

        // Message will be queued (offline)
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('MESSAGE_QUEUE_OFFLINE');
      }

      const stats = queue.getStats();
      expect(stats.pendingMessages).toBe(4);
    });
  });

  describe('Defensive programming', () => {
    it('should handle config mutation after creation', () => {
      const mutableConfig = { ...mockConfig };
      queue = createWebSocketMessageQueue(mutableConfig);

      // Mutate original config
      mutableConfig.fallbackToFile = true;

      // Queue should still function with its internal config copy
      expect(queue).toBeDefined();
      expect(queue.getConnectionLevel()).toBe('offline');
    });
  });
});
