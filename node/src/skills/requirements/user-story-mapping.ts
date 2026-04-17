import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface UserStoryMappingInput {
  productName: string;
  userPersonas?: string[];
  activities?: string[];
  releaseTarget?: string;
}

export interface UserStoryMappingOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const userStoryMappingSkill: Skill<UserStoryMappingInput, UserStoryMappingOutput> = {
  name: 'user-story-mapping',
  category: SkillCategory.REQUIREMENTS,
  description: 'Build a user story map to visualize user journeys, slice releases by value, and align team on MVP scope.',
  version: '1.0.0',
  async execute(input: SkillInput<UserStoryMappingInput>): Promise<SkillOutput<UserStoryMappingOutput>> {
    const data = input.data as unknown as UserStoryMappingInput;
    const start = Date.now();
    const userPersonas = data.userPersonas ?? [];
    const activities = data.activities ?? [];
    const releaseTarget = data.releaseTarget ?? 'MVP';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define User Personas & Journeys',
            description: 'Establish who the users are and what high-level activities they perform.',
            actions: [
              `Define user personas for "${data.productName}": ${userPersonas.join(', ') || 'conduct user research to identify personas'}`,
              'For each persona, write a narrative: "A day in the life" covering all system touchpoints',
              'Identify primary activities (backbone): the major things users do in the system',
              `Map ${activities.length || 'identified'} activities in left-to-right sequence matching user workflow: ${activities.join(' → ') || 'TBD'}`,
              'Validate activity sequence with real users through lightweight walkthrough sessions',
            ],
          },
          {
            step: 2,
            title: 'Decompose Activities into User Tasks',
            description: 'Break down each activity into specific user tasks (story map backbone tasks).',
            actions: [
              'For each activity, identify 3–8 specific tasks users perform to complete the activity',
              'Write tasks as user actions: "Search for product", "Add item to cart", "Enter payment details"',
              'Ensure tasks flow horizontally under each activity in chronological execution order',
              'Identify shared tasks that span multiple activities or personas',
              'Use sticky notes (physical or digital: Miro/FigJam) — one task per note, color-coded by persona',
            ],
          },
          {
            step: 3,
            title: 'Write User Stories Under Tasks',
            description: 'Generate user stories that implement each task at varying detail levels.',
            actions: [
              'Write 1–5 user stories per task using format: "As a [persona], I want [action] so that [benefit]"',
              'Arrange stories vertically under each task, most essential at top, nice-to-have at bottom',
              'Add story details: acceptance criteria sketches, UI mockup links, technical notes',
              'Identify story dependencies: draw arrows between stories that have ordering constraints',
              'Apply INVEST criteria check: Independent, Negotiable, Valuable, Estimable, Small, Testable',
            ],
          },
          {
            step: 4,
            title: 'Release Slicing',
            description: 'Draw horizontal slices across the story map to define releases by delivered outcome.',
            actions: [
              `Define release goal for "${releaseTarget}": minimum functionality to deliver core user value`,
              'Draw release slice lines: cut across the map to include the top stories needed per release',
              'Validate each slice delivers a coherent, independently shippable outcome for users',
              'Ensure each release slice tells a complete user story narrative (no orphaned steps)',
              'Label releases: MVP / Release 1.0 / Release 1.1 with target dates and success metrics',
            ],
          },
          {
            step: 5,
            title: 'Refinement & Team Alignment',
            description: 'Refine the story map with the full team and use it as a living planning artifact.',
            actions: [
              'Walk the full story map with cross-functional team; surface assumptions and gaps',
              'Identify stories with high uncertainty — convert to spikes or discovery work items',
              'Estimate story points for stories in next release slice during map review session',
              'Export story map to project management tool (Jira/Linear) as epics → stories → tasks hierarchy',
              'Schedule monthly story map review to add new discoveries and re-slice future releases',
            ],
          },
        ],
        summary: `User story map for "${data.productName}" with ${userPersonas.length || 'defined'} personas across ${activities.length || 'identified'} activities, release-sliced targeting "${releaseTarget}" with full team alignment.`,
      },
      duration: Date.now() - start,
    };
  },
};
