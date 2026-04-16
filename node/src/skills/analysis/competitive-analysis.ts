import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface CompetitiveAnalysisInput {
  productName: string;
  competitors: string[];
  dimensions?: string[];
}

export interface CompetitiveAnalysisOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const competitiveAnalysisSkill: Skill<CompetitiveAnalysisInput, CompetitiveAnalysisOutput> = {
  name: 'competitive-analysis',
  category: SkillCategory.ANALYSIS,
  description: 'Perform systematic competitive analysis to identify market positioning, feature gaps, and strategic opportunities.',
  version: '1.0.0',
  async execute(input: SkillInput<CompetitiveAnalysisInput>): Promise<SkillOutput<CompetitiveAnalysisOutput>> {
    const data = input as unknown as CompetitiveAnalysisInput;
    const start = Date.now();
    const competitors = data.competitors ?? [];
    const dimensions = data.dimensions ?? ['features', 'pricing', 'UX', 'integrations', 'support'];
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Scope & Competitor Set',
            description: 'Establish analysis boundaries and finalize the competitor list.',
            actions: [
              `Confirm target product: "${data.productName}"`,
              `Validate competitor list: ${competitors.join(', ') || 'research required'}`,
              'Categorize competitors: direct (same market, same solution), indirect (different solution, same problem), potential entrants',
              'Define analysis dimensions: ' + dimensions.join(', '),
              'Set timeframe for data freshness (e.g., data no older than 6 months)',
            ],
          },
          {
            step: 2,
            title: 'Data Collection',
            description: 'Gather comprehensive data on each competitor across all dimensions.',
            actions: [
              'Review competitor websites, product pages, and pricing pages for feature lists',
              'Sign up for free trials or demos of competing products to conduct first-hand evaluation',
              'Analyze G2, Capterra, and Trustpilot reviews for recurring praise and complaints',
              'Monitor competitor job postings to infer product roadmap directions',
              'Collect public API documentation, changelogs, and press releases',
            ],
          },
          {
            step: 3,
            title: 'Feature & Capability Benchmarking',
            description: 'Score and rank competitors on each analysis dimension.',
            actions: [
              'Build comparison matrix with competitors as columns and dimensions as rows',
              'Score each competitor 1–5 on each dimension using a defined rubric',
              'Identify feature parity gaps: capabilities competitors have that the target product lacks',
              'Identify differentiators: capabilities the target product has that competitors lack',
              'Flag table-stakes features (offered by >80% of competitors) vs. differentiators',
            ],
          },
          {
            step: 4,
            title: 'SWOT & Positioning Analysis',
            description: 'Synthesize findings into strategic positioning insights.',
            actions: [
              'Construct SWOT matrix for the target product relative to competitors',
              'Map competitors on a 2x2 positioning chart (e.g., price vs. features, enterprise vs. SMB)',
              'Identify blue ocean opportunities: underserved segments or uncontested feature areas',
              'Document pricing strategy patterns (freemium, seat-based, usage-based, tiered)',
              'Assess competitor go-to-market strategies: channels, messaging, target personas',
            ],
          },
          {
            step: 5,
            title: 'Strategic Recommendations',
            description: 'Translate analysis into actionable product and positioning recommendations.',
            actions: [
              'Prioritize feature gaps by user demand frequency and strategic importance',
              'Define clear differentiation statements for marketing and sales positioning',
              'Recommend pricing adjustments based on competitive landscape',
              'Identify partnership or integration opportunities based on competitor gaps',
              'Schedule quarterly review cadence to keep competitive intelligence current',
            ],
          },
        ],
        summary: `Competitive analysis for "${data.productName}" against ${competitors.length || 'identified'} competitors across ${dimensions.length} dimensions, producing SWOT analysis and strategic recommendations.`,
      },
      duration: Date.now() - start,
    };
  },
};
