/**
 * Hook Profile Flags Module
 *
 * Implements three-tier hook profiles for environment-specific configuration.
 * Inspired by ECC's hook profile mechanism.
 *
 * Environment Variables:
 * - EKET_HOOK_PROFILE: minimal|standard|strict (default: standard)
 * - EKET_DISABLED_HOOKS: comma-separated list of hook IDs to disable
 * - EKET_HOOK_DEBUG: true|1 to enable debug logging
 *
 * @module HookFlags
 * @see TASK-E16-02
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Hook profile levels
 * - minimal: safety hooks only (fastest dev/debug)
 * - standard: safety + quality gates (default)
 * - strict: all hooks (PR/release)
 */
export type HookProfile = 'minimal' | 'standard' | 'strict';

/**
 * Hook definition with profile requirements
 */
export interface HookDefinition {
  /** Unique hook identifier */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Profiles where this hook is enabled */
  profiles: HookProfile[];
  /** Hook category for organization */
  category?: 'security' | 'quality' | 'performance' | 'audit' | 'custom';
  /** Hook description */
  description?: string;
}

/**
 * Options for shouldRunHook check
 */
export interface HookOptions {
  /** Profiles where this hook should run */
  profiles: HookProfile[];
  /** Optional category override */
  category?: HookDefinition['category'];
}

/**
 * Hook execution context
 */
export interface HookContext {
  /** Current profile */
  profile: HookProfile;
  /** Disabled hooks list */
  disabledHooks: string[];
  /** Debug mode enabled */
  debug: boolean;
}

// ============================================================================
// Legacy Types (backward compatibility)
// ============================================================================

/** @deprecated Use HookProfile instead */
export type CheckPriority = 'critical' | 'high' | 'normal' | 'low';

/** @deprecated Use HookContext instead */
export interface ProfileConfig {
  enabledPriorities: CheckPriority[];
  forceEnable?: string[];
  forceDisable?: string[];
  verbose?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default hooks per profile
 */
export const DEFAULT_PROFILE_HOOKS: Record<HookProfile, string[]> = {
  minimal: ['secret-scan'],
  standard: ['secret-scan', 'fact-forcing', 'pr-size-check'],
  strict: [
    'secret-scan',
    'fact-forcing',
    'pr-size-check',
    'lint-check',
    'test-coverage',
    'security-audit',
    'dependency-check',
  ],
};

/**
 * Hook category to profile mapping
 */
export const CATEGORY_PROFILE_MAPPING: Record<
  NonNullable<HookDefinition['category']>,
  HookProfile[]
> = {
  security: ['minimal', 'standard', 'strict'],
  quality: ['standard', 'strict'],
  performance: ['strict'],
  audit: ['standard', 'strict'],
  custom: ['strict'],
};

/**
 * Valid profile values
 */
export const VALID_PROFILES: readonly HookProfile[] = ['minimal', 'standard', 'strict'] as const;

/**
 * Default profile when not specified
 */
export const DEFAULT_PROFILE: HookProfile = 'standard';

/** @deprecated Legacy profile configs for backward compatibility */
export const DEFAULT_PROFILE_CONFIGS: Record<string, ProfileConfig> = {
  default: { enabledPriorities: ['critical', 'high', 'normal'], verbose: false },
  fast: { enabledPriorities: ['critical', 'high'], verbose: false },
  strict: { enabledPriorities: ['critical', 'high', 'normal', 'low'], verbose: false },
  debug: { enabledPriorities: ['critical', 'high', 'normal', 'low'], verbose: true },
};

// ============================================================================
// Environment Variable Helpers
// ============================================================================

/**
 * Get current hook profile from environment
 * Priority: EKET_HOOK_PROFILE env var > default 'standard'
 */
export function getHookProfile(): HookProfile {
  const envProfile = process.env.EKET_HOOK_PROFILE?.toLowerCase();

  if (envProfile && isValidProfile(envProfile)) {
    return envProfile;
  }

  if (envProfile && isDebugEnabled()) {
    // Use console.log directly to avoid recursion
    console.log(`[HOOK:${DEFAULT_PROFILE}] Invalid profile "${envProfile}", falling back to "${DEFAULT_PROFILE}"`);
  }

  return DEFAULT_PROFILE;
}

/**
 * Get list of disabled hooks from environment
 * Parses EKET_DISABLED_HOOKS as comma-separated list
 */
export function getDisabledHooks(): string[] {
  const envDisabled = process.env.EKET_DISABLED_HOOKS;

  if (!envDisabled || envDisabled.trim() === '') {
    return [];
  }

  return envDisabled
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  const envDebug = process.env.EKET_HOOK_DEBUG;
  return envDebug === 'true' || envDebug === '1';
}

/**
 * Get full hook context from environment
 */
export function getHookContext(): HookContext {
  return {
    profile: getHookProfile(),
    disabledHooks: getDisabledHooks(),
    debug: isDebugEnabled(),
  };
}

// ============================================================================
// Profile Validation
// ============================================================================

/**
 * Validate if a string is a valid profile
 */
export function isValidProfile(value: string): value is HookProfile {
  return VALID_PROFILES.includes(value as HookProfile);
}

/**
 * Parse profile from string with fallback
 */
export function parseProfile(
  value: string | undefined,
  fallback: HookProfile = DEFAULT_PROFILE
): HookProfile {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return isValidProfile(normalized) ? normalized : fallback;
}

// ============================================================================
// Core Hook Decision Logic
// ============================================================================

/**
 * Determine if a hook should run based on current context
 *
 * Decision flow:
 * 1. Check if hook is explicitly disabled via EKET_DISABLED_HOOKS
 * 2. Check if current profile includes the hook
 *
 * @param hookId - Hook identifier
 * @param options - Hook configuration with allowed profiles
 * @param context - Optional context (defaults to environment context)
 * @returns Whether the hook should execute
 */
export function shouldRunHook(
  hookId: string,
  options: HookOptions,
  context?: HookContext
): boolean {
  const ctx = context ?? getHookContext();
  const normalizedHookId = hookId.toLowerCase();

  // Step 1: Check disabled list
  if (ctx.disabledHooks.includes(normalizedHookId)) {
    logDebug(`Hook "${hookId}" is explicitly disabled`, hookId, ctx);
    return false;
  }

  // Step 2: Check profile inclusion
  if (!options.profiles.includes(ctx.profile)) {
    logDebug(`Hook "${hookId}" not enabled for profile "${ctx.profile}"`, hookId, ctx);
    return false;
  }

  logDebug(`Hook "${hookId}" will run (profile: ${ctx.profile})`, hookId, ctx);
  return true;
}

/**
 * Filter hooks that should run in current context
 *
 * @param hooks - Array of hook definitions
 * @param context - Optional context (defaults to environment context)
 * @returns Filtered hooks that should run
 */
export function filterEnabledHooks<T extends HookDefinition>(
  hooks: T[],
  context?: HookContext
): T[] {
  const ctx = context ?? getHookContext();

  return hooks.filter((hook) => {
    return shouldRunHook(hook.id, { profiles: hook.profiles }, ctx);
  });
}

/**
 * Get hooks enabled for a specific profile
 *
 * @param profile - Target profile
 * @param hooks - Available hook definitions
 * @returns Hooks enabled for the profile
 */
export function getHooksForProfile<T extends HookDefinition>(profile: HookProfile, hooks: T[]): T[] {
  return hooks.filter((hook) => hook.profiles.includes(profile));
}

// ============================================================================
// Hook Registration Helpers
// ============================================================================

/**
 * Create a hook definition with defaults
 */
export function defineHook(
  id: string,
  options: Partial<Omit<HookDefinition, 'id'>> = {}
): HookDefinition {
  const category = options.category ?? 'custom';
  const profiles = options.profiles ?? CATEGORY_PROFILE_MAPPING[category];

  return {
    id: id.toLowerCase(),
    name: options.name ?? id,
    profiles,
    category,
    description: options.description,
  };
}

/**
 * Define a security hook (runs in all profiles)
 */
export function defineSecurityHook(
  id: string,
  options: Partial<Omit<HookDefinition, 'id' | 'category' | 'profiles'>> = {}
): HookDefinition {
  return defineHook(id, {
    ...options,
    category: 'security',
    profiles: ['minimal', 'standard', 'strict'],
  });
}

/**
 * Define a quality hook (runs in standard and strict)
 */
export function defineQualityHook(
  id: string,
  options: Partial<Omit<HookDefinition, 'id' | 'category' | 'profiles'>> = {}
): HookDefinition {
  return defineHook(id, {
    ...options,
    category: 'quality',
    profiles: ['standard', 'strict'],
  });
}

/**
 * Define a strict-only hook
 */
export function defineStrictHook(
  id: string,
  options: Partial<Omit<HookDefinition, 'id' | 'profiles'>> = {}
): HookDefinition {
  return defineHook(id, {
    ...options,
    category: options.category ?? 'performance',
    profiles: ['strict'],
  });
}

// ============================================================================
// Debug Logging
// ============================================================================

/**
 * Log debug message if debug mode is enabled
 * Format: [HOOK:profile:hookId] message
 */
export function logDebug(message: string, hookId?: string, context?: HookContext): void {
  const ctx = context ?? getHookContext();
  if (!ctx.debug) return;

  const profile = ctx.profile;
  const prefix = hookId ? `[HOOK:${profile}:${hookId}]` : `[HOOK:${profile}]`;

  console.log(`${prefix} ${message}`);
}

/**
 * Log hook execution start
 */
export function logHookStart(hookId: string, context?: HookContext): void {
  logDebug('Executing...', hookId, context);
}

/**
 * Log hook execution end
 */
export function logHookEnd(hookId: string, durationMs?: number, context?: HookContext): void {
  const duration = durationMs !== undefined ? ` (${durationMs}ms)` : '';
  logDebug(`Completed${duration}`, hookId, context);
}

/**
 * Log hook skip
 */
export function logHookSkip(hookId: string, reason: string, context?: HookContext): void {
  logDebug(`Skipped: ${reason}`, hookId, context);
}

// ============================================================================
// Profile Summary
// ============================================================================

/**
 * Get a summary of the current hook configuration
 */
export function getProfileSummary(hooks?: HookDefinition[]): {
  profile: HookProfile;
  debug: boolean;
  disabledHooks: string[];
  enabledCount: number;
  disabledCount: number;
} {
  const ctx = getHookContext();
  const enabled = hooks ? filterEnabledHooks(hooks, ctx) : [];
  const disabled = hooks ? hooks.length - enabled.length : ctx.disabledHooks.length;

  return {
    profile: ctx.profile,
    debug: ctx.debug,
    disabledHooks: ctx.disabledHooks,
    enabledCount: hooks ? enabled.length : -1,
    disabledCount: disabled,
  };
}

/**
 * Print profile configuration to console (for debugging)
 */
export function printProfileConfig(hooks?: HookDefinition[]): void {
  const summary = getProfileSummary(hooks);

  console.log('=== Hook Profile Configuration ===');
  console.log(`Profile: ${summary.profile}`);
  console.log(`Debug: ${summary.debug}`);
  console.log(
    `Disabled Hooks: ${summary.disabledHooks.length > 0 ? summary.disabledHooks.join(', ') : '(none)'}`
  );

  if (hooks) {
    console.log(`Enabled: ${summary.enabledCount}/${hooks.length}`);
    const enabled = filterEnabledHooks(hooks);
    console.log(`Active Hooks: ${enabled.map((h) => h.id).join(', ') || '(none)'}`);
  }

  console.log('==================================');
}

// ============================================================================
// Predefined Hook Definitions
// ============================================================================

/**
 * Predefined security hooks
 */
export const SECURITY_HOOKS: HookDefinition[] = [
  defineSecurityHook('secret-scan', {
    name: 'Secret Scanner',
    description: 'Scan for exposed secrets/credentials',
  }),
];

/**
 * Predefined quality hooks
 */
export const QUALITY_HOOKS: HookDefinition[] = [
  defineQualityHook('fact-forcing', {
    name: 'Fact Forcing Gate',
    description: 'Enforce fact-based decision making',
  }),
  defineQualityHook('pr-size-check', {
    name: 'PR Size Check',
    description: 'Validate PR size limits',
  }),
];

/**
 * Predefined strict hooks
 */
export const STRICT_HOOKS: HookDefinition[] = [
  defineStrictHook('lint-check', {
    name: 'Lint Check',
    category: 'quality',
    description: 'Run linter validation',
  }),
  defineStrictHook('test-coverage', {
    name: 'Test Coverage',
    category: 'quality',
    description: 'Validate test coverage thresholds',
  }),
  defineStrictHook('security-audit', {
    name: 'Security Audit',
    category: 'security',
    description: 'Deep security vulnerability scan',
  }),
  defineStrictHook('dependency-check', {
    name: 'Dependency Check',
    category: 'security',
    description: 'Check for vulnerable dependencies',
  }),
];

/**
 * All predefined hooks
 */
export const ALL_PREDEFINED_HOOKS: HookDefinition[] = [
  ...SECURITY_HOOKS,
  ...QUALITY_HOOKS,
  ...STRICT_HOOKS,
];

// ============================================================================
// Legacy API (backward compatibility)
// ============================================================================

/** @deprecated Use getHookProfile() instead */
export function getCurrentProfile(): HookProfile {
  return getHookProfile();
}

/** @deprecated Environment-based profiles are now preferred */
export function setProfile(_profile: string): void {
  console.warn(
    '[DEPRECATED] setProfile() is deprecated. Use EKET_HOOK_PROFILE env var instead.'
  );
}

/** @deprecated Use getHookContext() instead */
export function getProfileConfig(): ProfileConfig {
  const ctx = getHookContext();
  return {
    enabledPriorities: ctx.profile === 'minimal' ? ['critical'] : ['critical', 'high', 'normal'],
    forceDisable: ctx.disabledHooks,
    verbose: ctx.debug,
  };
}

/** @deprecated Use EKET_DISABLED_HOOKS env var instead */
export function setCustomConfig(_config: Partial<ProfileConfig> | null): void {
  console.warn(
    '[DEPRECATED] setCustomConfig() is deprecated. Use EKET_DISABLED_HOOKS env var instead.'
  );
}

/** @deprecated Use shouldRunHook() instead */
export function shouldRunCheck(checkId: string, _priority: CheckPriority): boolean {
  const ctx = getHookContext();
  // Map priority to profiles for backward compatibility
  const profiles: HookProfile[] =
    _priority === 'critical'
      ? ['minimal', 'standard', 'strict']
      : _priority === 'low'
        ? ['strict']
        : ['standard', 'strict'];

  return shouldRunHook(checkId, { profiles }, ctx);
}

/** @deprecated Use EKET_HOOK_PROFILE env var instead */
export function initProfileFromEnv(): void {
  // No-op: profile is now always read from env
}
