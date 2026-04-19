import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface UseCaseWritingInput {
  systemName: string;
  actors?: string[];
  useCaseName?: string;
  trigger?: string;
}

export interface UseCaseWritingOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const useCaseWritingSkill: Skill<UseCaseWritingInput, UseCaseWritingOutput> = {
  name: 'use-case-writing',
  category: SkillCategory.REQUIREMENTS,
  description: 'Write structured use cases following the Cockburn template with main flow, extensions, and preconditions.',
  version: '1.0.0',
  async execute(input: SkillInput<UseCaseWritingInput>): Promise<SkillOutput<UseCaseWritingOutput>> {
    const data = input.data as unknown as UseCaseWritingInput;
    const start = Date.now();
    const actors = data.actors ?? [];
    const useCaseName = data.useCaseName ?? 'Use Case';
    const trigger = data.trigger ?? 'Actor initiates action';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Identify Actors & System Boundary',
            description: 'Define who interacts with the system and what lies within/outside the system boundary.',
            actions: [
              `Define system boundary for "${data.systemName}"`,
              `Identify primary actors (initiate use case): ${actors.join(', ') || 'stakeholder analysis required'}`,
              'Identify secondary actors (system services, external APIs) that support use case execution',
              'Classify actors: human (user roles) vs. system (automated services, external systems)',
              'Create actor glossary with role descriptions to ensure shared team vocabulary',
            ],
          },
          {
            step: 2,
            title: 'Define Use Case Scope & Goal',
            description: 'Establish clear scope, goal level, and context for the use case.',
            actions: [
              `Name the use case: "${useCaseName}" using verb + noun pattern (e.g., "Place Order", "Approve Leave")`,
              'Define goal level: summary (sea level), user goal (user task), subfunction (component step)',
              `Define trigger: "${trigger}"`,
              'State stakeholder interests: what each stakeholder wants from this use case',
              'Define preconditions (guaranteed true before use case starts) and minimal guarantees (always true at end)',
            ],
          },
          {
            step: 3,
            title: 'Write Main Success Scenario',
            description: 'Document the primary flow as a numbered step sequence from trigger to goal delivery.',
            actions: [
              'Write 5–12 numbered steps describing the happy path from trigger to successful completion',
              'Each step: "Actor does X" or "System responds with Y" — keep steps at goal level, avoid UI details',
              'Ensure each step advances toward the goal without branching (extensions handle branches)',
              'Use active voice and present tense consistently throughout',
              'Verify the main scenario achieves the stated goal for all primary actors',
            ],
          },
          {
            step: 4,
            title: 'Document Extensions & Alternatives',
            description: 'Capture all alternative flows and error/exception conditions.',
            actions: [
              'Identify all branch points in the main scenario where behavior can deviate',
              'Write extension conditions in format "Xa. [Condition]: [Response steps]" for each branch',
              'Cover error conditions: validation failures, authorization denials, timeout scenarios',
              'Distinguish between recoverable extensions (resume main flow) and terminating extensions',
              'Prioritize extensions by frequency and criticality — not all extensions need full resolution steps',
            ],
          },
          {
            step: 5,
            title: 'Review & Validate Use Case',
            description: 'Validate the use case with stakeholders and cross-check against requirements.',
            actions: [
              'Walk through the use case with a primary actor using roleplay or structured review',
              'Check completeness: all stakeholder interests are protected in main flow or extensions',
              'Verify testability: each step can be observed and verified during acceptance testing',
              'Cross-reference with domain model: all entities mentioned exist in the domain glossary',
              'Baseline approved use cases in requirements traceability matrix with unique UC-XXX identifiers',
            ],
          },
        ],
        summary: `Use case writing process for "${useCaseName}" in "${data.systemName}" involving ${actors.length || 'identified'} actors, covering scope definition, main success scenario, extension flows, and stakeholder validation.`,
      },
      duration: Date.now() - start,
    };
  },
};
