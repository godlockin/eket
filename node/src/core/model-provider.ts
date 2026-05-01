/**
 * ModelProvider — role-based model routing (TASK-202)
 *
 * Env vars (override per-role):
 *   EKET_MASTER_MODEL    → model for master role
 *   EKET_SLAVER_MODEL    → model for all slaver roles
 *   EKET_REVIEWER_MODEL  → model for reviewer role
 *   EKET_DEFAULT_MODEL   → fallback for any unmatched role
 */

// ============================================================================
// Types
// ============================================================================

export interface AgentModelConfig {
  model: string;
  /** Provider tag for future multi-provider support */
  provider: string;
  maxTokens: number;
  temperature: number;
}

export interface ModelProvider {
  modelForRole(role: string): AgentModelConfig | null;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_PROVIDER = 'anthropic';

const BUILTIN_ROLE_MODELS: Record<string, AgentModelConfig> = {
  master: {
    model: 'claude-opus-4-5',
    provider: DEFAULT_PROVIDER,
    maxTokens: 8192,
    temperature: 0.3,
  },
  slaver: {
    model: 'claude-sonnet-4-5',
    provider: DEFAULT_PROVIDER,
    maxTokens: 8192,
    temperature: 0.3,
  },
  reviewer: {
    model: 'claude-haiku-4-5',
    provider: DEFAULT_PROVIDER,
    maxTokens: 4096,
    temperature: 0.1,
  },
};

// ============================================================================
// EnvModelProvider
// ============================================================================

/**
 * Reads EKET_MASTER_MODEL, EKET_SLAVER_MODEL, EKET_REVIEWER_MODEL env vars.
 * Also reads EKET_DEFAULT_MODEL as catch-all.
 * Returns null for roles not covered by env.
 */
export class EnvModelProvider implements ModelProvider {
  private readonly env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  modelForRole(role: string): AgentModelConfig | null {
    const normalized = role.toLowerCase();

    // Exact env var match: EKET_{ROLE}_MODEL
    const roleKey = `EKET_${normalized.toUpperCase()}_MODEL`;
    const specificModel = this.env[roleKey];
    if (specificModel) {
      return this.buildConfig(specificModel, role);
    }

    // Slaver sub-roles (e.g. "backend_slaver", "frontend_slaver")
    if (normalized.includes('slaver')) {
      const slaverModel = this.env['EKET_SLAVER_MODEL'];
      if (slaverModel) {
        return this.buildConfig(slaverModel, role);
      }
    }

    // Default fallback
    const defaultModel = this.env['EKET_DEFAULT_MODEL'];
    if (defaultModel) {
      return this.buildConfig(defaultModel, role);
    }

    return null;
  }

  private buildConfig(model: string, role?: string): AgentModelConfig {
    if (!model || model.trim() === '') {
      throw new Error(`EKET model config error: empty model string for role '${role ?? 'unknown'}'`);
    }
    return {
      model,
      provider: DEFAULT_PROVIDER,
      maxTokens: 8192,
      temperature: 0.3,
    };
  }
}

// ============================================================================
// BuiltinModelProvider
// ============================================================================

/**
 * Built-in role→model mappings. Falls back to DEFAULT_MODEL for unknown roles.
 * Always returns a non-null config.
 */
export class BuiltinModelProvider implements ModelProvider {
  modelForRole(role: string): AgentModelConfig {
    const normalized = role.toLowerCase();

    // Exact match
    if (BUILTIN_ROLE_MODELS[normalized]) {
      return BUILTIN_ROLE_MODELS[normalized];
    }

    // Sub-role matching (e.g. "backend_slaver" → slaver config)
    if (normalized.includes('slaver')) {
      return BUILTIN_ROLE_MODELS['slaver'];
    }
    if (normalized.includes('reviewer')) {
      return BUILTIN_ROLE_MODELS['reviewer'];
    }
    if (normalized.includes('master')) {
      return BUILTIN_ROLE_MODELS['master'];
    }

    // Generic fallback
    return {
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER,
      maxTokens: 8192,
      temperature: 0.3,
    };
  }
}

// ============================================================================
// FallbackModelProvider
// ============================================================================

/**
 * Chain of providers: first non-null result wins.
 * Guarantees non-null by appending BuiltinModelProvider as last resort.
 */
export class FallbackModelProvider implements ModelProvider {
  private readonly providers: ModelProvider[];

  constructor(providers: ModelProvider[]) {
    // Always ensure BuiltinModelProvider is at the end
    const hasBuiltin = providers.some((p) => p instanceof BuiltinModelProvider);
    this.providers = hasBuiltin ? providers : [...providers, new BuiltinModelProvider()];
  }

  modelForRole(role: string): AgentModelConfig {
    for (const provider of this.providers) {
      const config = provider.modelForRole(role);
      if (config !== null) {
        return config;
      }
    }
    // Unreachable (BuiltinModelProvider always returns non-null), but TS needs it
    return new BuiltinModelProvider().modelForRole(role);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * createModelConfig: resolve model config for a given role.
 * Priority: env vars → builtin role map → DEFAULT_MODEL.
 */
export function createModelConfig(
  role: string,
  env: Record<string, string | undefined> = process.env
): AgentModelConfig {
  const provider = new FallbackModelProvider([new EnvModelProvider(env)]);
  return provider.modelForRole(role);
}
