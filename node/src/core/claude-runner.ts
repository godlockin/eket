/**
 * Claude Runner
 * TASK-081: 读取 agent_profile.yml 中的 model 字段，传 --model 给 Claude CLI
 */

import * as fs from 'fs';
import * as path from 'path';

import { resolveModel, getModelDisplayName, type ModelTier } from './model-router.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

// ============================================================================
// Types
// ============================================================================

export interface ClaudeRunOptions {
  prompt: string;
  projectRoot: string;
  /** Override model tier; if not provided, reads from agent_profile.yml */
  model?: ModelTier;
  /** Extra args passed to claude CLI */
  extraArgs?: string[];
}

export interface ClaudeRunResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  modelUsed?: string;
}

// ============================================================================
// Profile Reading
// ============================================================================

interface AgentProfile {
  model?: string;
  role?: string;
  agent_type?: string;
  current_ticket?: string;
}

/**
 * Read model tier from .eket/state/agent_profile.yml
 * Falls back to 'sonnet' if file/field missing.
 */
export function readModelFromProfile(projectRoot: string): ModelTier {
  const profilePath = path.join(projectRoot, '.eket', 'state', 'agent_profile.yml');

  if (!fs.existsSync(profilePath)) {
    return 'sonnet';
  }

  const content = fs.readFileSync(profilePath, 'utf-8');
  const profile: AgentProfile = {};

  for (const line of content.split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) {
      profile[m[1] as keyof AgentProfile] = m[2].trim();
    }
  }

  const tier = profile.model as ModelTier | undefined;
  if (tier && ['haiku', 'sonnet', 'opus'].includes(tier)) {
    return tier;
  }

  return 'sonnet';
}

/**
 * Write model tier into agent_profile.yml (adds/updates the `model:` field).
 */
export function writeModelToProfile(projectRoot: string, tier: ModelTier): void {
  const profilePath = path.join(projectRoot, '.eket', 'state', 'agent_profile.yml');

  if (!fs.existsSync(profilePath)) {
    return; // Profile must be initialized by claim first
  }

  let content = fs.readFileSync(profilePath, 'utf-8');

  if (/^model:/m.test(content)) {
    content = content.replace(/^model:.*$/m, `model: ${tier}`);
  } else {
    content = content.trimEnd() + `\nmodel: ${tier}\n`;
  }

  fs.writeFileSync(profilePath, content);
}

/**
 * Write model to ACTIVE_CONTEXT.md for visibility.
 */
export function injectModelToActiveContext(projectRoot: string, tier: ModelTier): void {
  const contextPath = path.join(projectRoot, '.eket', 'ACTIVE_CONTEXT.md');
  const modelDisplay = getModelDisplayName(tier);

  if (!fs.existsSync(contextPath)) {
    return;
  }

  let content = fs.readFileSync(contextPath, 'utf-8');

  const modelLine = `**Active Model**: ${modelDisplay} (${tier})`;
  if (/\*\*Active Model\*\*/.test(content)) {
    content = content.replace(/\*\*Active Model\*\*:.*$/m, modelLine);
  } else {
    content = content.trimEnd() + `\n\n${modelLine}\n`;
  }

  fs.writeFileSync(contextPath, content);
}

// ============================================================================
// Resolve and persist model after claim
// ============================================================================

/**
 * Called after task:claim succeeds.
 * Resolves model from ticket tags, writes to profile + ACTIVE_CONTEXT.
 */
export function resolveAndPersistModel(
  projectRoot: string,
  ticket: { tags?: string[]; model?: string }
): ModelTier {
  const tier = resolveModel(ticket);
  writeModelToProfile(projectRoot, tier);
  injectModelToActiveContext(projectRoot, tier);
  return tier;
}

// ============================================================================
// Claude CLI Runner
// ============================================================================

/**
 * Run claude CLI with the resolved model.
 *
 * Reads model from agent_profile.yml unless overridden in options.
 * Passes --model <model-display-name> to claude CLI.
 */
export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const tier = options.model ?? readModelFromProfile(options.projectRoot);
  const modelName = getModelDisplayName(tier);

  const args = [
    '--model',
    modelName,
    '--print',
    options.prompt,
    ...(options.extraArgs ?? []),
  ];

  const result = await execFileNoThrow('claude', args, {
    cwd: options.projectRoot,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    modelUsed: modelName,
  };
}
