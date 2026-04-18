/**
 * EKET Framework - Blameless Postmortem Analysis Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PostmortemAnalysisInput {
  /** Incident ID or title */
  incidentId: string;
  /** Incident summary */
  summary?: string;
  /** Service(s) affected */
  affectedServices?: string[];
  /** Duration of incident in minutes */
  durationMinutes?: number;
  /** Severity: P0, P1, P2, P3 */
  severity?: string;
  /** Customer impact description */
  customerImpact?: string;
}

export interface PostmortemAnalysisOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const postmortemAnalysisSkill: Skill<PostmortemAnalysisInput, PostmortemAnalysisOutput> = {
  name: 'postmortem-analysis',
  category: SkillCategory.OPS,
  description: 'Blameless postmortem: timeline reconstruction, root cause analysis, contributing factors, action items.',
  version: '1.0.0',
  tags: ['ops', 'postmortem', 'incident', 'root-cause', 'reliability', 'blameless'],

  async execute(input: SkillInput<PostmortemAnalysisInput>): Promise<SkillOutput<PostmortemAnalysisOutput>> {
    const data = input.data as unknown as PostmortemAnalysisInput;
    const start = Date.now();
    const incident = data.incidentId ?? 'incident';
    const severity = data.severity ?? 'P1';
    const duration = data.durationMinutes ?? 0;
    const services = data.affectedServices?.join(', ') ?? 'affected services';
    const impact = data.customerImpact ?? 'customer impact not specified';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Assemble Postmortem Team & Establish Blameless Culture',
            description: 'Bring together all stakeholders and set ground rules for a psychologically safe review.',
            actions: [
              `Assign postmortem lead (facilitator, not a participant) for ${incident}`,
              'Invite all responders + oncall engineers + service owners for affected services: ${services}',
              'Establish blameless charter: focus on systems and processes, not individual blame',
              'Set review meeting within 48-72 hours while details are fresh',
              `Collect initial incident data: ${severity} severity, ${duration} minute duration, impact: ${impact}`,
            ],
          },
          {
            step: 2,
            title: 'Reconstruct Incident Timeline',
            description: 'Build a precise, chronological timeline from all available data sources.',
            actions: [
              'Gather raw data: monitoring alerts, deployment logs, Slack/Teams messages, on-call notes',
              'Plot timeline: detection time, escalation time, mitigation time, resolution time',
              'Calculate key metrics: MTTD (mean time to detect), MTTR (mean time to resolve)',
              'Identify gaps: periods where responders had no information or wrong information',
              'Note all actions taken: commands run, config changes, rollbacks — with exact timestamps',
            ],
          },
          {
            step: 3,
            title: 'Identify Root Cause(s) Using 5 Whys',
            description: 'Drill from symptoms to systemic root causes using structured causal analysis.',
            actions: [
              'Start with the observable symptom: what did users/monitors see first?',
              'Apply 5 Whys iteratively: for each answer, ask "Why did this happen?"',
              'Validate causal chain: each step must be supported by evidence (logs, metrics, code)',
              'Identify multiple root causes if present: avoid single-cause oversimplification',
              'Distinguish root cause from contributing factors and trigger events',
            ],
          },
          {
            step: 4,
            title: 'Analyze Contributing Factors & System Weaknesses',
            description: 'Identify the broader systemic conditions that allowed the incident to occur.',
            actions: [
              'Review detection gap: why did monitoring not catch this sooner?',
              'Review response gap: were runbooks outdated or missing? Was oncall rotation adequate?',
              'Review blast radius: why did failure affect ${services} rather than being contained?',
              'Identify missing safeguards: circuit breakers, feature flags, canary deployments',
              'Map each weakness to an improvement category: monitoring, process, architecture, tooling',
            ],
          },
          {
            step: 5,
            title: 'Define Action Items with Owners & Deadlines',
            description: 'Convert findings into concrete, measurable improvements with clear accountability.',
            actions: [
              'For each root cause: define 1-2 specific action items that directly prevent recurrence',
              'Classify actions: Immediate (< 1 week), Short-term (1 month), Long-term (quarter)',
              'Assign single DRI (directly responsible individual) per action item',
              'Write acceptance criteria: how will we know this action is complete and effective?',
              'Create Jira tickets / GitHub issues for all action items with postmortem link',
            ],
          },
          {
            step: 6,
            title: 'Publish Postmortem & Track Follow-Through',
            description: 'Share learnings broadly and ensure action items are completed.',
            actions: [
              'Write postmortem document: summary, timeline, root cause, contributing factors, action items',
              'Share internally: engineering all-hands, team channel, confluence — within 5 business days',
              `Publish ${severity === 'P0' || severity === 'P1' ? 'public status page update' : 'internal summary'} for stakeholders`,
              'Schedule 30-day follow-up: review action item completion rate, measure recurrence',
              'Add incident to reliability trends: track monthly incident count, MTTR, and severity distribution',
            ],
          },
        ],
        summary: `Blameless postmortem for ${incident} (${severity}, ${duration}min, services: ${services}): assembled review team, reconstructed timeline, identified root causes via 5 Whys, mapped contributing factors, defined action items with owners, published and tracked follow-through.`,
      },
      duration: Date.now() - start,
    };
  },
};
