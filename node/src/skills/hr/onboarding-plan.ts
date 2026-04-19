import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface OnboardingPlanInput {
  employeeName: string;
  role?: string;
  team?: string;
}

export interface OnboardingPlanOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const onboardingPlanSkill: Skill<OnboardingPlanInput, OnboardingPlanOutput> = {
  name: 'onboarding-plan',
  category: SkillCategory.HR,
  description: 'Structured new hire onboarding plan covering Day 1, Week 1, Month 1, 90-day milestones, and feedback loop.',
  version: '1.0.0',
  async execute(input: SkillInput<OnboardingPlanInput>): Promise<SkillOutput<OnboardingPlanOutput>> {
    const data = input.data as unknown as OnboardingPlanInput;
    const start = Date.now();
    const employee = data.employeeName || 'new hire';
    const role = data.role || 'the role';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Day 1: Orientation & Welcome',
            description: 'Ensure the new hire feels welcomed, has working tools, and understands the company mission on day one.',
            actions: [
              'Send welcome email with schedule, parking, and dress code before start date',
              'Prepare workstation: laptop, accounts, Slack, GitHub, email all provisioned',
              'CEO or team lead delivers 30-min company mission and values talk',
              'Assign onboarding buddy for first 30 days of informal guidance',
              'Lunch with immediate team to build early social connections',
            ],
          },
          {
            step: 2,
            title: 'Week 1: Foundation Building',
            description: 'Establish context about the product, codebase, processes, and team workflows.',
            actions: [
              'Product demo and customer journey walkthrough with PM',
              'Architecture overview session with senior engineer',
              'Complete dev environment setup and submit first trivial PR',
              'Shadow customer support or sales call for user empathy',
              'End-of-week 1:1 with manager to surface early blockers',
            ],
          },
          {
            step: 3,
            title: 'Month 1: First Contribution',
            description: 'Deliver a meaningful contribution while deepening technical and cross-functional knowledge.',
            actions: [
              'Complete first production-impacting task with code review',
              'Attend all team rituals: standups, retros, planning, demos',
              'Meet with 5+ cross-functional partners (design, data, ops)',
              'Read and annotate key architecture decision records (ADRs)',
              'Complete required compliance and security training modules',
            ],
          },
          {
            step: 4,
            title: '90-Day Milestone Review',
            description: 'Assess ramp progress, recalibrate expectations, and set goals for the first full quarter.',
            actions: [
              'Review 30/60/90 day goals set at start of onboarding',
              'Manager provides structured written feedback on progress',
              'New hire shares candid feedback on onboarding experience',
              'Set OKRs for next quarter aligned to team and company goals',
              'Transition from onboarding track to full team contribution mode',
            ],
          },
          {
            step: 5,
            title: 'Feedback Loop & Program Improvement',
            description: 'Systematically capture onboarding experience to continuously improve the program.',
            actions: [
              'Send standardized onboarding NPS survey at 30, 60, and 90 days',
              'Aggregate qualitative feedback from buddy and manager',
              'Identify top 3 friction points in onboarding experience',
              'Update onboarding checklist and docs based on findings',
              'Share anonymized insights with HR and team leads quarterly',
            ],
          },
        ],
        summary: `Onboarding plan for ${employee} (${role}) completed: 5-phase program from Day 1 orientation through 90-day milestone ensures rapid ramp and early engagement.`,
      },
      duration: Date.now() - start,
    };
  },
};
