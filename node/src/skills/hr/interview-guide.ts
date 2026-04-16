import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface InterviewGuideInput {
  role: string;
  level?: string;
  techStack?: string;
}

export interface InterviewGuideOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const interviewGuideSkill: Skill<InterviewGuideInput, InterviewGuideOutput> = {
  name: 'interview-guide',
  category: SkillCategory.CUSTOM,
  description: 'Structured technical interview process: JD alignment, screening, coding challenge, system design, culture fit, and debrief.',
  version: '1.0.0',
  async execute(input: SkillInput<InterviewGuideInput>): Promise<SkillOutput<InterviewGuideOutput>> {
    const data = input as unknown as InterviewGuideInput;
    const start = Date.now();
    const role = data.role || 'engineer';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'JD Alignment & Scorecard',
            description: 'Map job description requirements to measurable competencies before any candidate touches the funnel.',
            actions: [
              'List top 5 must-have technical competencies from JD',
              'Define behavioral competencies aligned to team values',
              'Create scorecard with 1-4 rating scale per competency',
              'Assign each interview round to specific competency coverage',
              'Align hiring committee on target bar before sourcing begins',
            ],
          },
          {
            step: 2,
            title: 'Recruiter Screening',
            description: '30-minute call to verify baseline qualification, motivation, and logistics before technical investment.',
            actions: [
              'Confirm role expectations, level, and compensation alignment',
              'Assess communication clarity and articulation of past impact',
              'Verify availability, notice period, and work authorization',
              'Gauge motivation: why this company, why now',
              'Document screening notes in ATS within 24h',
            ],
          },
          {
            step: 3,
            title: 'Coding Challenge',
            description: 'Evaluate problem-solving, code quality, and technical depth via a time-boxed coding exercise.',
            actions: [
              'Select problem relevant to day-to-day work (not brain teasers)',
              'Use live coding (CoderPad) or take-home with 72h window',
              'Assess: correctness, edge case handling, time/space complexity',
              'Review code readability, naming, and test coverage',
              'Debrief candidate on their approach and explore trade-offs',
            ],
          },
          {
            step: 4,
            title: 'System Design Interview',
            description: 'Assess architectural thinking and ability to design scalable systems under ambiguity.',
            actions: [
              'Present open-ended design prompt relevant to company scale',
              'Evaluate: requirements clarification, component decomposition',
              'Probe scaling bottlenecks, failure modes, and trade-offs',
              'Assess data modeling choices and API contract design',
              'Look for collaboration signals: does candidate ask clarifying questions',
            ],
          },
          {
            step: 5,
            title: 'Culture & Values Fit',
            description: 'Evaluate alignment with team culture, collaboration style, and growth mindset.',
            actions: [
              'Use behavioral questions anchored in STAR format',
              'Probe conflict resolution: give a specific past example',
              'Assess ownership mindset: how did you handle a failure',
              'Evaluate curiosity: what have you learned recently outside work',
              'Check for red flags: blame shifting, lack of introspection',
            ],
          },
          {
            step: 6,
            title: 'Hiring Committee Debrief',
            description: 'Structured debrief to aggregate signal and make a calibrated hiring decision.',
            actions: [
              'Each interviewer submits independent scorecard before debrief',
              'Structured discussion: start with strongest signal, then concerns',
              'Avoid anchoring bias: discuss evidence, not impressions',
              'Reach consensus or escalate to hiring manager for tie-break',
              'Document decision rationale and feedback for candidate',
            ],
          },
        ],
        summary: `Interview guide for ${role} role completed: 6-round process from JD alignment through committee debrief ensures consistent, bias-reduced hiring decisions.`,
      },
      duration: Date.now() - start,
    };
  },
};
