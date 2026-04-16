import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface RefactoringGuideInput {
  targetCode: string;
  refactoringType?: 'extract-function' | 'rename' | 'decompose-conditional' | 'replace-temp-with-query' | 'general';
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface RefactoringGuideOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const refactoringGuideSkill: Skill<RefactoringGuideInput, RefactoringGuideOutput> = {
  name: 'refactoring-guide',
  category: SkillCategory.DEVELOPMENT,
  description: 'Safe, incremental refactoring steps following Martin Fowler patterns with test-safety nets',
  version: '1.0.0',
  async execute(input: SkillInput<RefactoringGuideInput>): Promise<SkillOutput<RefactoringGuideOutput>> {
    const data = input as unknown as RefactoringGuideInput;
    const start = Date.now();
    const type = data.refactoringType || 'general';
    const risk = data.riskLevel || 'medium';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Establish Safety Net (Tests First)',
            description: 'Never refactor without a safety net. Tests are your insurance policy.',
            actions: [
              'Run existing test suite — all must pass before starting',
              'Check current coverage for code under refactoring (aim ≥80%)',
              'Write characterization tests for any untested behavior you\'ll touch',
              'Set up mutation testing if coverage is borderline',
              'Commit current state: "chore: test baseline before refactoring [target]"',
              'Configure IDE to auto-run tests on save during refactoring session',
            ],
          },
          {
            step: 2,
            title: 'Identify Smells & Define Goal',
            description: 'Diagnose exactly what needs to change and why before touching code.',
            actions: [
              'Identify code smells: long method, large class, duplicate code, feature envy',
              'Check cyclomatic complexity — >10 is a strong refactoring signal',
              `Determine refactoring pattern: ${type === 'extract-function' ? 'Extract Function — move cohesive logic to named function' : type === 'decompose-conditional' ? 'Decompose Conditional — extract condition into named predicate' : 'Select from: Extract Function, Move Method, Replace Conditional with Polymorphism'}`,
              'Define done criteria: what will the code look like after? Write it out',
              'Estimate risk: coupling level, number of callers, presence of shared mutable state',
              risk === 'high' ? 'High risk: plan for feature flag or parallel-run deployment' : 'Document affected modules for targeted regression testing',
            ],
          },
          {
            step: 3,
            title: 'Prepare & Branch Strategy',
            description: 'Set up refactoring branch and communication plan.',
            actions: [
              'Create dedicated branch: feature/refactor-[component-name]',
              'Announce refactoring to team — coordinate to minimize merge conflicts',
              'For large refactors, freeze feature work on affected files (agree timebox)',
              'Split refactoring: semantic changes (rename/move) separate from behavioral changes',
              'Set up before/after benchmarks if performance-sensitive code',
              'Prepare PR description template: motivation, approach, testing evidence',
            ],
          },
          {
            step: 4,
            title: 'Execute Incrementally',
            description: 'Make one small change at a time — test after each step.',
            actions: [
              'One transformation per commit — never mix refactoring with feature work',
              'Use IDE automated refactoring tools (rename, extract method) — more reliable than manual',
              'After each change: run full test suite, verify no regressions',
              'Keep each commit green — never commit broken state',
              'If tests break: revert immediately, don\'t try to "fix forward" while refactoring',
              'Commit message format: "refactor: extract [name] from [source] — no behavior change"',
            ],
          },
          {
            step: 5,
            title: 'Validate Behavior Equivalence',
            description: 'Prove refactored code behaves identically to original.',
            actions: [
              'Run full test suite with coverage report — no regression, no coverage drop',
              'If applicable, run mutation testing — score should be equal or better',
              'Performance test for hot paths: before/after benchmark comparison',
              'Review diff for any accidental logic changes (use `git diff --word-diff`)',
              'Have a second reviewer check the diff with fresh eyes',
              'For APIs: verify response shape unchanged via contract tests',
            ],
          },
          {
            step: 6,
            title: 'Update Documentation & Close',
            description: 'Refactoring is incomplete without documentation updates.',
            actions: [
              'Update inline comments if function signatures changed',
              'Update ADR (Architecture Decision Record) if structural change is significant',
              'Update README or wiki if developer workflow changed',
              'Delete dead code that was only kept during transition',
              'Create PR, link to original tech debt ticket, request review',
              'After merge: announce completion, unfreeze any held feature branches',
            ],
          },
        ],
        summary: `Safe refactoring guide for "${data.targetCode || 'target code'}" — type: ${type}, risk: ${risk}. 6-phase approach: safety net → smell diagnosis → branch prep → incremental execution → equivalence validation → documentation.`,
      },
      duration: Date.now() - start,
    };
  },
};
