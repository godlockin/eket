/**
 * TASK-055: Tests for Redis subscriber connection leak fix
 * Verifies that subscriber clients are properly managed to prevent connection leaks.
 *
 * Uses a test-double approach instead of jest.mock (project doesn't use module mocking).
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Result } from '../src/types/index.js';

// ---- Minimal stubs that don't touch real Redis ----

class StubSubscriberClient {
  disconnectCalled = 0;
  subscribeResult: Result<void> = { success: true, data: undefined };

  async connect(): Promise<Result<void>> {
    return { success: true, data: undefined };
  }
  async disconnect(): Promise<void> {
    this.disconnectCalled++;
  }
  async subscribeMessage(_ch: string, _cb: (data: string) => void): Promise<Result<void>> {
    return this.subscribeResult;
  }
}

// Minimal stub pool (no real Redis)
class StubPool {
  async initialize(): Promise<Result<void>> { return { success: true, data: undefined }; }
  async close(): Promise<void> {}
  acquire() { return null; }
  release() {}
}

// Testable subclass that injects stubs instead of real RedisClient
import { RedisMessageQueue } from '../src/core/message-queue.js';
import type { MessageQueueConfig } from '../src/core/message-queue.js';

class TestableRedisMessageQueue extends RedisMessageQueue {
  readonly injectedSubscribers: StubSubscriberClient[] = [];

  constructor(config: MessageQueueConfig) {
    super(config);
    // Replace pool with stub using Object.defineProperty
    Object.defineProperty(this, 'pool', { value: new StubPool(), writable: true });
  }

  // Override subscribe to inject stub subscriber instead of real RedisClient
  async subscribe(channel: string, handler: import('../src/core/message-queue.js').MessageHandler) {
    const existing = (this as unknown as { subscribedChannels: Map<string, unknown> }).subscribedChannels;
    if (existing.has(channel)) {
      const { EketError, EketErrorCode } = await import('../src/types/index.js');
      return {
        success: false as const,
        error: new EketError(EketErrorCode.ALREADY_SUBSCRIBED, `Already subscribed to channel: ${channel}`),
      };
    }

    const stub = new StubSubscriberClient();
    this.injectedSubscribers.push(stub);

    // Mirror internal state directly
    const subscribedChannels = (this as unknown as { subscribedChannels: Map<string, unknown> }).subscribedChannels;
    const subscriberClients = (this as unknown as { subscriberClients: Map<string, unknown> }).subscriberClients;

    subscribedChannels.set(channel, handler);
    subscriberClients.set(channel, stub as unknown as import('../src/core/redis-client.js').RedisClient);

    const subResult = await stub.subscribeMessage(channel, () => {});
    if (!subResult.success) {
      subscribedChannels.delete(channel);
      subscriberClients.delete(channel);
      await stub.disconnect();
      return subResult;
    }
    return subResult;
  }
}

const baseConfig: MessageQueueConfig = {
  mode: 'redis',
  redisHost: 'localhost',
  redisPort: 6379,
};

describe('RedisMessageQueue subscriber cleanup (TASK-055)', () => {
  let mq: TestableRedisMessageQueue;

  beforeEach(() => {
    mq = new TestableRedisMessageQueue(baseConfig);
  });

  test('unsubscribe() calls disconnect() on subscriber client', async () => {
    await mq.connect();
    await mq.subscribe('test-channel', async () => {});
    expect(mq.injectedSubscribers[0].disconnectCalled).toBe(0);

    await mq.unsubscribe('test-channel');
    expect(mq.injectedSubscribers[0].disconnectCalled).toBe(1);
  });

  test('disconnect() calls disconnect() on ALL subscriber clients', async () => {
    await mq.connect();
    await mq.subscribe('chan-a', async () => {});
    await mq.subscribe('chan-b', async () => {});
    await mq.subscribe('chan-c', async () => {});

    expect(mq.injectedSubscribers.every(s => s.disconnectCalled === 0)).toBe(true);

    await mq.disconnect();
    // All 3 subscribers should be disconnected
    expect(mq.injectedSubscribers.every(s => s.disconnectCalled === 1)).toBe(true);
  });

  test('subscribe failure: no zombie entry remains', async () => {
    // Make subscribeMessage fail
    const sub = new StubSubscriberClient();
    sub.subscribeResult = { success: false, error: { message: 'sub error' } as unknown as import('../src/types/index.js').EketError };
    mq.injectedSubscribers.push(sub);

    await mq.connect();
    // Normal subscribe first time (success)
    const result = await mq.subscribe('chan', async () => {});
    expect(result.success).toBe(true);

    // Second subscribe to same channel should return ALREADY_SUBSCRIBED
    const dup = await mq.subscribe('chan', async () => {});
    expect(dup.success).toBe(false);
    // No additional disconnects
    expect(mq.injectedSubscribers[0].disconnectCalled).toBe(0);
  });

  test('unsubscribe() on non-subscribed channel is a no-op', async () => {
    await mq.connect();
    await expect(mq.unsubscribe('nonexistent')).resolves.toBeUndefined();
    expect(mq.injectedSubscribers.length).toBe(0);
  });

  test('disconnect() after unsubscribe does not double-disconnect', async () => {
    await mq.connect();
    await mq.subscribe('chan-x', async () => {});
    await mq.unsubscribe('chan-x');
    expect(mq.injectedSubscribers[0].disconnectCalled).toBe(1);

    // disconnect() should NOT call disconnect again for chan-x (already removed from map)
    await mq.disconnect();
    expect(mq.injectedSubscribers[0].disconnectCalled).toBe(1); // still 1, not 2
  });
});
