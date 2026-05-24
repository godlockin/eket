/**
 * Dual-Track Fallback Engine (Dual-Track Router) Unit Tests
 *
 * Covers:
 * - Environment Detection (detectRustEnvironment)
 * - Transparent interface alignment
 * - Track A routing to Rust HTTP APIs
 * - High-frequency calls mid-flight crash detection
 * - Automatic seamless fallback to Track B (JS Core)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  detectRustEnvironment,
  DualTrackElection,
  RustElectionAdapter,
  NodeElectionFallback,
  DualTrackEventBus,
  RustEventBusAdapter,
} from '../core/dual-track-router';
import { MasterElection } from '../core/master-election';
import { EventBus } from '../core/event-bus';

describe('Dual-Track Router Environment Detection', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should detect Track A (Rust Core) when server is healthy', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      } as Response)
    ) as any;

    const result = await detectRustEnvironment('http://localhost:9877');
    expect(result.available).toBe(true);
    expect(result.track).toBe('A');
  });

  it('should fallback to Track B (JS Fallback) when server returns non-ok status', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    ) as any;

    const result = await detectRustEnvironment('http://localhost:9877');
    expect(result.available).toBe(false);
    expect(result.track).toBe('B');
    expect(result.reason).toContain('status 500');
  });

  it('should fallback to Track B (JS Fallback) on fetch network crash/timeout', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Connection refused'))) as any;

    const result = await detectRustEnvironment('http://localhost:9877');
    expect(result.available).toBe(false);
    expect(result.track).toBe('B');
    expect(result.reason).toContain('Connection refused');
  });
});

describe('DualTrackElection', () => {
  let originalFetch: typeof fetch;
  let mockMasterElection: jest.Mocked<MasterElection>;
  let nodeFallback: NodeElectionFallback;
  let rustAdapter: RustElectionAdapter;

  beforeEach(() => {
    originalFetch = global.fetch;

    // Create a mock of MasterElection for Track B
    mockMasterElection = {
      elect: jest.fn(() =>
        Promise.resolve({
          success: true,
          data: { isMaster: true },
        })
      ),
    } as any;

    nodeFallback = new NodeElectionFallback(mockMasterElection);
    rustAdapter = new RustElectionAdapter('http://localhost:9877');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should elect through Rust adapter when Track A is healthy', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)
    ) as any;

    const dualTrackElection = new DualTrackElection(rustAdapter, nodeFallback);
    dualTrackElection.setTrack('A');

    const result = await dualTrackElection.tryElect();
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockMasterElection.elect).not.toHaveBeenCalled();
    expect(dualTrackElection.getCurrentTrack()).toBe('A');
  });

  it('should auto fallback to Track B seamlessly if Rust server crashes mid-flight', async () => {
    // Rust server fails with network crash
    global.fetch = jest.fn(() => Promise.reject(new Error('Rust Server crashed!'))) as any;

    const dualTrackElection = new DualTrackElection(rustAdapter, nodeFallback);
    dualTrackElection.setTrack('A');

    // Run election - it should not crash, it should log a warning, switch track, and return JS result
    const result = await dualTrackElection.tryElect();
    expect(result).toBe(true); // From JS fallback
    expect(dualTrackElection.getCurrentTrack()).toBe('B'); // Automatically fallback
    expect(mockMasterElection.elect).toHaveBeenCalledTimes(1);

    // Subsequent elect calls should go directly to Track B without hitting fetch
    jest.clearAllMocks();
    const result2 = await dualTrackElection.tryElect();
    expect(result2).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockMasterElection.elect).toHaveBeenCalledTimes(1);
  });
});

describe('DualTrackEventBus', () => {
  let originalFetch: typeof fetch;
  let mockEventBus: jest.Mocked<EventBus>;
  let rustAdapter: RustEventBusAdapter;

  beforeEach(() => {
    originalFetch = global.fetch;

    // Create a mock of JS EventBus
    mockEventBus = {
      emit: jest.fn(),
      emitAsync: jest.fn(() => Promise.resolve()),
      publish: jest.fn(() => Promise.resolve()),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      offAll: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isReady: jest.fn(() => true),
    } as any;

    rustAdapter = new RustEventBusAdapter('http://localhost:9877');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should publish events to Rust in Track A', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
      } as Response)
    ) as any;

    const dualEventBus = new DualTrackEventBus(rustAdapter, mockEventBus);
    dualEventBus.setTrack('A');

    await dualEventBus.emit('test-event', { val: 42 }, 'test-source');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockEventBus.emit).toHaveBeenCalledWith('test-event', { val: 42 }, 'test-source');
    expect(dualEventBus.getCurrentTrack()).toBe('A');
  });

  it('should seamlessly downgrade to JS EventBus when Rust post fails', async () => {
    // Rust publisher fails
    global.fetch = jest.fn(() => Promise.reject(new Error('Publish failed'))) as any;

    const dualEventBus = new DualTrackEventBus(rustAdapter, mockEventBus);
    dualEventBus.setTrack('A');

    await dualEventBus.emit('test-event', { val: 42 }, 'test-source');
    expect(dualEventBus.getCurrentTrack()).toBe('B'); // Switched to Track B
    expect(mockEventBus.emit).toHaveBeenCalledTimes(1); // Still handled by fallback

    // Subsequent calls go directly to Track B
    jest.clearAllMocks();
    await dualEventBus.emit('test-event-2', { val: 100 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockEventBus.emit).toHaveBeenCalledWith('test-event-2', { val: 100 }, undefined);
  });

  it('should seamlessly route subscription API methods to JS EventBus', () => {
    const dualEventBus = new DualTrackEventBus(rustAdapter, mockEventBus);
    const handler = () => {};

    dualEventBus.on('my-event', handler, { priority: 1 });
    expect(mockEventBus.on).toHaveBeenCalledWith('my-event', handler, { priority: 1 });

    dualEventBus.once('my-event-once', handler);
    expect(mockEventBus.once).toHaveBeenCalledWith('my-event-once', handler, undefined);

    dualEventBus.off('my-event', handler);
    expect(mockEventBus.off).toHaveBeenCalledWith('my-event', handler);

    dualEventBus.offAll('my-event');
    expect(mockEventBus.offAll).toHaveBeenCalledWith('my-event');
  });
});

describe('Dual-Track Hardening & Chaos Resilience', () => {
  let originalFetch: typeof fetch;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockMasterElection: jest.Mocked<MasterElection>;
  let nodeFallback: NodeElectionFallback;
  let rustElectionAdapter: RustElectionAdapter;
  let rustEventBusAdapter: RustEventBusAdapter;

  beforeEach(() => {
    originalFetch = global.fetch;

    mockEventBus = {
      emit: jest.fn(),
      emitAsync: jest.fn(() => Promise.resolve()),
      publish: jest.fn(() => Promise.resolve()),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      offAll: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isReady: jest.fn(() => true),
    } as any;

    mockMasterElection = {
      elect: jest.fn(() =>
        Promise.resolve({
          success: true,
          data: { isMaster: true },
        })
      ),
    } as any;

    nodeFallback = new NodeElectionFallback(mockMasterElection);
    rustElectionAdapter = new RustElectionAdapter('http://localhost:9877');
    rustEventBusAdapter = new RustEventBusAdapter('http://localhost:9877');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('VULN-001: should cancel fetch response body on success and error to prevent socket leaks', async () => {
    const mockCancel = jest.fn(() => Promise.resolve());
    const mockBody = {
      cancel: mockCancel,
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: mockBody,
        bodyUsed: false,
        json: () => {
          (global.fetch as any).mock.results[0].value.then((resp: any) => {
            resp.bodyUsed = true;
          });
          return Promise.resolve({ success: true });
        },
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
      } as any)
    ) as any;

    // 1. Check tryElect body cleanup
    const dualTrackElection = new DualTrackElection(rustElectionAdapter, nodeFallback);
    await dualTrackElection.tryElect();
    // Since json() was called, bodyUsed became true, mockCancel should NOT be called.
    expect(mockCancel).not.toHaveBeenCalled();

    // 2. Check detectRustEnvironment body cleanup (which doesn't parse JSON, just returns ok)
    mockCancel.mockClear();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: mockBody,
        bodyUsed: false,
      } as any)
    ) as any;

    await detectRustEnvironment('http://localhost:9877');
    expect(mockCancel).toHaveBeenCalledTimes(1);

    // 3. Check error status code cancellation
    mockCancel.mockClear();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        body: mockBody,
        bodyUsed: false,
      } as any)
    ) as any;

    await detectRustEnvironment('http://localhost:9877');
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('VULN-002: should isolate JS event subscriber errors to propagate without causing Track A downgrade or double-execution', async () => {
    // Rust publisher succeeds
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        body: { cancel: () => Promise.resolve() },
        bodyUsed: false,
      } as any)
    ) as any;

    // JS local listener throws a runtime error
    mockEventBus.publish.mockRejectedValueOnce(new Error('Local JS database connection failure!'));

    const dualEventBus = new DualTrackEventBus(rustEventBusAdapter, mockEventBus);
    dualEventBus.setTrack('A');

    // Call publish: it must reject with the local JS error, propagate naturally, not downgrade Track A, and not execute JS again
    await expect(dualEventBus.publish('my-event', { data: 123 })).rejects.toThrow(
      'Local JS database connection failure!'
    );

    expect(dualEventBus.getCurrentTrack()).toBe('A'); // No downgrade!
    expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // No double execution!
  });

  it('VULN-003: should prevent thundering herds on concurrent failures by immediately tripping currentTrack state', async () => {
    // Simulate Rust event publish crashing/hanging
    global.fetch = jest.fn(() => {
      return Promise.reject(new Error('Rust event daemon connection timeout'));
    }) as any;

    const dualEventBus = new DualTrackEventBus(rustEventBusAdapter, mockEventBus);
    dualEventBus.setTrack('A');

    // Trigger 5 concurrent publishes
    await Promise.all([
      dualEventBus.publish('event-1', {}),
      dualEventBus.publish('event-2', {}),
      dualEventBus.publish('event-3', {}),
      dualEventBus.publish('event-4', {}),
      dualEventBus.publish('event-5', {}),
    ]);

    // Subsequent non-concurrent calls should immediately bypass and go straight to Track B without fetch
    jest.clearAllMocks();
    await dualEventBus.publish('event-6', {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(dualEventBus.getCurrentTrack()).toBe('B');
  });

  it('VULN-004: should support auto-recovery to Track A after cooldown period if Rust server becomes healthy again', async () => {
    // 1. Rust server is currently down
    global.fetch = jest.fn(() => Promise.reject(new Error('Connection refused'))) as any;

    const dualEventBus = new DualTrackEventBus(rustEventBusAdapter, mockEventBus);
    dualEventBus.setTrack('A');
    dualEventBus.cooldownMs = 50; // set short cooldown for testing

    // First publish fails and downgrades to Track B
    await dualEventBus.publish('test-event', {});
    expect(dualEventBus.getCurrentTrack()).toBe('B');

    // Immediately calling publish again should bypass Track A because cooldown has not elapsed
    jest.clearAllMocks();
    await dualEventBus.publish('test-event', {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(dualEventBus.getCurrentTrack()).toBe('B');

    // 2. Rust server recovers
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: { cancel: () => Promise.resolve() },
        bodyUsed: false,
      } as any)
    ) as any;

    // Wait for cooldown to expire (> 50ms)
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Next publish should trigger health check, see healthy Rust server, and recover to Track A
    jest.clearAllMocks();
    await dualEventBus.publish('test-event', {});
    expect(dualEventBus.getCurrentTrack()).toBe('A');
    expect(mockEventBus.publish).toHaveBeenCalledTimes(1); // fallback still executed as part of standard delivery in Track A
  });
});
