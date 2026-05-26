/**
 * Hook Flags Unit Tests
 * TASK-E16-02: Hook Profile 分层
 *
 * Covers:
 * - Profile validation and parsing
 * - Environment variable handling
 * - shouldRunHook decision logic
 * - Hook filtering
 * - Debug logging
 * - Predefined hooks
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import {
  // Types
  type HookProfile,
  type HookDefinition,
  type HookContext,
  type HookOptions,
  // Constants
  VALID_PROFILES,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_HOOKS,
  CATEGORY_PROFILE_MAPPING,
  // Core functions
  getHookProfile,
  getDisabledHooks,
  isDebugEnabled,
  getHookContext,
  isValidProfile,
  parseProfile,
  shouldRunHook,
  filterEnabledHooks,
  getHooksForProfile,
  // Hook definition helpers
  defineHook,
  defineSecurityHook,
  defineQualityHook,
  defineStrictHook,
  // Debug logging
  logDebug,
  logHookStart,
  logHookEnd,
  logHookSkip,
  // Summary
  getProfileSummary,
  // Predefined hooks
  SECURITY_HOOKS,
  QUALITY_HOOKS,
  STRICT_HOOKS,
  ALL_PREDEFINED_HOOKS,
} from '../../../src/hooks/hook-flags.js';

describe('HookFlags', () => {
  // Save original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.EKET_HOOK_PROFILE;
    delete process.env.EKET_DISABLED_HOOKS;
    delete process.env.EKET_HOOK_DEBUG;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('Profile Validation', () => {
    it('should have correct valid profiles', () => {
      expect(VALID_PROFILES).toEqual(['minimal', 'standard', 'strict']);
    });

    it('should validate minimal profile', () => {
      expect(isValidProfile('minimal')).toBe(true);
    });

    it('should validate standard profile', () => {
      expect(isValidProfile('standard')).toBe(true);
    });

    it('should validate strict profile', () => {
      expect(isValidProfile('strict')).toBe(true);
    });

    it('should reject invalid profiles', () => {
      expect(isValidProfile('fast')).toBe(false);
      expect(isValidProfile('debug')).toBe(false);
      expect(isValidProfile('default')).toBe(false);
      expect(isValidProfile('invalid')).toBe(false);
      expect(isValidProfile('')).toBe(false);
    });

    it('should parse valid profile', () => {
      expect(parseProfile('minimal')).toBe('minimal');
      expect(parseProfile('STANDARD')).toBe('standard');
      expect(parseProfile('Strict')).toBe('strict');
    });

    it('should return fallback for invalid profile', () => {
      expect(parseProfile('invalid')).toBe('standard');
      expect(parseProfile('invalid', 'minimal')).toBe('minimal');
      expect(parseProfile(undefined)).toBe('standard');
      expect(parseProfile('')).toBe('standard');
    });
  });

  describe('Environment Variables', () => {
    describe('EKET_HOOK_PROFILE', () => {
      it('should return default profile when not set', () => {
        expect(getHookProfile()).toBe('standard');
        expect(DEFAULT_PROFILE).toBe('standard');
      });

      it('should return minimal profile when set', () => {
        process.env.EKET_HOOK_PROFILE = 'minimal';
        expect(getHookProfile()).toBe('minimal');
      });

      it('should return strict profile when set', () => {
        process.env.EKET_HOOK_PROFILE = 'strict';
        expect(getHookProfile()).toBe('strict');
      });

      it('should handle case-insensitive profile', () => {
        process.env.EKET_HOOK_PROFILE = 'MINIMAL';
        expect(getHookProfile()).toBe('minimal');

        process.env.EKET_HOOK_PROFILE = 'Standard';
        expect(getHookProfile()).toBe('standard');
      });

      it('should fallback to default for invalid profile', () => {
        process.env.EKET_HOOK_PROFILE = 'invalid';
        expect(getHookProfile()).toBe('standard');
      });
    });

    describe('EKET_DISABLED_HOOKS', () => {
      it('should return empty array when not set', () => {
        expect(getDisabledHooks()).toEqual([]);
      });

      it('should return empty array for empty string', () => {
        process.env.EKET_DISABLED_HOOKS = '';
        expect(getDisabledHooks()).toEqual([]);

        process.env.EKET_DISABLED_HOOKS = '   ';
        expect(getDisabledHooks()).toEqual([]);
      });

      it('should parse single hook', () => {
        process.env.EKET_DISABLED_HOOKS = 'fact-forcing';
        expect(getDisabledHooks()).toEqual(['fact-forcing']);
      });

      it('should parse multiple hooks', () => {
        process.env.EKET_DISABLED_HOOKS = 'fact-forcing,pr-size';
        expect(getDisabledHooks()).toEqual(['fact-forcing', 'pr-size']);
      });

      it('should trim whitespace', () => {
        process.env.EKET_DISABLED_HOOKS = ' fact-forcing , pr-size ';
        expect(getDisabledHooks()).toEqual(['fact-forcing', 'pr-size']);
      });

      it('should normalize to lowercase', () => {
        process.env.EKET_DISABLED_HOOKS = 'Fact-Forcing,PR-SIZE';
        expect(getDisabledHooks()).toEqual(['fact-forcing', 'pr-size']);
      });

      it('should filter empty entries', () => {
        process.env.EKET_DISABLED_HOOKS = 'hook1,,hook2,';
        expect(getDisabledHooks()).toEqual(['hook1', 'hook2']);
      });
    });

    describe('EKET_HOOK_DEBUG', () => {
      it('should return false when not set', () => {
        expect(isDebugEnabled()).toBe(false);
      });

      it('should return true for "true"', () => {
        process.env.EKET_HOOK_DEBUG = 'true';
        expect(isDebugEnabled()).toBe(true);
      });

      it('should return true for "1"', () => {
        process.env.EKET_HOOK_DEBUG = '1';
        expect(isDebugEnabled()).toBe(true);
      });

      it('should return false for other values', () => {
        process.env.EKET_HOOK_DEBUG = 'false';
        expect(isDebugEnabled()).toBe(false);

        process.env.EKET_HOOK_DEBUG = '0';
        expect(isDebugEnabled()).toBe(false);

        process.env.EKET_HOOK_DEBUG = 'yes';
        expect(isDebugEnabled()).toBe(false);
      });
    });

    describe('getHookContext', () => {
      it('should combine all env vars into context', () => {
        process.env.EKET_HOOK_PROFILE = 'strict';
        process.env.EKET_DISABLED_HOOKS = 'hook1,hook2';
        process.env.EKET_HOOK_DEBUG = 'true';

        const ctx = getHookContext();
        expect(ctx.profile).toBe('strict');
        expect(ctx.disabledHooks).toEqual(['hook1', 'hook2']);
        expect(ctx.debug).toBe(true);
      });

      it('should return defaults when env not set', () => {
        const ctx = getHookContext();
        expect(ctx.profile).toBe('standard');
        expect(ctx.disabledHooks).toEqual([]);
        expect(ctx.debug).toBe(false);
      });
    });
  });

  describe('shouldRunHook', () => {
    const securityHookOptions: HookOptions = {
      profiles: ['minimal', 'standard', 'strict'],
    };

    const qualityHookOptions: HookOptions = {
      profiles: ['standard', 'strict'],
    };

    const strictHookOptions: HookOptions = {
      profiles: ['strict'],
    };

    describe('Profile-based filtering', () => {
      it('should run security hooks in minimal profile', () => {
        process.env.EKET_HOOK_PROFILE = 'minimal';
        expect(shouldRunHook('secret-scan', securityHookOptions)).toBe(true);
      });

      it('should NOT run quality hooks in minimal profile', () => {
        process.env.EKET_HOOK_PROFILE = 'minimal';
        expect(shouldRunHook('fact-forcing', qualityHookOptions)).toBe(false);
      });

      it('should run security hooks in standard profile', () => {
        process.env.EKET_HOOK_PROFILE = 'standard';
        expect(shouldRunHook('secret-scan', securityHookOptions)).toBe(true);
      });

      it('should run quality hooks in standard profile', () => {
        process.env.EKET_HOOK_PROFILE = 'standard';
        expect(shouldRunHook('fact-forcing', qualityHookOptions)).toBe(true);
      });

      it('should NOT run strict hooks in standard profile', () => {
        process.env.EKET_HOOK_PROFILE = 'standard';
        expect(shouldRunHook('lint-check', strictHookOptions)).toBe(false);
      });

      it('should run all hooks in strict profile', () => {
        process.env.EKET_HOOK_PROFILE = 'strict';
        expect(shouldRunHook('secret-scan', securityHookOptions)).toBe(true);
        expect(shouldRunHook('fact-forcing', qualityHookOptions)).toBe(true);
        expect(shouldRunHook('lint-check', strictHookOptions)).toBe(true);
      });
    });

    describe('Disabled hooks', () => {
      it('should NOT run explicitly disabled hook', () => {
        process.env.EKET_HOOK_PROFILE = 'strict';
        process.env.EKET_DISABLED_HOOKS = 'fact-forcing';

        expect(shouldRunHook('fact-forcing', qualityHookOptions)).toBe(false);
      });

      it('should run non-disabled hooks', () => {
        process.env.EKET_HOOK_PROFILE = 'strict';
        process.env.EKET_DISABLED_HOOKS = 'fact-forcing';

        expect(shouldRunHook('secret-scan', securityHookOptions)).toBe(true);
        expect(shouldRunHook('pr-size-check', qualityHookOptions)).toBe(true);
      });

      it('should handle case-insensitive hook IDs', () => {
        process.env.EKET_DISABLED_HOOKS = 'FACT-FORCING';
        expect(shouldRunHook('fact-forcing', qualityHookOptions)).toBe(false);
        expect(shouldRunHook('Fact-Forcing', qualityHookOptions)).toBe(false);
      });
    });

    describe('Custom context', () => {
      it('should use provided context instead of env', () => {
        // Set env to strict
        process.env.EKET_HOOK_PROFILE = 'strict';

        // But provide minimal context
        const ctx: HookContext = {
          profile: 'minimal',
          disabledHooks: [],
          debug: false,
        };

        expect(shouldRunHook('fact-forcing', qualityHookOptions, ctx)).toBe(false);
      });

      it('should respect disabled hooks in custom context', () => {
        const ctx: HookContext = {
          profile: 'strict',
          disabledHooks: ['secret-scan'],
          debug: false,
        };

        expect(shouldRunHook('secret-scan', securityHookOptions, ctx)).toBe(false);
      });
    });
  });

  describe('filterEnabledHooks', () => {
    const testHooks: HookDefinition[] = [
      { id: 'security-hook', profiles: ['minimal', 'standard', 'strict'] },
      { id: 'quality-hook', profiles: ['standard', 'strict'] },
      { id: 'strict-hook', profiles: ['strict'] },
    ];

    it('should filter to minimal hooks', () => {
      const ctx: HookContext = { profile: 'minimal', disabledHooks: [], debug: false };
      const enabled = filterEnabledHooks(testHooks, ctx);

      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe('security-hook');
    });

    it('should filter to standard hooks', () => {
      const ctx: HookContext = { profile: 'standard', disabledHooks: [], debug: false };
      const enabled = filterEnabledHooks(testHooks, ctx);

      expect(enabled.length).toBe(2);
      expect(enabled.map((h) => h.id)).toEqual(['security-hook', 'quality-hook']);
    });

    it('should filter to strict hooks', () => {
      const ctx: HookContext = { profile: 'strict', disabledHooks: [], debug: false };
      const enabled = filterEnabledHooks(testHooks, ctx);

      expect(enabled.length).toBe(3);
    });

    it('should exclude disabled hooks', () => {
      const ctx: HookContext = {
        profile: 'strict',
        disabledHooks: ['quality-hook'],
        debug: false,
      };
      const enabled = filterEnabledHooks(testHooks, ctx);

      expect(enabled.length).toBe(2);
      expect(enabled.map((h) => h.id)).toEqual(['security-hook', 'strict-hook']);
    });

    it('should use env context when not provided', () => {
      process.env.EKET_HOOK_PROFILE = 'minimal';
      const enabled = filterEnabledHooks(testHooks);

      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe('security-hook');
    });
  });

  describe('getHooksForProfile', () => {
    const testHooks: HookDefinition[] = [
      { id: 'hook-a', profiles: ['minimal', 'standard', 'strict'] },
      { id: 'hook-b', profiles: ['standard', 'strict'] },
      { id: 'hook-c', profiles: ['strict'] },
    ];

    it('should get minimal hooks', () => {
      const hooks = getHooksForProfile('minimal', testHooks);
      expect(hooks.map((h) => h.id)).toEqual(['hook-a']);
    });

    it('should get standard hooks', () => {
      const hooks = getHooksForProfile('standard', testHooks);
      expect(hooks.map((h) => h.id)).toEqual(['hook-a', 'hook-b']);
    });

    it('should get strict hooks', () => {
      const hooks = getHooksForProfile('strict', testHooks);
      expect(hooks.map((h) => h.id)).toEqual(['hook-a', 'hook-b', 'hook-c']);
    });
  });

  describe('Hook Definition Helpers', () => {
    describe('defineHook', () => {
      it('should create hook with defaults', () => {
        const hook = defineHook('my-hook');
        expect(hook.id).toBe('my-hook');
        expect(hook.name).toBe('my-hook');
        expect(hook.category).toBe('custom');
        expect(hook.profiles).toEqual(['strict']); // custom category -> strict only
      });

      it('should normalize ID to lowercase', () => {
        const hook = defineHook('My-Hook');
        expect(hook.id).toBe('my-hook');
      });

      it('should use provided options', () => {
        const hook = defineHook('my-hook', {
          name: 'My Hook',
          category: 'quality',
          description: 'Test hook',
          profiles: ['standard', 'strict'],
        });

        expect(hook.name).toBe('My Hook');
        expect(hook.category).toBe('quality');
        expect(hook.description).toBe('Test hook');
        expect(hook.profiles).toEqual(['standard', 'strict']);
      });

      it('should infer profiles from category', () => {
        const securityHook = defineHook('hook', { category: 'security' });
        expect(securityHook.profiles).toEqual(['minimal', 'standard', 'strict']);

        const qualityHook = defineHook('hook', { category: 'quality' });
        expect(qualityHook.profiles).toEqual(['standard', 'strict']);

        const perfHook = defineHook('hook', { category: 'performance' });
        expect(perfHook.profiles).toEqual(['strict']);
      });
    });

    describe('defineSecurityHook', () => {
      it('should create security hook running in all profiles', () => {
        const hook = defineSecurityHook('my-security-hook');
        expect(hook.category).toBe('security');
        expect(hook.profiles).toEqual(['minimal', 'standard', 'strict']);
      });
    });

    describe('defineQualityHook', () => {
      it('should create quality hook running in standard+strict', () => {
        const hook = defineQualityHook('my-quality-hook');
        expect(hook.category).toBe('quality');
        expect(hook.profiles).toEqual(['standard', 'strict']);
      });
    });

    describe('defineStrictHook', () => {
      it('should create strict-only hook', () => {
        const hook = defineStrictHook('my-strict-hook');
        expect(hook.profiles).toEqual(['strict']);
      });

      it('should allow category override', () => {
        const hook = defineStrictHook('my-strict-hook', { category: 'audit' });
        expect(hook.category).toBe('audit');
        expect(hook.profiles).toEqual(['strict']);
      });
    });
  });

  describe('Default Profile Hooks', () => {
    it('should have correct minimal hooks', () => {
      expect(DEFAULT_PROFILE_HOOKS.minimal).toContain('secret-scan');
      expect(DEFAULT_PROFILE_HOOKS.minimal.length).toBe(1);
    });

    it('should have correct standard hooks', () => {
      expect(DEFAULT_PROFILE_HOOKS.standard).toContain('secret-scan');
      expect(DEFAULT_PROFILE_HOOKS.standard).toContain('fact-forcing');
      expect(DEFAULT_PROFILE_HOOKS.standard).toContain('pr-size-check');
    });

    it('should have correct strict hooks', () => {
      expect(DEFAULT_PROFILE_HOOKS.strict).toContain('secret-scan');
      expect(DEFAULT_PROFILE_HOOKS.strict).toContain('lint-check');
      expect(DEFAULT_PROFILE_HOOKS.strict).toContain('test-coverage');
      expect(DEFAULT_PROFILE_HOOKS.strict.length).toBeGreaterThan(
        DEFAULT_PROFILE_HOOKS.standard.length
      );
    });
  });

  describe('Category Profile Mapping', () => {
    it('should map security to all profiles', () => {
      expect(CATEGORY_PROFILE_MAPPING.security).toEqual(['minimal', 'standard', 'strict']);
    });

    it('should map quality to standard+strict', () => {
      expect(CATEGORY_PROFILE_MAPPING.quality).toEqual(['standard', 'strict']);
    });

    it('should map performance to strict only', () => {
      expect(CATEGORY_PROFILE_MAPPING.performance).toEqual(['strict']);
    });

    it('should map audit to standard+strict', () => {
      expect(CATEGORY_PROFILE_MAPPING.audit).toEqual(['standard', 'strict']);
    });

    it('should map custom to strict only', () => {
      expect(CATEGORY_PROFILE_MAPPING.custom).toEqual(['strict']);
    });
  });

  describe('Predefined Hooks', () => {
    it('should have security hooks', () => {
      expect(SECURITY_HOOKS.length).toBeGreaterThan(0);
      expect(SECURITY_HOOKS[0].id).toBe('secret-scan');
      expect(SECURITY_HOOKS[0].profiles).toEqual(['minimal', 'standard', 'strict']);
    });

    it('should have quality hooks', () => {
      expect(QUALITY_HOOKS.length).toBeGreaterThan(0);
      const ids = QUALITY_HOOKS.map((h) => h.id);
      expect(ids).toContain('fact-forcing');
      expect(ids).toContain('pr-size-check');
    });

    it('should have strict hooks', () => {
      expect(STRICT_HOOKS.length).toBeGreaterThan(0);
      const ids = STRICT_HOOKS.map((h) => h.id);
      expect(ids).toContain('lint-check');
      expect(ids).toContain('test-coverage');
    });

    it('should combine all hooks', () => {
      expect(ALL_PREDEFINED_HOOKS.length).toBe(
        SECURITY_HOOKS.length + QUALITY_HOOKS.length + STRICT_HOOKS.length
      );
    });
  });

  describe('Profile Summary', () => {
    it('should return current profile info', () => {
      process.env.EKET_HOOK_PROFILE = 'minimal';
      process.env.EKET_HOOK_DEBUG = 'true';
      process.env.EKET_DISABLED_HOOKS = 'hook1,hook2';

      const summary = getProfileSummary();

      expect(summary.profile).toBe('minimal');
      expect(summary.debug).toBe(true);
      expect(summary.disabledHooks).toEqual(['hook1', 'hook2']);
    });

    it('should count enabled/disabled hooks when provided', () => {
      process.env.EKET_HOOK_PROFILE = 'minimal';

      const summary = getProfileSummary(ALL_PREDEFINED_HOOKS);

      expect(summary.enabledCount).toBe(1); // Only security hooks in minimal
      expect(summary.disabledCount).toBe(ALL_PREDEFINED_HOOKS.length - 1);
    });
  });

  describe('Debug Logging', () => {
    let consoleSpy: ReturnType<typeof import('@jest/globals').jest.spyOn>;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', () => {
      process.env.EKET_HOOK_DEBUG = 'false';

      logDebug('test message');
      logHookStart('test-hook');
      logHookEnd('test-hook', 100);
      logHookSkip('test-hook', 'reason');

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log when debug is enabled', () => {
      process.env.EKET_HOOK_DEBUG = 'true';

      const ctx = getHookContext();
      logDebug('test message', undefined, ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[HOOK:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test message'));
    });

    it('should include hook ID in log prefix', () => {
      process.env.EKET_HOOK_DEBUG = 'true';

      const ctx = getHookContext();
      logDebug('test', 'my-hook', ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(':my-hook]'));
    });

    it('should log hook start/end', () => {
      process.env.EKET_HOOK_DEBUG = 'true';

      const ctx = getHookContext();
      logHookStart('test-hook', ctx);
      logHookEnd('test-hook', 50, ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Executing'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Completed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('50ms'));
    });

    it('should log hook skip with reason', () => {
      process.env.EKET_HOOK_DEBUG = 'true';

      const ctx = getHookContext();
      logHookSkip('test-hook', 'not needed', ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not needed'));
    });
  });

  describe('Integration: Full Profile Switching', () => {
    it('should correctly filter hooks across all profiles', () => {
      const hooks = ALL_PREDEFINED_HOOKS;

      // Minimal
      let ctx: HookContext = { profile: 'minimal', disabledHooks: [], debug: false };
      let enabled = filterEnabledHooks(hooks, ctx);
      expect(enabled.every((h) => h.profiles.includes('minimal'))).toBe(true);
      expect(enabled.length).toBe(1);

      // Standard
      ctx = { profile: 'standard', disabledHooks: [], debug: false };
      enabled = filterEnabledHooks(hooks, ctx);
      expect(enabled.every((h) => h.profiles.includes('standard'))).toBe(true);
      expect(enabled.length).toBe(3); // security + quality

      // Strict
      ctx = { profile: 'strict', disabledHooks: [], debug: false };
      enabled = filterEnabledHooks(hooks, ctx);
      expect(enabled.length).toBe(hooks.length);
    });

    it('should respect disabled hooks across profiles', () => {
      const hooks = ALL_PREDEFINED_HOOKS;
      const ctx: HookContext = {
        profile: 'strict',
        disabledHooks: ['secret-scan', 'lint-check'],
        debug: false,
      };

      const enabled = filterEnabledHooks(hooks, ctx);

      expect(enabled.some((h) => h.id === 'secret-scan')).toBe(false);
      expect(enabled.some((h) => h.id === 'lint-check')).toBe(false);
      expect(enabled.some((h) => h.id === 'fact-forcing')).toBe(true);
    });
  });
});
