import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PerformanceReviewInput {
  employeeName: string;
  reviewPeriod?: string;
  role?: string;
}

export interface PerformanceReviewOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const performanceReviewSkill: Skill<PerformanceReviewInput, PerformanceReviewOutput> = {
  name: 'performance-review',
  category: SkillCategory.CUSTOM,
  description: 'End-to-end performance review process: self-assessment, 360 feedback, metrics review, growth planning, and calibration.',
  version: '1.0.0',
  async execute(input: SkillInput<PerformanceReviewInput>): Promise<SkillOutput<PerformanceReviewOutput>> {
    const data = input as unknown as PerformanceReviewInput;
    const start = Date.now();
    const employee = data.employeeName || 'employee';
    const period = data.reviewPeriod || 'review period';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Self-Assessment',
            description: 'Employee reflects on accomplishments, challenges, and growth areas for the review period.',
            actions: [
              'List key accomplishments with measurable impact (use OKR/KPI data)',
              'Identify 2-3 areas where performance fell short of expectations',
              'Reflect on collaboration and influence beyond direct responsibilities',
              'Articulate skill development achieved during the period',
              'Propose growth goals for next cycle with development support needed',
            ],
          },
          {
            step: 2,
            title: '360-Degree Feedback Collection',
            description: 'Gather structured feedback from peers, direct reports, and cross-functional partners.',
            actions: [
              'Select 4-6 reviewers covering different working relationships',
              'Send structured survey with specific competency questions',
              'Set deadline 2 weeks before review meeting',
              'Anonymize and aggregate feedback to protect reviewer safety',
              'Identify consistent themes across multiple respondents',
            ],
          },
          {
            step: 3,
            title: 'Metrics & Outcomes Review',
            description: 'Assess quantitative performance against agreed goals and team contribution metrics.',
            actions: [
              'Pull OKR completion rates and KPI actuals vs targets',
              'Review delivery quality: defect rates, on-time delivery, customer satisfaction',
              'Assess contribution to team health: mentoring, code review, documentation',
              'Compare performance trajectory vs same period prior year',
              'Flag any extenuating circumstances affecting results',
            ],
          },
          {
            step: 4,
            title: 'Growth & Development Plan',
            description: 'Co-create an actionable development plan with specific milestones and support commitments.',
            actions: [
              'Identify top 2 growth areas based on combined self/360/metrics data',
              'Define SMART development goals for next 6-12 months',
              'Agree on concrete development activities: courses, projects, mentors',
              'Manager commits to specific support actions and check-in cadence',
              'Document plan in performance management system',
            ],
          },
          {
            step: 5,
            title: 'Calibration Session',
            description: 'Normalize ratings across the team to ensure fairness and consistency in performance distribution.',
            actions: [
              'Manager presents draft ratings to peer manager calibration panel',
              'Discuss outliers: unusually high or low ratings require evidence',
              'Check for bias patterns: demographic, proximity, recency',
              'Finalize ratings within agreed distribution guidelines',
              'Communicate final ratings to employees with specific rationale',
            ],
          },
        ],
        summary: `Performance review process for ${employee} (${period}) completed: 5-step framework ensures fair, evidence-based assessment with actionable growth planning.`,
      },
      duration: Date.now() - start,
    };
  },
};
