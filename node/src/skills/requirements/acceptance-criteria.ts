import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface AcceptanceCriteriaInput {
  featureName: string;
  userStory?: string;
  format?: 'gherkin' | 'checklist' | 'rules';
}

export interface AcceptanceCriteriaOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const acceptanceCriteriaSkill: Skill<AcceptanceCriteriaInput, AcceptanceCriteriaOutput> = {
  name: 'acceptance-criteria',
  category: SkillCategory.REQUIREMENTS,
  description: 'Write precise, testable acceptance criteria using Gherkin BDD scenarios or rule-based formats.',
  version: '1.0.0',
  async execute(input: SkillInput<AcceptanceCriteriaInput>): Promise<SkillOutput<AcceptanceCriteriaOutput>> {
    const data = input.data as unknown as AcceptanceCriteriaInput;
    const start = Date.now();
    const format = data.format ?? 'gherkin';
    const userStory = data.userStory ?? 'As a user, I want to [action] so that [benefit]';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Understand the Feature Scope',
            description: 'Deeply understand the feature context before writing any criteria.',
            actions: [
              `Review user story for "${data.featureName}": "${userStory}"`,
              'Identify the "definition of done" from the product owner\'s perspective',
              'List known edge cases, boundary conditions, and negative scenarios upfront',
              'Review existing related features to ensure ACs are consistent with current behavior',
              'Confirm with product owner: what would cause them to reject this feature at demo?',
            ],
          },
          {
            step: 2,
            title: 'Select & Set Up AC Format',
            description: `Configure the ${format} format structure for consistent criteria writing.`,
            actions: [
              `Use ${format} format: ${
                format === 'gherkin'
                  ? 'Given [context] / When [action] / Then [outcome] — one scenario per behavior'
                  : format === 'checklist'
                  ? 'Bullet list of "The system shall..." or "User can..." statements'
                  : 'Rule-based: "[Rule Name]: [condition] → [expected behavior]"'
              }`,
              'Establish naming convention for scenario titles: "should [behavior] when [condition]"',
              'Create AC template document with feature name, story link, author, and date',
              'Define pass/fail criteria for each AC — no ambiguous "works correctly" language',
              'Agree on format with QA team to ensure ACs translate directly to test cases',
            ],
          },
          {
            step: 3,
            title: 'Write Happy Path Criteria',
            description: 'Document acceptance criteria for the primary success scenarios.',
            actions: [
              'Write criteria for the main user workflow from start to successful completion',
              'Include data validation rules: required fields, format constraints, value ranges',
              'Specify UI feedback: success messages, loading states, navigation after success',
              'Cover performance criteria where relevant: response time thresholds, throughput minimums',
              'Ensure each happy path criterion is independently testable without other criteria',
            ],
          },
          {
            step: 4,
            title: 'Write Edge Case & Error Criteria',
            description: 'Cover boundary conditions, error states, and exceptional scenarios.',
            actions: [
              'Write criteria for all validation failure scenarios with specific error message expectations',
              'Cover boundary values: min/max inputs, empty states, maximum length strings',
              'Define behavior for concurrent access: simultaneous edits, race conditions',
              'Document permission boundaries: what unauthorized users see/get when attempting restricted actions',
              'Cover system failure scenarios: offline mode, timeout behavior, partial failure recovery',
            ],
          },
          {
            step: 5,
            title: 'Review, Refine & Sign Off',
            description: 'Validate acceptance criteria with all stakeholders and link to test cases.',
            actions: [
              'Three-amigos review: product owner (value), developer (feasibility), QA (testability)',
              'Check SMART criteria: each AC is Specific, Measurable, Achievable, Relevant, Testable',
              'Remove vague language: replace "fast", "user-friendly", "correct" with measurable thresholds',
              'Link each AC to a test case ID in the test management tool (Zephyr, TestRail, Xray)',
              'Mark ACs as baseline-locked after sign-off; changes require formal change request',
            ],
          },
        ],
        summary: `Acceptance criteria for "${data.featureName}" using ${format} format, covering happy path, edge cases, and error scenarios with three-amigos review and traceability to test cases.`,
      },
      duration: Date.now() - start,
    };
  },
};
