import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface StakeholderInterviewInput {
  projectName: string;
  stakeholders: string[];
  objectives?: string[];
}

export interface StakeholderInterviewOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const stakeholderInterviewSkill: Skill<StakeholderInterviewInput, StakeholderInterviewOutput> = {
  name: 'stakeholder-interview',
  category: SkillCategory.ANALYSIS,
  description: 'Conduct structured stakeholder interviews to elicit requirements, pain points, and priorities.',
  version: '1.0.0',
  async execute(input: SkillInput<StakeholderInterviewInput>): Promise<SkillOutput<StakeholderInterviewOutput>> {
    const data = input as unknown as StakeholderInterviewInput;
    const start = Date.now();
    const stakeholders = data.stakeholders ?? [];
    const objectives = data.objectives ?? [];
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Identify & Prioritize Stakeholders',
            description: 'Map all stakeholders by influence and interest, then prioritize interview order.',
            actions: [
              `List all stakeholders for project "${data.projectName}": ${stakeholders.join(', ') || 'TBD'}`,
              'Create stakeholder influence-interest matrix (Power/Interest Grid)',
              'Prioritize high-influence stakeholders for early interviews',
              'Document stakeholder roles, responsibilities, and communication preferences',
              'Assign interview slots and confirm availability',
            ],
          },
          {
            step: 2,
            title: 'Prepare Interview Guide',
            description: 'Design open-ended question sets aligned with project objectives.',
            actions: [
              `Define interview objectives: ${objectives.join('; ') || 'gather requirements, identify pain points, validate assumptions'}`,
              'Draft 10–15 open-ended questions covering current state, desired state, and constraints',
              'Prepare follow-up probes for common ambiguous responses',
              'Review any existing documentation (specs, complaints, prior research) before interviews',
              'Conduct a pilot interview with a friendly stakeholder to validate question clarity',
            ],
          },
          {
            step: 3,
            title: 'Conduct Interviews',
            description: 'Execute interviews using active listening and structured probing techniques.',
            actions: [
              'Schedule 45–60 minute sessions per stakeholder in neutral, low-distraction settings',
              'Record sessions (with consent) or assign a dedicated note-taker',
              'Follow the guide but allow organic conversation flow for unexpected insights',
              'Use "5 Whys" technique to drill into root causes of stated problems',
              'Conclude each session by summarizing key points for stakeholder validation',
            ],
          },
          {
            step: 4,
            title: 'Synthesize Findings',
            description: 'Aggregate interview data to identify patterns, conflicts, and consensus.',
            actions: [
              'Transcribe or clean up notes within 24 hours of each interview',
              'Tag responses by theme: pain points, feature requests, constraints, success metrics',
              'Build affinity diagram grouping related insights across stakeholders',
              'Identify conflicting priorities or contradictory requirements between stakeholders',
              'Quantify frequency of each theme to determine signal strength',
            ],
          },
          {
            step: 5,
            title: 'Document & Validate Results',
            description: 'Produce a structured findings report and validate with stakeholders.',
            actions: [
              'Write a stakeholder interview summary document with key themes and quotes',
              'Create a requirements candidate list ranked by stakeholder priority and frequency',
              'Share findings summary with each interviewee for accuracy confirmation',
              'Resolve conflicts through follow-up conversations or stakeholder alignment workshop',
              'Feed validated requirements into backlog and traceability matrix',
            ],
          },
        ],
        summary: `Stakeholder interview process for "${data.projectName}" covering ${stakeholders.length || 'all'} stakeholders across 5 phases: identification, preparation, execution, synthesis, and validation.`,
      },
      duration: Date.now() - start,
    };
  },
};
