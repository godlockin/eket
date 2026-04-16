/**
 * EKET Framework - Code Smell Detection Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';

export interface CodeSmellDetectionInput {
  /** File paths or code snippet to analyze */
  filePaths?: string[];
  /** Raw code snippet */
  codeSnippet?: string;
  /** Programming language */
  language?: string;
  /** Repository root path */
  repoPath?: string;
}

export interface CodeSmellDetectionOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const codeSmellDetectionSkill: Skill<CodeSmellDetectionInput, CodeSmellDetectionOutput> = {
  name: 'code-smell-detection',
  category: 'review',
  description: 'Detect and document code smells: long methods, duplication, high complexity, feature envy, dead code.',
  version: '1.0.0',
  tags: ['review', 'code-quality', 'refactoring', 'static-analysis'],

  async execute(input: SkillInput<CodeSmellDetectionInput>): Promise<SkillOutput<CodeSmellDetectionOutput>> {
    const data = input as unknown as CodeSmellDetectionInput;
    const start = Date.now();
    const lang = data.language ?? 'TypeScript';
    const target = data.filePaths?.join(', ') ?? 'provided code snippet';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Identify Long Methods & Large Classes',
            description: 'Flag methods exceeding 30 lines and classes exceeding 300 lines as candidates for extraction.',
            actions: [
              `Scan ${target} for functions/methods > 30 LOC`,
              'List each offending symbol with line count and file location',
              'Suggest Extract Method / Extract Class refactoring for each',
              `Run: grep -n "^\\s*function\\|^\\s*async" for ${lang} files and measure span`,
            ],
          },
          {
            step: 2,
            title: 'Detect Duplicated Code',
            description: 'Find copy-paste blocks (≥ 6 identical lines) that violate DRY principle.',
            actions: [
              'Run jscpd or similar clone detector on target files',
              'List duplicate block pairs: file A lines X-Y ↔ file B lines P-Q',
              'Estimate consolidation effort (extract shared utility function)',
              'Prioritize blocks in hot paths for immediate refactoring',
            ],
          },
          {
            step: 3,
            title: 'Measure Cyclomatic Complexity',
            description: 'Flag functions with complexity > 10 as high-risk maintenance liabilities.',
            actions: [
              'Run complexity analysis tool (eslint complexity rule or ts-complex)',
              'List all functions with cyclomatic complexity > 10',
              'Map each to its nesting depth and number of decision points',
              'Recommend decomposition strategy: guard clauses, strategy pattern, or lookup tables',
              'Document expected complexity after refactoring',
            ],
          },
          {
            step: 4,
            title: 'Detect Feature Envy & Inappropriate Intimacy',
            description: 'Identify methods that access data from other classes more than their own.',
            actions: [
              'Analyze method calls: count cross-module vs same-module references per function',
              'Flag functions where > 50% of field accesses belong to another class/module',
              'Suggest Move Method refactoring to the class that owns the most accessed data',
              'Check for bidirectional coupling between modules (circular dependency smell)',
            ],
          },
          {
            step: 5,
            title: 'Find Dead Code & Unused Exports',
            description: 'Remove unreachable code, unused variables, and unexported dead functions.',
            actions: [
              'Run TypeScript compiler with noUnusedLocals and noUnusedParameters',
              'Use ts-prune to find unexported symbols with no external references',
              `Run: npx ts-prune --ignore "index.ts" in ${data.repoPath ?? 'repo root'}`,
              'List each dead symbol with its declaration location',
              'Mark for deletion in a dedicated refactoring PR (no behavior change)',
            ],
          },
          {
            step: 6,
            title: 'Generate Smell Report & Prioritize',
            description: 'Consolidate findings into a prioritized remediation backlog.',
            actions: [
              'Aggregate all detected smells by severity: critical > high > medium > low',
              'Assign effort estimate (S/M/L) to each refactoring task',
              'Create Jira/GitHub issues for top-5 critical smells',
              'Document quick wins (< 1 hour fixes) vs. strategic refactors',
              'Attach report to PR or code review comment thread',
            ],
          },
        ],
        summary: `Code smell analysis on ${target} (${lang}): checked for long methods, duplication, high cyclomatic complexity, feature envy, and dead code. Findings prioritized into actionable remediation backlog.`,
      },
      duration: Date.now() - start,
    };
  },
};
