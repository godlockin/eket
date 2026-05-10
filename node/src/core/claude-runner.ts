/**
 * Claude Runner
 * TASK-081: 读取 agent_profile.yml 中的 model 字段，传 --model 给 Claude CLI
 */

import * as fs from 'fs';
import * as path from 'path';

import { execFileNoThrow } from '../utils/execFileNoThrow.js';

import { resolveModel, getModelDisplayName, type ModelTier } from './model-router.js';
import { createModelConfig } from './model-provider.js';
import { contextTracker } from './context-tracker.js';
import { identifyErrorType } from './error-identifier.js';
import { logContextOverflow, saveTaskContext } from './recovery-logger.js';
import { alertManager } from './alert-manager.js';

// ============================================================================
// Types
// ============================================================================

export interface ClaudeRunOptions {
  prompt: string;
  projectRoot: string;
  /** Override model tier; if not provided, reads from agent_profile.yml */
  model?: ModelTier;
  /**
   * Agent role for model routing (TASK-202).
   * When provided, model is resolved via createModelConfig(role) first,
   * then `model` tier override still wins if explicitly set.
   */
  role?: string;
  /** Extra args passed to claude CLI */
  extraArgs?: string[];
  /** Session ID for context tracking (TASK-602) */
  sessionId?: string;
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
    console.warn(`[writeModelToProfile] profile not found, skipping: ${profilePath}`);
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
  // Role-based routing (TASK-202): resolve model name from role if provided
  let modelName: string;

  if (options.model) {
    // Explicit tier override always wins
    modelName = getModelDisplayName(options.model);
  } else if (options.role) {
    // Use role-based config
    const roleConfig = createModelConfig(options.role);
    modelName = roleConfig.model;
  } else {
    // Legacy path: read from agent_profile.yml
    const tier = readModelFromProfile(options.projectRoot);
    modelName = getModelDisplayName(tier);
  }

  const args = [
    '--model',
    modelName,
    '--print',
    options.prompt,
    ...(options.extraArgs ?? []),
  ];

  // TASK-602: Check if context needs compacting
  const sessionId = options.sessionId || 'unknown';
  if (contextTracker.shouldCompact(sessionId)) {
    const compacted = await contextTracker.triggerCompact(sessionId);
    if (!compacted) {
      console.warn('⚠️  Auto-compact failed, proceeding anyway...');
    }
  }

  const result = await execFileNoThrow('claude', args, {
    cwd: options.projectRoot,
  });

  // TASK-602: Track output tokens
  if (result.stdout) {
    contextTracker.trackToolOutput(sessionId, result.stdout);
  }

  // TASK-601: Check for 400 errors
  if (result.status !== 0 && result.stderr?.includes('400')) {
    return await handle400Error(result, options, args, modelName);
  }

  return {
    success: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    modelUsed: modelName,
  };
}

// ============================================================================
// TASK-601: 400 Error Auto-Recovery
// ============================================================================

/**
 * Handles 400 errors from Claude CLI.
 *
 * Strategy:
 * - Identifies error type (context_length_exceeded vs others)
 * - Only recovers from context_length_exceeded
 * - Other 400 errors (invalid_request, validation) are thrown
 *
 * @param result - The failed exec result
 * @param options - Original run options
 * @param originalArgs - Original CLI args
 * @param modelName - Model name being used
 * @returns Recovery result or throws error
 */
async function handle400Error(
  result: any,
  options: ClaudeRunOptions,
  originalArgs: string[],
  modelName: string
): Promise<ClaudeRunResult> {
  const errorType = identifyErrorType(result.stderr || '');

  // Only recover from context_length_exceeded
  if (errorType !== 'context_length_exceeded') {
    await logContextOverflow({
      errorType,
      recoveryStrategy: 'none',
      result: 'rejected',
      projectRoot: options.projectRoot,
    });

    throw new Error(`Claude API 400 (${errorType}): ${result.stderr}`);
  }

  // Trigger recovery flow
  console.error('❌ 400: Context length exceeded, initiating recovery...');
  await logContextOverflow({
    errorType: 'context_length_exceeded',
    recoveryStrategy: 'detected',
    result: 'initiating',
    projectRoot: options.projectRoot,
  });

  // TASK-607: Record error for alerting
  const taskId = readTaskIdFromProfile(options.projectRoot);
  const sessionId = options.sessionId || 'unknown';
  const estimatedTokens = contextTracker.getSessionTokens(sessionId);
  await alertManager.recordError(taskId, estimatedTokens);

  return await recoverFromContextOverflow(options, originalArgs, modelName);
}

/**
 * Executes 2-layer recovery strategy for context overflow:
 *
 * Strategy 1: /compact + retry
 * - Execute /compact command
 * - Retry original request
 * - If successful, continue task
 *
 * Strategy 2: Nuclear Option (if Strategy 1 fails)
 * - Save task context to .eket/recovery/
 * - Restart session with minimal prompt
 *
 * @param options - Original run options
 * @param originalArgs - Original CLI args
 * @param modelName - Model name being used
 * @returns Recovery result
 */
async function recoverFromContextOverflow(
  options: ClaudeRunOptions,
  originalArgs: string[],
  modelName: string
): Promise<ClaudeRunResult> {
  // Strategy 1: /compact + retry
  console.log('🔄 Recovery Strategy 1: Attempting /compact...');
  const compactResult = await execFileNoThrow('claude', ['--command', '/compact'], {
    cwd: options.projectRoot,
  });

  if (compactResult.status === 0) {
    console.log('✅ /compact successful, retrying original request...');
    const retryResult = await execFileNoThrow('claude', originalArgs, {
      cwd: options.projectRoot,
    });

    if (retryResult.status === 0 || !retryResult.stderr?.includes('400')) {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'compact_retry',
        result: 'recovered',
        projectRoot: options.projectRoot,
      });

      return {
        success: true,
        stdout: retryResult.stdout,
        stderr: retryResult.stderr,
        modelUsed: modelName,
      };
    }
  }

  // Strategy 2: Nuclear Option
  console.warn('⚠️  /compact insufficient, initiating Nuclear Option...');
  console.log('🔄 Recovery Strategy 2: Session restart...');

  // 1. Save task context
  const taskId = readTaskIdFromProfile(options.projectRoot);
  await saveTaskContext({
    projectRoot: options.projectRoot,
    taskId,
    prompt: options.prompt,
  });

  // 2. Kill session (Claude Code CLI may not support explicit kill, skip for now)
  // TODO: Investigate if session termination is needed

  // 3. Start new session with minimal prompt
  const minimalPrompt = `[Context Overflow Recovery - Session Restarted]

Task: ${taskId}
Instruction: ${options.prompt}

⚠️  Previous context exceeded limit and was cleared.
📁 Context saved to: .eket/recovery/task-${taskId}-context.md

Continue from last checkpoint.
`;

  const nuclearResult = await execFileNoThrow('claude', ['--model', modelName, '--print', minimalPrompt], {
    cwd: options.projectRoot,
  });

  await logContextOverflow({
    errorType: 'context_length_exceeded',
    recoveryStrategy: 'nuclear_restart',
    result: nuclearResult.status === 0 ? 'recovered' : 'failed',
    projectRoot: options.projectRoot,
  });

  return {
    success: nuclearResult.status === 0,
    stdout: nuclearResult.stdout,
    stderr: nuclearResult.stderr,
    modelUsed: modelName,
  };
}

/**
 * Helper: Read task ID from agent_profile.yml
 */
function readTaskIdFromProfile(projectRoot: string): string {
  try {
    const profilePath = path.join(projectRoot, '.eket', 'state', 'agent_profile.yml');
    const content = fs.readFileSync(profilePath, 'utf-8');
    const match = content.match(/^current_ticket:\s*(.+)$/m);
    return match ? match[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}
