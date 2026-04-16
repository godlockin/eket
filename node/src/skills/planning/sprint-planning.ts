import type { Skill, SkillInput, SkillOutput } from '../types.js';

export interface SprintPlanningInput {
  sprintNumber: number;
  teamCapacity?: number;
  backlogItems?: string[];
  sprintGoal?: string;
}

export interface SprintPlanningOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const sprintPlanningSkill: Skill<SprintPlanningInput, SprintPlanningOutput> = {
  name: 'sprint-planning',
  category: 'planning',
  description: 'Run a structured sprint planning ceremony to define sprint goal, select backlog items, and create actionable sprint plan.',
  version: '1.0.0',
  async execute(input: SkillInput<SprintPlanningInput>): Promise<SkillOutput<SprintPlanningOutput>> {
    const data = input as unknown as SprintPlanningInput;
    const start = Date.now();
    const teamCapacity = data.teamCapacity ?? 40;
    const backlogItems = data.backlogItems ?? [];
    const sprintGoal = data.sprintGoal ?? 'TBD';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Backlog Refinement Pre-Check',
            description: 'Ensure the product backlog is adequately groomed before sprint planning begins.',
            actions: [
              `Confirm Sprint ${data.sprintNumber} backlog contains enough refined items (2x velocity buffer)`,
              'Verify all candidate items have acceptance criteria, story points, and no open blockers',
              'Remove outdated items; re-estimate items where scope has changed since last refinement',
              'Sort backlog by business value × confidence score to surface highest-ROI items',
              'Distribute pre-read materials (backlog snapshot, velocity chart) to team 24h before planning',
            ],
          },
          {
            step: 2,
            title: 'Define Sprint Goal',
            description: 'Collaboratively establish a meaningful, achievable sprint goal.',
            actions: [
              `Draft sprint goal (current: "${sprintGoal}") using the format: "By end of sprint, we will [outcome] so that [benefit]"`,
              'Validate goal alignment with product roadmap and quarterly OKRs',
              "Ensure goal is testable: define how we'll know if the goal is achieved",
              'Get explicit agreement from product owner and team on the sprint goal',
              'Communicate sprint goal to stakeholders within 24h of planning completion',
            ],
          },
          {
            step: 3,
            title: 'Capacity Planning',
            description: 'Calculate available team capacity accounting for leave, meetings, and overhead.',
            actions: [
              `Calculate raw capacity: ${teamCapacity} story points available this sprint`,
              'Subtract individual leave days, company holidays, and recurring ceremonies overhead (≈15%)',
              'Account for non-feature work: bug fixes (15%), tech debt (10%), on-call (5%)',
              'Compute net feature capacity and communicate ceiling to product owner',
              'Maintain a per-person capacity breakdown to identify bottlenecks and specialization conflicts',
            ],
          },
          {
            step: 4,
            title: 'Story Selection & Task Breakdown',
            description: 'Select stories from the backlog and break them into implementation tasks.',
            actions: [
              `Select stories from backlog: ${backlogItems.join(', ') || 'pull from prioritized backlog'} up to capacity`,
              'For each selected story, decompose into tasks ≤ 1 day each for daily tracking',
              'Identify technical dependencies and sequence tasks to unblock parallel work',
              'Assign task owners based on expertise and load balancing across the team',
              'Flag stories with unknowns as "spikes" with a time-boxed investigation budget',
            ],
          },
          {
            step: 5,
            title: 'Commitment & Risk Acknowledgment',
            description: 'Finalize sprint commitment and surface risks before work begins.',
            actions: [
              'Walk through sprint board as a team; confirm everyone understands their tasks',
              'Identify integration risks: stories that depend on external teams or APIs',
              'Define escalation path for blockers: who to contact and SLA for response',
              'Document sprint plan in project management tool (Jira/Linear) with all tasks assigned',
              'Schedule daily standup time and retrospective/review date before leaving the meeting',
            ],
          },
        ],
        summary: `Sprint ${data.sprintNumber} planning with team capacity of ${teamCapacity} points, goal "${sprintGoal}", selecting ${backlogItems.length || 'prioritized'} backlog items with task breakdown and risk acknowledgment.`,
      },
      duration: Date.now() - start,
    };
  },
};
