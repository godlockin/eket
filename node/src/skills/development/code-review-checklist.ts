import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface CodeReviewChecklistInput {
  language: string;
  prDescription?: string;
  focusAreas?: string[];
}

export interface CodeReviewChecklistOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const codeReviewChecklistSkill: Skill<CodeReviewChecklistInput, CodeReviewChecklistOutput> = {
  name: 'code-review-checklist',
  category: SkillCategory.DEVELOPMENT,
  description: 'Systematic code review checklist covering correctness, security, performance, and maintainability',
  version: '1.0.0',
  async execute(input: SkillInput<CodeReviewChecklistInput>): Promise<SkillOutput<CodeReviewChecklistOutput>> {
    const data = input.data as unknown as CodeReviewChecklistInput;
    const start = Date.now();
    const lang = data.language || 'TypeScript';
    const focus = data.focusAreas || ['correctness', 'security', 'performance', 'style'];

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Understand Context & Scope',
            description: 'Before reviewing code, understand the PR purpose, related tickets, and blast radius.',
            actions: [
              'Read PR description and linked tickets thoroughly',
              'Identify files changed and estimate scope (small/medium/large)',
              'Check if breaking changes affect downstream consumers',
              'Verify the PR is focused (single responsibility, not a "mega PR")',
              'Review test coverage diff — ensure new code has corresponding tests',
            ],
          },
          {
            step: 2,
            title: 'Correctness & Logic',
            description: 'Verify the implementation is logically correct and handles edge cases.',
            actions: [
              `Check ${lang} type annotations — no implicit \`any\`, all return types explicit`,
              'Trace happy path end-to-end mentally (or in debugger)',
              'Identify edge cases: null/undefined, empty arrays, zero, negative numbers',
              'Verify error paths: exceptions caught, error codes propagated, fallbacks present',
              'Confirm business logic matches acceptance criteria from the ticket',
              'Check for off-by-one errors in loops and index operations',
            ],
          },
          {
            step: 3,
            title: 'Security Review',
            description: 'Identify security vulnerabilities before they reach production.',
            actions: [
              'Check for secrets/credentials hardcoded in source (use env vars only)',
              'Verify input validation: all user-controlled data sanitized before use',
              'Check for SQL/NoSQL injection risks — use parameterized queries',
              'Review auth/authz: are permissions checked before sensitive operations?',
              'Check for IDOR risks: user can only access their own resources',
              'Verify dependencies added are from trusted sources, check for known CVEs',
            ],
          },
          {
            step: 4,
            title: 'Performance & Scalability',
            description: `Identify ${focus.includes('performance') ? 'critical' : 'potential'} performance issues early.`,
            actions: [
              'Look for N+1 query patterns in database access loops',
              'Check expensive operations inside hot loops (string concat, JSON.parse)',
              'Verify list operations on large datasets are memoized or paginated',
              'Check for missing indexes on frequently queried fields',
              'Review memory allocation: large buffers, unbounded caches, event listener leaks',
              'Confirm async operations use proper concurrency (Promise.all vs sequential)',
            ],
          },
          {
            step: 5,
            title: 'Maintainability & Style',
            description: 'Ensure code is readable, follows team conventions, and is easy to maintain.',
            actions: [
              'Check function/variable names are descriptive and unambiguous',
              'Verify functions do one thing (SRP) — if >30 lines, likely needs splitting',
              'Confirm DRY: no copy-paste of logic that should be extracted',
              'Check comments explain "why" not "what" (code should be self-documenting)',
              'Verify test names describe behavior ("should return 404 when user not found")',
              'Confirm linter/formatter passes without warnings',
            ],
          },
          {
            step: 6,
            title: 'Final Sign-off',
            description: 'Complete review with structured feedback and approval decision.',
            actions: [
              'Categorize all comments: Blocker / Suggestion / Nit',
              'Blockers must be resolved before merge — post specific fix suggestions',
              'Suggestions are improvements worth discussing but not merge-blocking',
              'Approve only when all blockers resolved and CI is green',
              'Add summary comment: what was good, what was changed, overall assessment',
            ],
          },
        ],
        summary: `Code review checklist for ${lang} — 6-phase systematic review covering context, correctness, security, performance, maintainability, and sign-off. Focus areas: ${focus.join(', ')}.`,
      },
      duration: Date.now() - start,
    };
  },
};
