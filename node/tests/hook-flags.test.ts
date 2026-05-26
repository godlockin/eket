/**
 * EKET Framework - Hook Flags Tests
 *
 * Tests for hook-flags.ts module:
 * - Profile validation
 * - Invalid profile warning behavior
 * - Hook execution context
 * - Profile-based hook filtering
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getHookProfile,
  getDisabledHooks,
  isDebugEnabled,
  getHookContext,
  isValidProfile,
  parseProfile,
  shouldRunHook,
  filterEnabledHooks,
  defineHook,
  defineSecurityHook,
  defineQualityHook,
  defineStrictHook,
  DEFAULT_PROFILE,
  VALID_PROFILES,
  type HookProfile,
  type HookDefinition,
} from '../src/hooks/hook-flags.js';

describe('hook-flags module', () => {
  // Store original env values
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original env values
    originalEnv.EKET_HOOK_PROFILE = process.env.EKET_HOOK_PROFILE;
    originalEnv.EKET_DISABLED_HOOKS = process.env.EKET_DISABLED_HOOKS;
    originalEnv.EKET_HOOK_DEBUG = process.env.EKET_HOOK_DEBUG;

    // Clear env vars for clean test state
    delete process.env.EKET_HOOK_PROFILE;
    delete process.env.EKET_DISABLED_HOOKS;
    delete process.env.EKET_HOOK_DEBUG;
  });

  afterEach(() => {
    // Restore original env values
    if (originalEnv.EKET_HOOK_PROFILE === undefined) {
      delete process.env.EKET_HOOK_PROFILE;
    } else {
      process.env.EKET_HOOK_PROFILE = originalEnv.EKET_HOOK_PROFILE;
    }

    if (originalEnv.EKET_DISABLED_HOOKS === undefined) {
      delete process.env.EKET_DISABLED_HOOKS;
    } else {
      process.env.EKET_DISABLED_HOOKS = originalEnv.EKET_DISABLED_HOOKS;
    }

    if (originalEnv.EKET_HOOK_DEBUG === undefined) {
      delete process.env.EKET_HOOK_DEBUG;
    } else {
      process.env.EKET_HOOK_DEBUG = originalEnv.EKET_HOOK_DEBUG;
    }

    jest.restoreAllMocks();
  });

  describe('getHookProfile', () => {
    it('should return default profile when env not set', () => {
      const profile = getHookProfile();
      expect(profile).toBe(DEFAULT_PROFILE);
    });

    it('should return valid profile from env', () => {
      process.env.EKET_HOOK_PROFILE = 'strict';
      const profile = getHookProfile();
      expect(profile).toBe('strict');
    });

    it('should return valid profile case-insensitively', () => {
      process.env.EKET_HOOK_PROFILE = 'MINIMAL';
      const profile = getHookProfile();
      expect(profile).toBe('minimal');
    });

    it('should return default profile for invalid value', () => {
      process.env.EKET_HOOK_PROFILE = 'invalid_profile';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const profile = getHookProfile();

      expect(profile).toBe(DEFAULT_PROFILE);
      warnSpy.mockRestore();
    });
  });

  describe('invalid profile warning', () => {
    it('should warn for invalid profile in non-debug mode', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.EKET_HOOK_PROFILE = 'invalid_profile';
      delete process.env.EKET_HOOK_DEBUG;

      const profile = getHookProfile();

      expect(profile).toBe('standard');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid EKET_HOOK_PROFILE')
      );
      warnSpy.mockRestore();
    });

    it('should warn for invalid profile in debug mode', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.EKET_HOOK_PROFILE = 'bogus_value';
      process.env.EKET_HOOK_DEBUG = 'true';

      const profile = getHookProfile();

      expect(profile).toBe('standard');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid EKET_HOOK_PROFILE="bogus_value"')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Valid values: minimal, standard, strict')
      );
      warnSpy.mockRestore();
    });

    it('should not warn when profile is valid', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.EKET_HOOK_PROFILE = 'strict';

      const profile = getHookProfile();

      expect(profile).toBe('strict');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should not warn when profile env is not set', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      delete process.env.EKET_HOOK_PROFILE;

      const profile = getHookProfile();

      expect(profile).toBe('standard');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('getDisabledHooks', () => {
    it('should return empty array when env not set', () => {
      const disabled = getDisabledHooks();
      expect(disabled).toEqual([]);
    });

    it('should parse comma-separated hooks', () => {
      process.env.EKET_DISABLED_HOOKS = 'hook1,hook2,hook3';
      const disabled = getDisabledHooks();
      expect(disabled).toEqual(['hook1', 'hook2', 'hook3']);
    });

    it('should trim whitespace and normalize case', () => {
      process.env.EKET_DISABLED_HOOKS = '  HOOK1 , hook2 , Hook3  ';
      const disabled = getDisabledHooks();
      expect(disabled).toEqual(['hook1', 'hook2', 'hook3']);
    });

    it('should filter empty entries', () => {
      process.env.EKET_DISABLED_HOOKS = 'hook1,,hook2, ,hook3';
      const disabled = getDisabledHooks();
      expect(disabled).toEqual(['hook1', 'hook2', 'hook3']);
    });
  });

  describe('isDebugEnabled', () => {
    it('should return false when env not set', () => {
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
    });
  });

  describe('isValidProfile', () => {
    it('should validate minimal', () => {
      expect(isValidProfile('minimal')).toBe(true);
    });

    it('should validate standard', () => {
      expect(isValidProfile('standard')).toBe(true);
    });

    it('should validate strict', () => {
      expect(isValidProfile('strict')).toBe(true);
    });

    it('should reject invalid profiles', () => {
      expect(isValidProfile('invalid')).toBe(false);
      expect(isValidProfile('MINIMAL')).toBe(false); // case-sensitive
      expect(isValidProfile('')).toBe(false);
    });
  });

  describe('parseProfile', () => {
    it('should parse valid profile', () => {
      expect(parseProfile('minimal')).toBe('minimal');
      expect(parseProfile('standard')).toBe('standard');
      expect(parseProfile('strict')).toBe('strict');
    });

    it('should normalize case', () => {
      expect(parseProfile('MINIMAL')).toBe('minimal');
      expect(parseProfile('Standard')).toBe('standard');
    });

    it('should return fallback for invalid input', () => {
      expect(parseProfile('invalid')).toBe(DEFAULT_PROFILE);
      expect(parseProfile(undefined)).toBe(DEFAULT_PROFILE);
    });

    it('should use custom fallback', () => {
      expect(parseProfile('invalid', 'strict')).toBe('strict');
    });
  });

  describe('shouldRunHook', () => {
    it('should run hook when profile matches', () => {
      const context = {
        profile: 'standard' as HookProfile,
        disabledHooks: [],
        debug: false,
      };

      const result = shouldRunHook('test-hook', { profiles: ['standard', 'strict'] }, context);
      expect(result).toBe(true);
    });

    it('should not run hook when profile does not match', () => {
      const context = {
        profile: 'minimal' as HookProfile,
        disabledHooks: [],
        debug: false,
      };

      const result = shouldRunHook('test-hook', { profiles: ['standard', 'strict'] }, context);
      expect(result).toBe(false);
    });

    it('should not run hook when explicitly disabled', () => {
      const context = {
        profile: 'strict' as HookProfile,
        disabledHooks: ['test-hook'],
        debug: false,
      };

      const result = shouldRunHook('test-hook', { profiles: ['minimal', 'standard', 'strict'] }, context);
      expect(result).toBe(false);
    });
  });

  describe('hook definition helpers', () => {
    it('defineHook should create hook with defaults', () => {
      const hook = defineHook('my-hook');
      expect(hook.id).toBe('my-hook');
      expect(hook.category).toBe('custom');
      expect(hook.profiles).toContain('strict');
    });

    it('defineSecurityHook should run in all profiles', () => {
      const hook = defineSecurityHook('secret-scan');
      expect(hook.profiles).toEqual(['minimal', 'standard', 'strict']);
      expect(hook.category).toBe('security');
    });

    it('defineQualityHook should run in standard and strict', () => {
      const hook = defineQualityHook('lint-check');
      expect(hook.profiles).toEqual(['standard', 'strict']);
      expect(hook.category).toBe('quality');
    });

    it('defineStrictHook should run in strict only', () => {
      const hook = defineStrictHook('full-audit');
      expect(hook.profiles).toEqual(['strict']);
    });
  });

  describe('filterEnabledHooks', () => {
    const testHooks: HookDefinition[] = [
      defineSecurityHook('security-1'),
      defineQualityHook('quality-1'),
      defineStrictHook('strict-1'),
    ];

    it('should filter hooks for minimal profile', () => {
      const context = {
        profile: 'minimal' as HookProfile,
        disabledHooks: [],
        debug: false,
      };

      const enabled = filterEnabledHooks(testHooks, context);
      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe('security-1');
    });

    it('should filter hooks for standard profile', () => {
      const context = {
        profile: 'standard' as HookProfile,
        disabledHooks: [],
        debug: false,
      };

      const enabled = filterEnabledHooks(testHooks, context);
      expect(enabled.length).toBe(2);
      expect(enabled.map(h => h.id)).toEqual(['security-1', 'quality-1']);
    });

    it('should filter hooks for strict profile', () => {
      const context = {
        profile: 'strict' as HookProfile,
        disabledHooks: [],
        debug: false,
      };

      const enabled = filterEnabledHooks(testHooks, context);
      expect(enabled.length).toBe(3);
    });

    it('should respect disabled hooks list', () => {
      const context = {
        profile: 'strict' as HookProfile,
        disabledHooks: ['security-1', 'strict-1'],
        debug: false,
      };

      const enabled = filterEnabledHooks(testHooks, context);
      expect(enabled.length).toBe(1);
      expect(enabled[0].id).toBe('quality-1');
    });
  });
});
