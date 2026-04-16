import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface OnboardingGuideInput {
  projectName: string;
  stackDescription?: string;
  teamSize?: number;
  onboardingDays?: number;
}

export interface OnboardingGuideOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const onboardingGuideSkill: Skill<OnboardingGuideInput, OnboardingGuideOutput> = {
  name: 'onboarding-guide',
  category: SkillCategory.DOCUMENTATION,
  description: 'Structured developer onboarding guide — from day 0 setup to first production PR in 30 days',
  version: '1.0.0',
  async execute(input: SkillInput<OnboardingGuideInput>): Promise<SkillOutput<OnboardingGuideOutput>> {
    const data = input as unknown as OnboardingGuideInput;
    const start = Date.now();
    const projectName = data.projectName || 'project';
    const stack = data.stackDescription || 'Node.js + TypeScript + PostgreSQL';
    const teamSize = data.teamSize || 8;
    const days = data.onboardingDays || 30;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Pre-Arrival Setup (Before Day 1)',
            description: 'Remove friction before the engineer arrives — wasted day-1 setup is wasted trust.',
            actions: [
              'Provision accounts: GitHub org, Slack, Jira, cloud console, monitoring tools — before first day',
              'Hardware ready: dev machine set up, credentials accessible, VPN configured',
              'Buddy assignment: identify an experienced team member as dedicated 30-day buddy',
              'Week-1 calendar: pre-schedule 1:1s with team lead, buddy, product, and key stakeholders',
              `Pre-read materials: architecture overview, team norms doc, README for ${projectName} — sent before day 1`,
              'First ticket prepared: a well-scoped "good first issue" ready and waiting',
            ],
          },
          {
            step: 2,
            title: 'Day 1: Local Development Environment',
            description: 'Getting to a running local environment is the most critical first-day goal.',
            actions: [
              `Stack: ${stack} — document exact version requirements (Node version, DB version)`,
              'Automated setup: provide `./scripts/setup.sh` that installs all dependencies in one command',
              'Environment variables: `.env.example` with all required vars and explanations — `cp .env.example .env`',
              'Seed data: `npm run db:seed` populates DB with realistic test data for local development',
              'Verification: `npm run dev` → app running at localhost:3000, all health checks green',
              'Troubleshooting guide: document 5 most common setup errors with exact resolution steps',
            ],
          },
          {
            step: 3,
            title: 'Week 1: Codebase Orientation',
            description: 'Build a mental model of the codebase before writing code.',
            actions: [
              `Architecture walkthrough (2hr session): explain ${projectName} system design, data flow, key design decisions`,
              'Repository tour: directory structure, naming conventions, key files and their purposes',
              'Read architecture ADRs: understand why key decisions were made (language, DB, framework)',
              'Shadowing: pair with buddy on a real feature — observer role, ask questions freely',
              'Read recent PRs: 10 merged PRs = understand code style, review norms, deployment flow',
              'Glossary: write down domain terms that are confusing — add to team wiki (improves docs for all)',
            ],
          },
          {
            step: 4,
            title: 'Week 2: First Contribution',
            description: 'Deliver real value early — builds confidence and validates knowledge.',
            actions: [
              'First ticket: bug fix or small feature, pre-scoped to <1 day, no ambiguity in acceptance criteria',
              'TDD approach encouraged: write failing test first to understand expected behavior',
              'Pair programming: buddy pair-programs for first PR — knowledge transfer in both directions',
              'PR process: follow PR template, run all CI checks locally before pushing, request buddy review',
              'Deployment walkthrough: buddy walks through how the PR gets deployed to production',
              'Retrospective: 30min with buddy after first PR — what was confusing? What docs need improving?',
            ],
          },
          {
            step: 5,
            title: 'Days 15-30: Independence Ramp-Up',
            description: 'Gradually increase autonomy and scope of work.',
            actions: [
              'Week 3: take ticket independently (buddy available for questions, not pair-programming)',
              'Week 4: own a feature end-to-end — requirements, implementation, tests, deployment',
              `Team norms: code style guide, git workflow (branch naming, commit messages), PR expectations for team of ${teamSize}`,
              'On-call training: shadow on-call rotation for 1 week before going solo',
              'Security training: mandatory — secret management, OWASP top 10, access control patterns',
              'Calibration 1:1 (day 30): manager reviews expectations vs actual ramp-up, sets next 60-day goals',
            ],
          },
          {
            step: 6,
            title: 'Living Onboarding Docs',
            description: 'Onboarding docs that aren\'t maintained are misleading — build a feedback loop.',
            actions: [
              `Target: new engineer productive (first PR merged) within ${Math.round(days / 4)} days of joining`,
              'Feedback loop: every new hire updates docs when they find gaps — "you document what confused you"',
              'Onboarding checklist: single Notion/Confluence page with daily tasks for weeks 1-4',
              'Video walkthroughs: record architecture and dev setup sessions (Loom) — reduces repetition',
              'Quarterly review: team lead verifies all links work, versions are current, setup script still works',
              'Metrics: track time-to-first-PR across hires — regression signals documentation gaps',
            ],
          },
        ],
        summary: `Developer onboarding guide for "${projectName}" (${stack}) — ${days}-day ramp-up plan for a team of ${teamSize}. 6-phase: pre-arrival → day-1 env setup → week-1 orientation → first contribution → independence ramp → living docs.`,
      },
      duration: Date.now() - start,
    };
  },
};
