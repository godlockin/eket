import type { Skill, SkillInput, SkillOutput } from '../types.js';

export interface RoadmapPrioritizationInput {
  productName: string;
  features?: string[];
  horizon?: string;
  framework?: 'RICE' | 'MoSCoW' | 'WSJF' | 'ICE';
}

export interface RoadmapPrioritizationOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const roadmapPrioritizationSkill: Skill<RoadmapPrioritizationInput, RoadmapPrioritizationOutput> = {
  name: 'roadmap-prioritization',
  category: 'planning',
  description: 'Prioritize product roadmap features using structured scoring frameworks to maximize business value and strategic alignment.',
  version: '1.0.0',
  async execute(input: SkillInput<RoadmapPrioritizationInput>): Promise<SkillOutput<RoadmapPrioritizationOutput>> {
    const data = input as unknown as RoadmapPrioritizationInput;
    const start = Date.now();
    const features = data.features ?? [];
    const horizon = data.horizon ?? '12 months';
    const framework = data.framework ?? 'RICE';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Feature Inventory & Categorization',
            description: 'Compile and categorize all candidate features before scoring.',
            actions: [
              `Compile feature list for "${data.productName}": ${features.join(', ') || 'gather from backlog, stakeholder requests, support tickets'}`,
              'Categorize features: new capability, improvement, technical debt, compliance, bug fix',
              'Define planning horizon: ' + horizon,
              'Remove duplicate requests by merging similar features; tag with stakeholder sources',
              'Ensure each feature has a clear problem statement and rough effort estimate before scoring',
            ],
          },
          {
            step: 2,
            title: 'Select & Apply Scoring Framework',
            description: `Apply the ${framework} scoring framework consistently across all features.`,
            actions: [
              `Apply ${framework} framework: ${
                framework === 'RICE'
                  ? 'Score Reach × Impact × Confidence / Effort for each feature'
                  : framework === 'MoSCoW'
                  ? 'Classify features as Must Have, Should Have, Could Have, Won\'t Have'
                  : framework === 'WSJF'
                  ? 'Calculate Weighted Shortest Job First = Cost of Delay / Job Size'
                  : 'Score Impact × Confidence × Ease (1–10 each); Priority = I×C×E'
              }`,
              'Run scoring workshop with cross-functional team (PM, engineering, design, sales)',
              'Use dot voting or anonymous scoring to prevent HiPPO (Highest Paid Person\'s Opinion) bias',
              'Document scoring rationale for top 20 features for future audit trail',
              'Normalize scores to percentage ranking for comparison across frameworks',
            ],
          },
          {
            step: 3,
            title: 'Strategic Alignment Check',
            description: 'Validate top-ranked features against company strategy and OKRs.',
            actions: [
              'Map each top-10 feature to at least one current OKR or strategic initiative',
              'Flag features with high scores but no strategic alignment for deprioritization',
              'Identify "strategic bets": low-score features with high strategic importance (executive mandate)',
              'Verify no regulatory or compliance requirements are being deprioritized below critical threshold',
              'Balance quick wins (low effort, high impact) with strategic investments (high effort, transformative)',
            ],
          },
          {
            step: 4,
            title: 'Dependency Mapping & Sequencing',
            description: 'Identify feature dependencies and create an achievable delivery sequence.',
            actions: [
              'Build dependency graph: identify features that are prerequisites for others',
              'Resolve circular dependencies through scope reduction or phasing',
              'Group features into coherent themes for release narrative and marketing alignment',
              'Sequence themes into quarters based on dependencies, capacity, and strategic timing',
              'Identify critical path features that block multiple downstream items',
            ],
          },
          {
            step: 5,
            title: 'Roadmap Publication & Review Cadence',
            description: 'Communicate the prioritized roadmap and establish a regular review process.',
            actions: [
              'Create three-level roadmap views: executive (themes), product (features), team (epics)',
              'Publish roadmap with explicit confidence levels: committed, likely, aspirational',
              'Share roadmap with stakeholders; collect structured feedback via survey or walkthrough',
              'Establish quarterly roadmap review cadence tied to OKR planning cycle',
              'Document reprioritization decisions with rationale to maintain stakeholder trust',
            ],
          },
        ],
        summary: `Roadmap prioritization for "${data.productName}" using ${framework} framework over ${horizon} horizon, covering ${features.length || 'all candidate'} features with strategic alignment validation and sequenced delivery plan.`,
      },
      duration: Date.now() - start,
    };
  },
};
