import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface FeasibilityStudyInput {
  projectName: string;
  techStack?: string[];
  constraints?: string[];
  timeline?: string;
}

export interface FeasibilityStudyOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const feasibilityStudySkill: Skill<FeasibilityStudyInput, FeasibilityStudyOutput> = {
  name: 'feasibility-study',
  category: SkillCategory.ANALYSIS,
  description: 'Assess technical feasibility of a project across dimensions: technology, resources, timeline, and risk.',
  version: '1.0.0',
  async execute(input: SkillInput<FeasibilityStudyInput>): Promise<SkillOutput<FeasibilityStudyOutput>> {
    const data = input.data as unknown as FeasibilityStudyInput;
    const start = Date.now();
    const techStack = data.techStack ?? [];
    const constraints = data.constraints ?? [];
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Feasibility Criteria',
            description: 'Establish measurable thresholds across technical, resource, time, and cost dimensions.',
            actions: [
              `Identify project scope for "${data.projectName}"`,
              'Define technical feasibility criteria: proven technology, team capability, integration complexity',
              'Define resource feasibility: team size, skill availability, tooling budget',
              `Define timeline feasibility constraints: ${data.timeline ?? 'TBD'}`,
              `Document known constraints: ${constraints.join('; ') || 'none specified'}`,
            ],
          },
          {
            step: 2,
            title: 'Technology Assessment',
            description: 'Evaluate the maturity, suitability, and risk of proposed technologies.',
            actions: [
              `Assess proposed tech stack: ${techStack.join(', ') || 'not specified — identify candidates'}`,
              'Rate each technology on maturity (1–5): prototype, early, growing, mature, legacy',
              'Identify open-source vs. commercial dependencies and their licensing implications',
              'Evaluate integration points: APIs, protocols, data formats, and compatibility risks',
              'Build proof-of-concept (PoC) for highest-risk technology choices',
            ],
          },
          {
            step: 3,
            title: 'Resource & Skill Gap Analysis',
            description: 'Map required skills against current team capabilities to identify gaps.',
            actions: [
              'List all technical skills required: languages, frameworks, infrastructure, domain knowledge',
              'Audit current team skill inventory using self-assessment or structured competency matrix',
              'Quantify skill gaps: identify missing skills and proficiency shortfalls',
              'Evaluate options: hire, train, contract, or reduce scope to fit available skills',
              'Estimate resource costs: salary, contractors, tooling licenses, infrastructure',
            ],
          },
          {
            step: 4,
            title: 'Risk Identification & Mitigation',
            description: 'Catalog technical risks and define mitigation strategies.',
            actions: [
              'Identify technical risks: third-party API stability, scalability limits, security vulnerabilities',
              'Assign probability (1–5) and impact (1–5) to each risk; calculate risk score = P × I',
              'Prioritize top risks (score ≥ 12) for immediate mitigation planning',
              'Define mitigation strategies: fallback implementations, vendor alternatives, scope reductions',
              'Establish risk monitoring checkpoints at key project milestones',
            ],
          },
          {
            step: 5,
            title: 'Feasibility Verdict & Recommendations',
            description: 'Synthesize findings into a go/no-go recommendation with conditions.',
            actions: [
              'Score overall feasibility: Technical, Resource, Timeline, Cost (0–100 each)',
              'Compute weighted feasibility index based on project priorities',
              'Produce go/no-go/conditional recommendation with rationale',
              'List preconditions for feasibility: PoC success criteria, hire timelines, scope reductions',
              'Document assumptions and re-evaluation triggers (technology changes, team changes)',
            ],
          },
        ],
        summary: `Technical feasibility study for "${data.projectName}" assessing technology suitability, resource gaps, risks, and timeline viability with a structured go/no-go recommendation.`,
      },
      duration: Date.now() - start,
    };
  },
};
