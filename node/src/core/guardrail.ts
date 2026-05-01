/**
 * ParallelGuardrail — 并行验收门禁 (TASK-203)
 *
 * 受 openai-agents-python Guardrail 模式启发：
 * - GuardrailFn: 单个检查函数类型
 * - runGuardrails: Promise.allSettled 并行执行，所有完成后聚合
 * - GuardrailTripwireError: 包含所有触发 guardrail 的详情
 * - 内置 guardrail: ci, coverage, knowledgeNotes, prFormat
 */

// ============================================================================
// Types
// ============================================================================

export interface GuardrailInput {
  ticketId: string;
  ticketContent: string;
  ciStatus?: 'green' | 'red' | 'unknown';
  coveragePercent?: number;
  coverageThreshold?: number;
  knowledgeNotes?: string[];
  prTitle?: string;
  prDescription?: string;
  prUrl?: string;
}

export interface GuardrailResult {
  passed: boolean;
  guardrailName: string;
  reason?: string;
}

export type GuardrailFn = (input: GuardrailInput) => Promise<GuardrailResult> | GuardrailResult;

export class GuardrailTripwireError extends Error {
  public readonly failures: GuardrailResult[];

  constructor(failures: GuardrailResult[]) {
    const summary = failures
      .map((f) => `[${f.guardrailName}] ${f.reason ?? 'failed'}`)
      .join('; ');
    super(`Guardrail tripwire triggered: ${summary}`);
    this.name = 'GuardrailTripwireError';
    this.failures = failures;
  }
}

// ============================================================================
// Core runner
// ============================================================================

/**
 * Run all guardrails in parallel via Promise.allSettled.
 * All guardrails complete before results are aggregated (openai fix: no side-effect interruption).
 * Returns ALL results — caller decides policy.
 */
export async function runGuardrails(
  guardrails: GuardrailFn[],
  input: GuardrailInput
): Promise<GuardrailResult[]> {
  const settled = await Promise.allSettled(guardrails.map((g) => g(input)));

  return settled.map((s, i): GuardrailResult => {
    if (s.status === 'fulfilled') {
      return s.value;
    }
    // Rejected = guardrail itself threw
    return {
      passed: false,
      guardrailName: guardrails[i]?.name || `guardrail_${i}`,
      reason: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });
}

/**
 * Run all guardrails; throw GuardrailTripwireError if any fail (all-must-pass policy).
 */
export async function runGuardrailsStrict(
  guardrails: GuardrailFn[],
  input: GuardrailInput
): Promise<GuardrailResult[]> {
  const results = await runGuardrails(guardrails, input);
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    throw new GuardrailTripwireError(failures);
  }
  return results;
}

/**
 * Short-circuit: stops on first failure (runs sequentially, not parallel).
 * Returns all results collected up to and including first failure.
 */
export async function runGuardrailsWithShortCircuit(
  guardrails: GuardrailFn[],
  input: GuardrailInput
): Promise<GuardrailResult[]> {
  const results: GuardrailResult[] = [];
  for (const g of guardrails) {
    let result: GuardrailResult;
    try {
      result = await g(input);
    } catch (e) {
      result = {
        passed: false,
        guardrailName: g.name || 'unknown',
        reason: e instanceof Error ? e.message : String(e),
      };
    }
    results.push(result);
    if (!result.passed) {
      break; // short-circuit
    }
  }
  return results;
}

// ============================================================================
// Built-in guardrails
// ============================================================================

export async function ciPassGuardrail(input: GuardrailInput): Promise<GuardrailResult> {
  const status = input.ciStatus ?? 'unknown';
  if (status === 'green') {
    return { passed: true, guardrailName: 'ciPassGuardrail' };
  }
  if (status === 'unknown') {
    return {
      passed: false,
      guardrailName: 'ciPassGuardrail',
      reason: 'CI 状态未知，无法确认是否通过',
    };
  }
  return {
    passed: false,
    guardrailName: 'ciPassGuardrail',
    reason: `CI 状态为 "${status}"，必须 green 才能通过`,
  };
}

export async function coverageGuardrail(input: GuardrailInput): Promise<GuardrailResult> {
  const threshold = input.coverageThreshold ?? 80;
  if (input.coveragePercent === undefined) {
    return {
      passed: false,
      guardrailName: 'coverageGuardrail',
      reason: 'coverage 数据缺失',
    };
  }
  if (input.coveragePercent >= threshold) {
    return { passed: true, guardrailName: 'coverageGuardrail' };
  }
  return {
    passed: false,
    guardrailName: 'coverageGuardrail',
    reason: `覆盖率 ${input.coveragePercent}% 低于阈值 ${threshold}%`,
  };
}

export async function knowledgeNotesGuardrail(input: GuardrailInput): Promise<GuardrailResult> {
  const notes = input.knowledgeNotes ?? [];
  if (notes.length >= 1) {
    return { passed: true, guardrailName: 'knowledgeNotesGuardrail' };
  }
  return {
    passed: false,
    guardrailName: 'knowledgeNotesGuardrail',
    reason: 'knowledgeNotes 字段为空，Slaver 必须沉淀至少一条知识笔记',
  };
}

const PR_TITLE_PATTERN = /^(feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)(\(.+\))?:\s+.{3,}/;
const PR_DESCRIPTION_MIN_LENGTH = 20;

export async function prFormatGuardrail(input: GuardrailInput): Promise<GuardrailResult> {
  const errors: string[] = [];

  if (!input.prTitle) {
    errors.push('PR 标题缺失');
  } else if (!PR_TITLE_PATTERN.test(input.prTitle)) {
    errors.push(
      `PR 标题格式不符合规范（应为 "type(scope): description"，如 "feat(auth): add login"）`
    );
  }

  if (!input.prDescription) {
    errors.push('PR 描述缺失');
  } else if (input.prDescription.length < PR_DESCRIPTION_MIN_LENGTH) {
    errors.push(`PR 描述过短（${input.prDescription.length} 字符，最少 ${PR_DESCRIPTION_MIN_LENGTH} 字符）`);
  }

  if (errors.length > 0) {
    return {
      passed: false,
      guardrailName: 'prFormatGuardrail',
      reason: errors.join('; '),
    };
  }
  return { passed: true, guardrailName: 'prFormatGuardrail' };
}

// ============================================================================
// Default guardrail suite
// ============================================================================

export const DEFAULT_GUARDRAILS: GuardrailFn[] = [
  ciPassGuardrail,
  coverageGuardrail,
  knowledgeNotesGuardrail,
  prFormatGuardrail,
];
