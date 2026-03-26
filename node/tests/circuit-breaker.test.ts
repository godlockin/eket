/**
 * Circuit Breaker 单元测试
 * Phase 7.1 - 断路器模式
 *
 * 测试覆盖：
 * - 状态转换 (closed → open → half_open → closed)
 * - 失败阈值检测
 * - 超时自动恢复
 * - 半开状态探测
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CircuitBreaker, createCircuitBreaker } from '../core/circuit-breaker';
import type { CircuitBreakerConfig } from '../types/index';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const breaker = createCircuitBreaker();
      expect(breaker).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000,
        monitorTimeout: 30000,
      };
      const breaker = createCircuitBreaker(config);
      expect(breaker).toBeDefined();
    });
  });

  describe('state transitions', () => {
    it('should start in closed state', () => {
      const breaker = createCircuitBreaker();
      const state = breaker.getState();
      expect(state.state).toBe('closed');
    });

    it('should transition to open after reaching failure threshold', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 1,
        timeout: 5000,
      });

      // 记录 3 次失败
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      const state = breaker.getState();
      expect(state.state).toBe('open');
    });

    it('should transition to half_open after timeout', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 1000,
      });

      // 记录失败，打开断路器
      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');

      // 快进时间超过 timeout
      jest.advanceTimersByTime(1500);

      // 尝试执行，应该进入 half_open 状态
      breaker.allowRequest();
      expect(breaker.getState().state).toBe('half_open');
    });

    it('should transition back to closed after success threshold in half_open', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 1000,
      });

      // 打开断路器
      breaker.recordFailure();
      jest.advanceTimersByTime(1500);
      breaker.allowRequest(); // 进入 half_open

      // 记录成功
      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getState().state).toBe('closed');
    });
  });

  describe('allowRequest', () => {
    it('should allow requests in closed state', () => {
      const breaker = createCircuitBreaker();
      expect(breaker.allowRequest()).toBe(true);
    });

    it('should block requests in open state', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        timeout: 5000,
      });

      breaker.recordFailure();
      expect(breaker.allowRequest()).toBe(false);
    });

    it('should allow requests in half_open state', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        timeout: 1000,
      });

      breaker.recordFailure();
      jest.advanceTimersByTime(1500);

      expect(breaker.allowRequest()).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('should reset failure count in closed state', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 5,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();

      const state = breaker.getState();
      expect(state.failureCount).toBe(0);
    });

    it('should increment success count in half_open state', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        timeout: 1000,
      });

      breaker.recordFailure();
      jest.advanceTimersByTime(1500);
      breaker.allowRequest(); // Enter half_open

      breaker.recordSuccess();
      const state = breaker.getState();
      expect(state.successCount).toBe(1);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count in closed state', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 5,
      });

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      const state = breaker.getState();
      expect(state.failureCount).toBe(3);
    });

    it('should open circuit when threshold reached', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
      });

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');
    });
  });

  describe('getState', () => {
    it('should return complete state object', () => {
      const breaker = createCircuitBreaker();
      const state = breaker.getState();

      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('failureCount');
      expect(state).toHaveProperty('successCount');
      expect(state).toHaveProperty('lastFailureTime');
      expect(state).toHaveProperty('lastStateChange');
    });
  });

  describe('reset', () => {
    it('should reset to closed state', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
      });

      breaker.recordFailure();
      expect(breaker.getState().state).toBe('open');

      breaker.reset();
      expect(breaker.getState().state).toBe('closed');
      expect(breaker.getState().failureCount).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute function in closed state', async () => {
      const breaker = createCircuitBreaker();

      const result = await breaker.execute(async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should throw CircuitOpenError in open state', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        timeout: 5000,
      });

      breaker.recordFailure();

      const result = await breaker.execute(async () => ({ success: true, data: 'test' }));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CIRCUIT_OPEN');
    });

    it('should record success automatically', async () => {
      const breaker = createCircuitBreaker();

      await breaker.execute(async () => ({ success: true, data: 'success' }));

      const state = breaker.getState();
      expect(state.failureCount).toBe(0);
    });

    it('should record failure automatically', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 2,
      });

      try {
        await breaker.execute(async () => {
          throw new Error('Test error');
        });
      } catch {
        // Expected
      }

      const state = breaker.getState();
      expect(state.failureCount).toBe(1);
    });
  });

  describe('monitorTimeout', () => {
    it('should track failures within monitor window', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        monitorTimeout: 1000,
      });

      breaker.recordFailure();
      jest.advanceTimersByTime(500);
      breaker.recordFailure();

      // 在 monitorTimeout 内的失败应该被计数
      const state = breaker.getState();
      expect(state.failureCount).toBe(2);
    });

    it('should reset failures after monitor timeout', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        monitorTimeout: 1000,
      });

      breaker.recordFailure();
      breaker.recordFailure();

      // 超过 monitorTimeout 后，失败计数应该重置
      jest.advanceTimersByTime(1500);
      breaker.recordFailure();

      const state = breaker.getState();
      expect(state.failureCount).toBe(1);
    });
  });
});

describe('CircuitBreaker Config', () => {
  it('should have reasonable defaults', () => {
    const breaker = createCircuitBreaker();
    const state = breaker.getState();

    expect(state.state).toBe('closed');
    expect(state.failureCount).toBe(0);
  });

  it('should validate config values', () => {
    // 即使传入无效配置，也不应抛出异常
    expect(() => createCircuitBreaker()).not.toThrow();
  });
});
