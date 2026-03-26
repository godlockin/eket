/**
 * EKET Framework - Circuit Breaker & Retry Mechanism
 * Phase 7: 错误恢复和性能优化
 *
 * 断路器模式：
 * - 失败次数超过阈值 → 打开断路器
 * - 断路器打开时快速失败
 * - 半开状态尝试恢复
 *
 * 自动重试机制：
 * - 指数退避策略
 * - 仅重试可恢复错误
 * - 最大重试次数限制
 */

import type { Result } from '../types/index.js';
import { EketError } from '../types/index.js';

/**
 * 断路器状态
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * 断路器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;    // 失败阈值
  successThreshold: number;    // 成功阈值（半开状态）
  timeout: number;             // 断路器超时（毫秒）
  monitorTimeout: number;      // 监控窗口（毫秒）
}

/**
 * 断路器统计
 */
export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  openedAt?: number;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;          // 最大重试次数
  initialDelay: number;        // 初始延迟（毫秒）
  maxDelay: number;            // 最大延迟（毫秒）
  multiplier: number;          // 延迟倍乘因子
  retryableErrors?: string[];  // 可重试的错误码
}

/**
 * 断路器类
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private openedAt?: number;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 30000,
      monitorTimeout: config.monitorTimeout || 60000,
    };
  }

  /**
   * 执行受保护的操作
   */
  async execute<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    // 检查是否可以执行
    if (!this.canExecute()) {
      return {
        success: false,
        error: new EketError(
          'CIRCUIT_OPEN',
          `Circuit breaker is open, failing fast`
        ),
      };
    }

    try {
      const result = await operation();

      if (result.success) {
        this.onSuccess();
      } else {
        this.onFailure();
      }

      return result;
    } catch (err) {
      this.onFailure();
      return {
        success: false,
        error: err instanceof Error ? new EketError('EXECUTION_ERROR', err.message) : new EketError('UNKNOWN_ERROR', 'Unknown error'),
      };
    }
  }

  /**
   * 检查是否可以执行操作
   */
  private canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // 检查是否超时
      if (this.openedAt && Date.now() - this.openedAt >= this.config.timeout) {
        this.state = 'half_open';
        console.log('[CircuitBreaker] Transitioned to half_open');
        return true;
      }
      return false;
    }

    // half_open 状态允许执行
    return true;
  }

  /**
   * 处理成功
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'half_open') {
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    }
  }

  /**
   * 处理失败
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // 半开状态失败，立即打开断路器
      this.open();
    } else if (this.failures >= this.config.failureThreshold) {
      // 达到失败阈值，打开断路器
      this.open();
    }
  }

  /**
   * 打开断路器
   */
  private open(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.successes = 0;
    console.warn(`[CircuitBreaker] Circuit opened after ${this.failures} failures`);
  }

  /**
   * 重置断路器
   */
  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.openedAt = undefined;
    console.log('[CircuitBreaker] Circuit reset');
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 获取统计信息
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
    };
  }

  /**
   * 强制重置（用于测试）
   */
  forceReset(): void {
    this.reset();
  }
}

/**
 * 带断路器的重试执行器
 */
export class RetryExecutor {
  private config: RetryConfig;
  private circuitBreaker: CircuitBreaker;

  constructor(
    retryConfig: Partial<RetryConfig> = {},
    circuitConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      maxRetries: retryConfig.maxRetries || 3,
      initialDelay: retryConfig.initialDelay || 1000,
      maxDelay: retryConfig.maxDelay || 30000,
      multiplier: retryConfig.multiplier || 2,
      retryableErrors: retryConfig.retryableErrors || [
        'REDIS_CONNECTION_FAILED',
        'REDIS_OPERATION_FAILED',
        'MESSAGE_QUEUE_ERROR',
        'PROTOCOL_NOT_CONNECTED',
        'TIMEOUT_ERROR',
      ],
    };
    this.circuitBreaker = new CircuitBreaker(circuitConfig);
  }

  /**
   * 执行带重试和断路器的操作
   */
  async execute<T>(
    operation: () => Promise<Result<T>>,
    context?: string
  ): Promise<Result<T>> {
    let lastError: Error | null = null;
    let delay = this.config.initialDelay;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // 通过断路器执行
      const circuitResult = await this.circuitBreaker.execute(operation);

      if (circuitResult.success) {
        return circuitResult;
      }

      // 检查是否可重试
      const errorCode = circuitResult.error?.code || 'UNKNOWN_ERROR';
      if (!this.isRetryableError(errorCode)) {
        // 不可重试的错误，直接返回
        return circuitResult;
      }

      lastError = circuitResult.error as unknown as Error;

      if (attempt < this.config.maxRetries) {
        // 等待后重试（指数退避）
        const jitter = Math.random() * 0.3 * delay; // 添加 30% 随机抖动
        const waitTime = Math.min(delay + jitter, this.config.maxDelay);

        console.warn(
          `[RetryExecutor] Attempt ${attempt + 1} failed (${errorCode}), ` +
          `retrying in ${Math.round(waitTime)}ms${context ? `: ${context}` : ''}`
        );

        await this.sleep(waitTime);
        delay *= this.config.multiplier; // 指数退避
      }
    }

    // 所有重试失败
    return {
      success: false,
      error: new EketError(
        'MAX_RETRIES_EXCEEDED',
        `Failed after ${this.config.maxRetries} retries: ${lastError?.message}`
      ),
    };
  }

  /**
   * 检查错误是否可重试
   */
  private isRetryableError(errorCode: string): boolean {
    if (!this.config.retryableErrors) {
      return true; // 未配置时默认都可重试
    }
    return this.config.retryableErrors.includes(errorCode);
  }

  /**
   * 延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取断路器统计
   */
  getCircuitStats(): CircuitStats {
    return this.circuitBreaker.getStats();
  }

  /**
   * 重置断路器
   */
  resetCircuit(): void {
    this.circuitBreaker.forceReset();
  }
}

/**
 * 创建默认重试执行器
 */
export function createRetryExecutor(
  retryConfig?: Partial<RetryConfig>,
  circuitConfig?: Partial<CircuitBreakerConfig>
): RetryExecutor {
  return new RetryExecutor(retryConfig, circuitConfig);
}
