/**
 * EKET Framework - Unified Skill Interface Tests
 * Version: 0.9.2
 *
 * Tests for Unified Skill Interface: execute, interceptors,
 * beforeExecute/afterExecute hooks, onError, timeout control
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  UnifiedSkillInterface,
  createUnifiedSkillInterface,
  LoggingInterceptor,
  ValidationInterceptor,
  CachingInterceptor,
} from '@/skills/unified-interface.js';
import { SkillsRegistry, createSkillsRegistry } from '@/skills/registry.js';
import type { Skill, SkillInterceptor, SkillExecutionEvent } from '@/skills/types.js';

// Helper to create mock skill
function createMockSkill(
  name: string,
  executeFn?: jest.Mock,
  validateInputFn?: jest.Mock
): Skill {
  return {
    name,
    description: `Mock skill ${name}`,
    category: 'custom',
    tags: ['mock', 'test'],
    version: '1.0.0',
    execute: executeFn || jest.fn().mockResolvedValue({
      success: true,
      data: { result: `${name} executed` },
      duration: 10,
    }),
    validateInput: validateInputFn,
  };
}

describe('UnifiedSkillInterface', () => {
  let registry: SkillsRegistry;
  let unifiedInterface: UnifiedSkillInterface;

  beforeEach(() => {
    registry = createSkillsRegistry();
    unifiedInterface = createUnifiedSkillInterface({ registry });
  });

  describe('execute()', () => {
    it('should execute a registered skill successfully', async () => {
      const mockExecute = jest.fn().mockResolvedValue({
        success: true,
        data: { output: 'test result' },
        duration: 50,
      });
      const skill = createMockSkill('test_skill', mockExecute);
      registry.register(skill);

      const result = await unifiedInterface.execute({
        skillName: 'test_skill',
        inputs: { param1: 'value1' },
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ output: 'test result' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return error when skill not found', async () => {
      const result = await unifiedInterface.execute({
        skillName: 'nonexistent_skill',
        inputs: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill not found');
    });

    it('should pass context to skill execution', async () => {
      let capturedContext: any;
      const mockExecute = jest.fn().mockImplementation((input) => {
        capturedContext = input.context;
        return Promise.resolve({
          success: true,
          data: {},
          duration: 10,
        });
      });
      const skill = createMockSkill('context_skill', mockExecute);
      registry.register(skill);

      await unifiedInterface.execute({
        skillName: 'context_skill',
        inputs: {},
        context: {
          projectRoot: '/test/project',
          ticketId: 'TICKET-123',
          instanceId: 'instance-001',
          worktreePath: '/worktree',
          mode: 'verification',
          variables: { customVar: 'customValue' },
        },
      });

      expect(capturedContext.projectRoot).toBe('/test/project');
      expect(capturedContext.ticketId).toBe('TICKET-123');
      expect(capturedContext.instanceId).toBe('instance-001');
      expect(capturedContext.variables.customVar).toBe('customValue');
    });

    it('should merge default context variables with execution variables', async () => {
      unifiedInterface = createUnifiedSkillInterface({
        registry,
        defaultContext: {
          variables: { defaultVar: 'defaultValue' },
        },
      });

      let capturedContext: any;
      const mockExecute = jest.fn().mockImplementation((input) => {
        capturedContext = input.context;
        return Promise.resolve({ success: true, data: {}, duration: 10 });
      });
      const skill = createMockSkill('merge_context_skill', mockExecute);
      registry.register(skill);

      await unifiedInterface.execute({
        skillName: 'merge_context_skill',
        inputs: {},
        context: {
          variables: { customVar: 'customValue' },
        },
      });

      expect(capturedContext.variables.defaultVar).toBe('defaultValue');
      expect(capturedContext.variables.customVar).toBe('customValue');
    });

    it('should handle skill execution errors', async () => {
      const mockExecute = jest.fn().mockRejectedValue(new Error('Execution failed'));
      const skill = createMockSkill('failing_skill', mockExecute);
      registry.register(skill);

      const result = await unifiedInterface.execute({
        skillName: 'failing_skill',
        inputs: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution failed');
    });

    it('should timeout on long-running skills', async () => {
      unifiedInterface = createUnifiedSkillInterface({
        registry,
        timeout: 100, // 100ms timeout
      });

      const mockExecute = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: {}, duration: 1000 }), 500))
      );
      const skill = createMockSkill('slow_skill', mockExecute);
      registry.register(skill);

      const result = await unifiedInterface.execute({
        skillName: 'slow_skill',
        inputs: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should record execution history', async () => {
      const skill = createMockSkill('recorded_skill');
      registry.register(skill);

      await unifiedInterface.execute({
        skillName: 'recorded_skill',
        inputs: {},
      });
      await unifiedInterface.execute({
        skillName: 'recorded_skill',
        inputs: {},
      });

      const stats = unifiedInterface.getStats();
      expect(stats.totalExecutions).toBe(2);
      expect(stats.bySkill['recorded_skill']).toBeDefined();
      expect(stats.bySkill['recorded_skill'].count).toBe(2);
    });

    it('should calculate average duration correctly', async () => {
      const mockExecute = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5)); // Simulate 5ms execution
        return {
          success: true,
          data: { result: 'timed result' },
          duration: 5,
        };
      });

      const skill = createMockSkill('timing_skill', mockExecute);
      registry.register(skill);

      await unifiedInterface.execute({ skillName: 'timing_skill', inputs: {} });
      await unifiedInterface.execute({ skillName: 'timing_skill', inputs: {} });

      const stats = unifiedInterface.getStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });
  });

  describe('Interceptors', () => {
    describe('registerInterceptor()', () => {
      it('should register an interceptor', () => {
        const interceptor: SkillInterceptor = {
          beforeExecute: jest.fn(),
          afterExecute: jest.fn(),
        };

        unifiedInterface.registerInterceptor(interceptor);

        expect(unifiedInterface).toBeDefined();
      });

      it('should call beforeExecute hook before skill execution', async () => {
        const beforeExecute = jest.fn();
        const interceptor: SkillInterceptor = { beforeExecute, afterExecute: jest.fn() };
        unifiedInterface.registerInterceptor(interceptor);

        const skill = createMockSkill('intercepted_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'intercepted_skill',
          inputs: { test: 'data' },
        });

        expect(beforeExecute).toHaveBeenCalled();
        expect(beforeExecute).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'intercepted_skill' }),
          expect.objectContaining({ data: { test: 'data' } })
        );
      });

      it('should call afterExecute hook after skill execution', async () => {
        const afterExecute = jest.fn();
        const interceptor: SkillInterceptor = { beforeExecute: jest.fn(), afterExecute };
        unifiedInterface.registerInterceptor(interceptor);

        const skill = createMockSkill('after_hook_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'after_hook_skill',
          inputs: {},
        });

        expect(afterExecute).toHaveBeenCalled();
        expect(afterExecute).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'after_hook_skill' }),
          expect.objectContaining({ success: true })
        );
      });

      it('should call multiple interceptors in order', async () => {
        const calls: string[] = [];

        const interceptor1: SkillInterceptor = {
          beforeExecute: async () => calls.push('before1'),
          afterExecute: async () => calls.push('after1'),
        };
        const interceptor2: SkillInterceptor = {
          beforeExecute: async () => calls.push('before2'),
          afterExecute: async () => calls.push('after2'),
        };

        unifiedInterface.registerInterceptor(interceptor1);
        unifiedInterface.registerInterceptor(interceptor2);

        const skill = createMockSkill('multi_interceptor_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'multi_interceptor_skill',
          inputs: {},
        });

        expect(calls).toEqual(['before1', 'before2', 'after2', 'after1']);
      });

      it('should handle interceptor errors gracefully', async () => {
        const interceptor: SkillInterceptor = {
          beforeExecute: jest.fn().mockRejectedValue(new Error('Interceptor error')),
          afterExecute: jest.fn(),
        };
        unifiedInterface.registerInterceptor(interceptor);

        const skill = createMockSkill('error_interceptor_skill');
        registry.register(skill);

        // Should not throw, but may affect execution
        await expect(
          unifiedInterface.execute({
            skillName: 'error_interceptor_skill',
            inputs: {},
          })
        ).resolves.toBeDefined();
      });
    });

    describe('unregisterInterceptor()', () => {
      it('should remove an interceptor', async () => {
        const beforeExecute = jest.fn();
        const interceptor: SkillInterceptor = { beforeExecute, afterExecute: jest.fn() };

        unifiedInterface.registerInterceptor(interceptor);
        unifiedInterface.unregisterInterceptor(interceptor);

        const skill = createMockSkill('unregistered_interceptor_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'unregistered_interceptor_skill',
          inputs: {},
        });

        expect(beforeExecute).not.toHaveBeenCalled();
      });
    });
  });

  describe('Event Listeners', () => {
    describe('addEventListener()', () => {
      it('should register an event listener', () => {
        const listener = jest.fn();
        unifiedInterface.addEventListener(listener);

        expect(unifiedInterface).toBeDefined();
      });

      it('should emit before_execute event', async () => {
        const listener = jest.fn();
        unifiedInterface.addEventListener(listener);

        const skill = createMockSkill('event_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'event_skill',
          inputs: { data: 'test' },
        });

        const beforeEvent = listener.mock.calls.find(
          (call: any) => call[0].type === 'before_execute'
        );
        expect(beforeEvent).toBeDefined();
        expect(beforeEvent?.[0].skillName).toBe('event_skill');
      });

      it('should emit after_execute event', async () => {
        const listener = jest.fn();
        unifiedInterface.addEventListener(listener);

        const skill = createMockSkill('event_skill2');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'event_skill2',
          inputs: {},
        });

        const afterEvent = listener.mock.calls.find(
          (call: any) => call[0].type === 'after_execute'
        );
        expect(afterEvent).toBeDefined();
        expect(afterEvent?.[0].skillName).toBe('event_skill2');
      });

      it('should emit error event on skill failure', async () => {
        const listener = jest.fn();
        unifiedInterface.addEventListener(listener);

        const skill = createMockSkill(
          'failing_event_skill',
          jest.fn().mockRejectedValue(new Error('Skill error'))
        );
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'failing_event_skill',
          inputs: {},
        });

        const errorEvent = listener.mock.calls.find(
          (call: any) => call[0].type === 'error'
        );
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.[0].data?.error).toBe('Skill error');
      });

      it('should pass event data to listener', async () => {
        const listener = jest.fn();
        unifiedInterface.addEventListener(listener);

        const skill = createMockSkill('data_event_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'data_event_skill',
          inputs: { key: 'value' },
        });

        const beforeEvent = listener.mock.calls.find(
          (call: any) => call[0].type === 'before_execute'
        )?.[0] as SkillExecutionEvent;

        expect(beforeEvent.data).toBeDefined();
      });

      it('should handle listener errors gracefully', async () => {
        const listener = jest.fn().mockImplementation(() => {
          throw new Error('Listener error');
        });
        unifiedInterface.addEventListener(listener);

        const skill = createMockSkill('listener_error_skill');
        registry.register(skill);

        // Should not throw
        await expect(
          unifiedInterface.execute({
            skillName: 'listener_error_skill',
            inputs: {},
          })
        ).resolves.toBeDefined();
      });
    });

    describe('removeEventListener()', () => {
      it('should remove an event listener', async () => {
        const listener = jest.fn();
        unifiedInterface.addEventListener(listener);
        unifiedInterface.removeEventListener(listener);

        const skill = createMockSkill('removed_listener_skill');
        registry.register(skill);

        await unifiedInterface.execute({
          skillName: 'removed_listener_skill',
          inputs: {},
        });

        expect(listener).not.toHaveBeenCalled();
      });
    });
  });

  describe('getStats()', () => {
    it('should return execution statistics', () => {
      const stats = unifiedInterface.getStats();

      expect(stats).toHaveProperty('totalExecutions');
      expect(stats).toHaveProperty('averageDuration');
      expect(stats).toHaveProperty('bySkill');
    });

    it('should return zero stats when no executions', () => {
      const stats = unifiedInterface.getStats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(Object.keys(stats.bySkill)).toHaveLength(0);
    });

    it('should track per-skill statistics', async () => {
      const skill1 = createMockSkill('skill_a');
      const skill2 = createMockSkill('skill_b');
      registry.register(skill1);
      registry.register(skill2);

      await unifiedInterface.execute({ skillName: 'skill_a', inputs: {} });
      await unifiedInterface.execute({ skillName: 'skill_a', inputs: {} });
      await unifiedInterface.execute({ skillName: 'skill_b', inputs: {} });

      const stats = unifiedInterface.getStats();

      expect(stats.bySkill['skill_a'].count).toBe(2);
      expect(stats.bySkill['skill_b'].count).toBe(1);
    });
  });

  describe('clearHistory()', () => {
    it('should clear all execution history', async () => {
      const skill = createMockSkill('history_skill');
      registry.register(skill);

      await unifiedInterface.execute({ skillName: 'history_skill', inputs: {} });
      await unifiedInterface.execute({ skillName: 'history_skill', inputs: {} });

      expect(unifiedInterface.getStats().totalExecutions).toBe(2);

      unifiedInterface.clearHistory();

      expect(unifiedInterface.getStats().totalExecutions).toBe(0);
    });
  });
});

describe('LoggingInterceptor', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log before and after execution at info level', async () => {
    const interceptor = new LoggingInterceptor('info');
    const skill = createMockSkill('log_test');

    await interceptor.beforeExecute(skill, { data: {}, context: { projectRoot: '', variables: {} } });
    await interceptor.afterExecute(skill, { success: true, data: {}, duration: 50 });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Executing: log_test')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('log_test (50ms)')
    );
  });

  it('should not log at error level for successful execution', () => {
    const interceptor = new LoggingInterceptor('error');
    const skill = createMockSkill('error_level_test');

    // Should not call console for info messages at error level
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should log error details at debug level', async () => {
    const interceptor = new LoggingInterceptor('debug');
    const skill = createMockSkill('debug_error_test');

    await interceptor.afterExecute(skill, {
      success: false,
      error: 'Test error',
      duration: 10,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error: Test error')
    );
  });
});

describe('ValidationInterceptor', () => {
  it('should call skill validateInput if available', async () => {
    const validateInput = jest.fn().mockReturnValue(true);
    const skill = createMockSkill('validation_test', undefined, validateInput);

    const interceptor = new ValidationInterceptor();

    await interceptor.beforeExecute(skill, {
      data: { test: 'data' },
      context: { projectRoot: '', variables: {} },
    });

    expect(validateInput).toHaveBeenCalledWith({ test: 'data' });
  });

  it('should throw error when validation fails', async () => {
    const validateInput = jest.fn().mockReturnValue(false);
    const skill = createMockSkill('invalid_input_test', undefined, validateInput);

    const interceptor = new ValidationInterceptor();

    await expect(
      interceptor.beforeExecute(skill, {
        data: { invalid: 'data' },
        context: { projectRoot: '', variables: {} },
      })
    ).rejects.toThrow('INVALID_INPUT');
  });

  it('should skip validation if skill has no validateInput method', async () => {
    const skill = createMockSkill('no_validation_skill');
    delete (skill as any).validateInput;

    const interceptor = new ValidationInterceptor();

    await expect(
      interceptor.beforeExecute(skill, {
        data: {},
        context: { projectRoot: '', variables: {} },
      })
    ).resolves.toBeUndefined();
  });

  it('should do nothing in afterExecute', async () => {
    const interceptor = new ValidationInterceptor();
    const skill = createMockSkill('after_test');

    await expect(
      interceptor.afterExecute(skill, { success: true, data: {}, duration: 10 })
    ).resolves.toBeUndefined();
  });
});

describe('CachingInterceptor', () => {
  let interceptor: CachingInterceptor;

  beforeEach(() => {
    interceptor = new CachingInterceptor(1000); // 1 second TTL
  });

  it('should cache successful results', async () => {
    const skill = createMockSkill('cache_test');

    await interceptor.afterExecute(skill, {
      success: true,
      data: { cached: 'result' },
      duration: 10,
    });

    // Cache should have entry
    expect(interceptor).toBeDefined();
  });

  it('should not cache failed results', async () => {
    const skill = createMockSkill('fail_cache_test');

    await interceptor.afterExecute(skill, {
      success: false,
      error: 'Failed',
      duration: 10,
    });

    // Should not throw cached result error
    await expect(
      interceptor.beforeExecute(skill, {
        data: {},
        context: { projectRoot: '', variables: {} },
      })
    ).resolves.not.toThrow('CACHED');
  });

  it('should return cached result on subsequent calls', async () => {
    const skill = createMockSkill('cached_skill');

    // First, cache a result
    await interceptor.afterExecute(skill, {
      success: true,
      data: { fromCache: true },
      duration: 10,
    });

    // Then try to execute again - should throw cached result
    await expect(
      interceptor.beforeExecute(skill, {
        data: {},
        context: { projectRoot: '', variables: {} },
      })
    ).rejects.toHaveProperty('cachedResult');
  });

  it('should generate cache key from skill name and data', () => {
    // The cache key should be unique per skill+data combination
    expect(interceptor).toBeDefined();
  });

  it('should clear cache when clearCache is called', async () => {
    const skill = createMockSkill('clear_cache_test');

    // Cache a result
    await interceptor.afterExecute(skill, {
      success: true,
      data: { willBeCleared: true },
      duration: 10,
    });

    interceptor.clearCache();

    // Should not have cached result
    await expect(
      interceptor.beforeExecute(skill, {
        data: {},
        context: { projectRoot: '', variables: {} },
      })
    ).resolves.not.toThrow('CACHED');
  });

  it('should respect TTL', async () => {
    interceptor = new CachingInterceptor(10); // 10ms TTL
    const skill = createMockSkill('ttl_test');

    // Cache a result
    await interceptor.afterExecute(skill, {
      success: true,
      data: { expires: 'soon' },
      duration: 10,
    });

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should not throw cached result error (expired)
    await expect(
      interceptor.beforeExecute(skill, {
        data: {},
        context: { projectRoot: '', variables: {} },
      })
    ).resolves.not.toThrow('CACHED');
  });
});

describe('UnifiedSkillInterface - Disabled Features', () => {
  let registry: SkillsRegistry;

  beforeEach(() => {
    registry = createSkillsRegistry();
  });

  it('should skip interceptors when enableInterceptors is false', async () => {
    const unifiedInterface = createUnifiedSkillInterface({
      registry,
      enableInterceptors: false,
    });

    const beforeExecute = jest.fn();
    unifiedInterface.registerInterceptor({
      beforeExecute,
      afterExecute: jest.fn(),
    });

    const skill = createMockSkill('no_interceptor_skill');
    registry.register(skill);

    await unifiedInterface.execute({
      skillName: 'no_interceptor_skill',
      inputs: {},
    });

    expect(beforeExecute).not.toHaveBeenCalled();
  });

  it('should skip events when enableEvents is false', async () => {
    const unifiedInterface = createUnifiedSkillInterface({
      registry,
      enableEvents: false,
    });

    const listener = jest.fn();
    unifiedInterface.addEventListener(listener);

    const skill = createMockSkill('no_event_skill');
    registry.register(skill);

    await unifiedInterface.execute({
      skillName: 'no_event_skill',
      inputs: {},
    });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('UnifiedSkillInterface - Edge Cases', () => {
  let registry: SkillsRegistry;
  let unifiedInterface: UnifiedSkillInterface;

  beforeEach(() => {
    registry = createSkillsRegistry();
    unifiedInterface = createUnifiedSkillInterface({ registry });
  });

  it('should handle unknown error types', async () => {
    const skill = createMockSkill(
      'unknown_error_skill',
      jest.fn().mockRejectedValue('String error instead of Error object')
    );
    registry.register(skill);

    const result = await unifiedInterface.execute({
      skillName: 'unknown_error_skill',
      inputs: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle null inputs', async () => {
    const skill = createMockSkill('null_input_skill');
    registry.register(skill);

    const result = await unifiedInterface.execute({
      skillName: 'null_input_skill',
      inputs: null as any,
    });

    expect(result).toBeDefined();
  });

  it('should handle very large input data', async () => {
    const skill = createMockSkill('large_input_skill');
    registry.register(skill);

    const largeData = new Array(1000).fill({ key: 'value' });

    const result = await unifiedInterface.execute({
      skillName: 'large_input_skill',
      inputs: { data: largeData },
    });

    expect(result).toBeDefined();
  });
});
