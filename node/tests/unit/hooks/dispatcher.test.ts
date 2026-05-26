/**
 * Dispatcher Tests
 * TASK-E16-04
 */

import {
  Check,
  CheckContext,
  CheckResult,
  HookDispatcher,
  checkRegistry,
  createDispatcher,
  createGroupDispatcher,
} from '../../../src/hooks/dispatcher.js';
import type { HookProfile } from '../../../src/hooks/hook-flags.js';
import {
  BashInput,
  PathTraversalCheck,
  DangerousCommandCheck,
  SensitivePathCheck,
  CommandInjectionCheck,
  ResourceLimitCheck,
  createPreBashDispatcher,
  checkBashCommand,
  registerBashChecks,
  BASH_CHECKS_GROUP,
} from '../../../src/hooks/pre-bash-dispatcher.js';

// ============================================================================
// Mock Checks for Testing
// ============================================================================

class PassingCheck implements Check<string> {
  readonly id = 'test.passing';
  readonly name = 'Passing Check';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];

  async execute(): Promise<CheckResult> {
    return { passed: true };
  }
}

class FailingCheck implements Check<string> {
  readonly id = 'test.failing';
  readonly name = 'Failing Check';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];

  async execute(): Promise<CheckResult> {
    return { passed: false, reason: 'Test failure' };
  }
}

class SlowCheck implements Check<string> {
  readonly id = 'test.slow';
  readonly name = 'Slow Check';
  readonly profiles: HookProfile[] = ['strict']; // Only in strict mode

  async execute(): Promise<CheckResult> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { passed: true };
  }
}

class ModifyingCheck implements Check<string> {
  readonly id = 'test.modifying';
  readonly name = 'Modifying Check';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];

  async execute(ctx: CheckContext<string>): Promise<CheckResult> {
    return {
      passed: true,
      modifiedInput: ctx.input.toUpperCase(),
    };
  }
}

class ThrowingCheck implements Check<string> {
  readonly id = 'test.throwing';
  readonly name = 'Throwing Check';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];

  async execute(): Promise<CheckResult> {
    throw new Error('Check exploded');
  }
}

// ============================================================================
// Dispatcher Core Tests
// ============================================================================

describe('HookDispatcher', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    checkRegistry.clear();
    // Reset environment for each test
    process.env = { ...originalEnv };
    delete process.env.EKET_HOOK_PROFILE;
    delete process.env.EKET_DISABLED_HOOKS;
    delete process.env.EKET_HOOK_DEBUG;
  });

  afterEach(() => {
    checkRegistry.clear();
    process.env = originalEnv;
  });

  describe('Basic Execution', () => {
    it('should execute all passing checks', async () => {
      const dispatcher = createDispatcher<string>();
      dispatcher.addCheck(new PassingCheck());

      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.allPassed).toBe(true);
      expect(result.executed).toContain('test.passing');
      expect(result.skipped).toHaveLength(0);
    });

    it('should stop on first failure when configured', async () => {
      const dispatcher = createDispatcher<string>({ stopOnFirstFailure: true });
      dispatcher.addCheck(new FailingCheck());
      dispatcher.addCheck(new PassingCheck());

      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe('test.failing');
      expect(result.executed).toContain('test.failing');
      expect(result.executed).not.toContain('test.passing');
    });

    it('should continue after failure when stopOnFirstFailure is false', async () => {
      const dispatcher = createDispatcher<string>({ stopOnFirstFailure: false });
      dispatcher.addCheck(new FailingCheck());
      dispatcher.addCheck(new PassingCheck());

      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.allPassed).toBe(false);
      expect(result.executed).toContain('test.failing');
      expect(result.executed).toContain('test.passing');
    });

    it('should handle check that throws exception', async () => {
      const dispatcher = createDispatcher<string>({ stopOnFirstFailure: true });
      dispatcher.addCheck(new ThrowingCheck());

      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe('test.throwing');
      const failedResult = result.results.get('test.throwing');
      expect(failedResult?.reason).toContain('threw error');
    });

    it('should track modified input through checks', async () => {
      const dispatcher = createDispatcher<string>({ stopOnFirstFailure: false });
      dispatcher.addCheck(new ModifyingCheck());

      const result = await dispatcher.dispatch({ input: 'hello' });

      expect(result.allPassed).toBe(true);
      expect(result.finalInput).toBe('HELLO');
    });
  });

  describe('Profile Filtering', () => {
    beforeEach(() => {
      checkRegistry.register(new PassingCheck(), 'test-group');
      checkRegistry.register(new SlowCheck(), 'test-group');
    });

    it('should skip strict-only checks in standard profile', async () => {
      process.env.EKET_HOOK_PROFILE = 'standard';

      const dispatcher = createGroupDispatcher<string>('test-group');
      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.executed).toContain('test.passing');
      expect(result.skipped).toContain('test.slow'); // strict-only
    });

    it('should run all checks in strict profile', async () => {
      process.env.EKET_HOOK_PROFILE = 'strict';

      const dispatcher = createGroupDispatcher<string>('test-group');
      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.executed).toContain('test.passing');
      expect(result.executed).toContain('test.slow');
      expect(result.skipped).toHaveLength(0);
    });

    it('should respect EKET_DISABLED_HOOKS config', async () => {
      process.env.EKET_HOOK_PROFILE = 'strict';
      process.env.EKET_DISABLED_HOOKS = 'test.passing';

      const dispatcher = createGroupDispatcher<string>('test-group');
      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.skipped).toContain('test.passing');
      expect(result.executed).toContain('test.slow');
    });
  });

  describe('Parallel Execution', () => {
    it('should execute checks in parallel when configured', async () => {
      process.env.EKET_HOOK_PROFILE = 'strict';

      const dispatcher = createDispatcher<string>({ parallel: true });
      dispatcher.addCheck(new SlowCheck());
      dispatcher.addCheck(new PassingCheck());

      const startTime = Date.now();
      const result = await dispatcher.dispatch({ input: 'test' });
      const duration = Date.now() - startTime;

      expect(result.allPassed).toBe(true);
      // 并行执行应该比串行快
      expect(duration).toBeLessThan(150); // SlowCheck is 100ms
    });
  });

  describe('Timeout', () => {
    it('should timeout slow checks', async () => {
      const verySlowCheck: Check<string> = {
        id: 'test.very-slow',
        name: 'Very Slow Check',
        profiles: ['minimal', 'standard', 'strict'],
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { passed: true };
        },
      };

      const dispatcher = createDispatcher<string>({ timeoutMs: 50 });
      dispatcher.addCheck(verySlowCheck);

      const result = await dispatcher.dispatch({ input: 'test' });

      expect(result.allPassed).toBe(false);
      const failedResult = result.results.get('test.very-slow');
      expect(failedResult?.reason).toContain('timed out');
    });
  });
});

// ============================================================================
// Check Registry Tests
// ============================================================================

describe('CheckRegistry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    checkRegistry.clear();
    process.env = { ...originalEnv };
    delete process.env.EKET_HOOK_PROFILE;
    delete process.env.EKET_DISABLED_HOOKS;
  });

  afterEach(() => {
    checkRegistry.clear();
    process.env = originalEnv;
  });

  it('should register and retrieve checks', () => {
    const check = new PassingCheck();
    checkRegistry.register(check, 'my-group');

    expect(checkRegistry.get('test.passing')).toBe(check);
    expect(checkRegistry.getGroup('my-group')).toContain('test.passing');
  });

  it('should handle multiple groups', () => {
    const check1 = new PassingCheck();
    const check2 = new FailingCheck();

    checkRegistry.register(check1, 'group-a');
    checkRegistry.register(check2, 'group-b');

    expect(checkRegistry.getGroup('group-a')).toContain('test.passing');
    expect(checkRegistry.getGroup('group-b')).toContain('test.failing');
    expect(checkRegistry.getAllIds()).toContain('test.passing');
    expect(checkRegistry.getAllIds()).toContain('test.failing');
  });

  it('should return enabled checks based on profile', () => {
    checkRegistry.register(new PassingCheck(), 'test-group'); // minimal/standard/strict
    checkRegistry.register(new SlowCheck(), 'test-group'); // strict only

    process.env.EKET_HOOK_PROFILE = 'minimal';
    const enabledChecks = checkRegistry.getEnabledChecks('test-group');

    // Only PassingCheck should be enabled in minimal profile
    expect(enabledChecks).toHaveLength(1);
    expect(enabledChecks[0].id).toBe('test.passing');
  });
});

// ============================================================================
// Pre-Bash Dispatcher Tests
// ============================================================================

describe('PreBashDispatcher', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    checkRegistry.clear();
    process.env = { ...originalEnv };
    delete process.env.EKET_HOOK_PROFILE;
    delete process.env.EKET_DISABLED_HOOKS;
  });

  afterEach(() => {
    checkRegistry.clear();
    process.env = originalEnv;
  });

  describe('PathTraversalCheck', () => {
    it('should detect path traversal in command', async () => {
      const check = new PathTraversalCheck();
      const result = await check.execute({
        input: { command: 'cat ../../../etc/passwd' },
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Path traversal');
    });

    it('should detect sensitive path access', async () => {
      const check = new PathTraversalCheck();
      const result = await check.execute({
        input: { command: 'cat /etc/passwd' },
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('sensitive path');
    });

    it('should pass safe commands', async () => {
      const check = new PathTraversalCheck();
      const result = await check.execute({
        input: { command: 'ls -la /tmp' },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('DangerousCommandCheck', () => {
    it('should detect rm -rf /', async () => {
      const check = new DangerousCommandCheck();
      const result = await check.execute({
        input: { command: 'rm -rf /' },
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Recursive delete');
    });

    it('should detect mkfs', async () => {
      const check = new DangerousCommandCheck();
      const result = await check.execute({
        input: { command: 'mkfs.ext4 /dev/sda1' },
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Filesystem format');
    });

    it('should detect fork bomb', async () => {
      const check = new DangerousCommandCheck();
      const result = await check.execute({
        input: { command: ':(){ :|:& };:' },
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Fork bomb');
    });

    it('should pass normal rm commands', async () => {
      const check = new DangerousCommandCheck();
      const result = await check.execute({
        input: { command: 'rm -rf ./temp' },
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('CommandInjectionCheck', () => {
    it('should warn about pipe commands', async () => {
      const check = new CommandInjectionCheck();
      const result = await check.execute({
        input: { command: 'cat file | grep pattern' },
      });

      expect(result.passed).toBe(true); // 只警告，不失败
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('Pipe to another command');
    });

    it('should warn about command substitution', async () => {
      const check = new CommandInjectionCheck();
      const result = await check.execute({
        input: { command: 'echo $(whoami)' },
      });

      expect(result.passed).toBe(true);
      expect(result.warnings).toContain('Command substitution');
    });
  });

  describe('Full Dispatcher', () => {
    it('should run all bash checks', async () => {
      process.env.EKET_HOOK_PROFILE = 'strict';
      const dispatcher = createPreBashDispatcher();

      const result = await dispatcher.dispatch({
        input: { command: 'ls -la /tmp' },
      });

      expect(result.allPassed).toBe(true);
      expect(result.executed.length).toBeGreaterThan(0);
    });

    it('should fail on dangerous command', async () => {
      process.env.EKET_HOOK_PROFILE = 'strict';
      const dispatcher = createPreBashDispatcher();

      const result = await dispatcher.dispatch({
        input: { command: 'rm -rf /' },
      });

      expect(result.allPassed).toBe(false);
      expect(result.firstFailure).toBe('bash.dangerous-command');
    });

    it('should skip strict-only checks in minimal profile', async () => {
      process.env.EKET_HOOK_PROFILE = 'minimal';
      const dispatcher = createPreBashDispatcher();

      const result = await dispatcher.dispatch({
        input: { command: 'ls -la' },
      });

      // resource-limit is strict-only, should be skipped in minimal mode
      expect(result.skipped).toContain('bash.resource-limit');
    });
  });

  describe('checkBashCommand Convenience Function', () => {
    it('should return allowed for safe commands', async () => {
      const result = await checkBashCommand('ls -la /tmp');

      expect(result.allowed).toBe(true);
    });

    it('should return not allowed for dangerous commands', async () => {
      const result = await checkBashCommand('rm -rf /');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should return warnings for suspicious commands', async () => {
      const result = await checkBashCommand('cat file | grep pattern');

      expect(result.allowed).toBe(true);
      expect(result.warnings).toBeDefined();
    });
  });
});

// ============================================================================
// Hook Flags Tests
// ============================================================================

describe('HookFlags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EKET_HOOK_PROFILE;
    delete process.env.EKET_DISABLED_HOOKS;
    delete process.env.EKET_HOOK_DEBUG;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should get default profile when env not set', async () => {
    const { getHookProfile } = await import('../../../src/hooks/hook-flags.js');
    expect(getHookProfile()).toBe('standard');
  });

  it('should respect EKET_HOOK_PROFILE env var', async () => {
    process.env.EKET_HOOK_PROFILE = 'strict';
    // Re-import to pick up new env
    const { getHookProfile } = await import('../../../src/hooks/hook-flags.js');
    expect(getHookProfile()).toBe('strict');
  });

  it('should get disabled hooks from env', async () => {
    process.env.EKET_DISABLED_HOOKS = 'hook1, hook2, hook3';
    const { getDisabledHooks } = await import('../../../src/hooks/hook-flags.js');
    expect(getDisabledHooks()).toEqual(['hook1', 'hook2', 'hook3']);
  });
});
