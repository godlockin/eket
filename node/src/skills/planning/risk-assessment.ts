import type { Skill, SkillInput, SkillOutput } from '../types.js';

export interface RiskAssessmentInput {
  projectName: string;
  domains?: string[];
  riskTolerance?: 'low' | 'medium' | 'high';
}

export interface RiskAssessmentOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const riskAssessmentSkill: Skill<RiskAssessmentInput, RiskAssessmentOutput> = {
  name: 'risk-assessment',
  category: 'planning',
  description: 'Perform structured project risk assessment: identify, analyze, prioritize, and create mitigation plans for key risks.',
  version: '1.0.0',
  async execute(input: SkillInput<RiskAssessmentInput>): Promise<SkillOutput<RiskAssessmentOutput>> {
    const data = input as unknown as RiskAssessmentInput;
    const start = Date.now();
    const domains = data.domains ?? ['technical', 'resource', 'schedule', 'scope', 'external'];
    const riskTolerance = data.riskTolerance ?? 'medium';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Risk Identification',
            description: 'Systematically identify risks across all project domains using structured techniques.',
            actions: [
              `Identify risks for "${data.projectName}" across domains: ${domains.join(', ')}`,
              'Conduct risk brainstorming workshop with team using "What could go wrong?" prompts per domain',
              'Review historical risks from similar past projects (lessons learned register)',
              'Analyze project assumptions log — each false assumption is a potential risk',
              'Produce initial risk register with: ID, description, category, trigger conditions, and owner',
            ],
          },
          {
            step: 2,
            title: 'Qualitative Risk Analysis',
            description: 'Score each risk by probability and impact to prioritize assessment effort.',
            actions: [
              'Rate each risk: Probability (1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Almost Certain)',
              'Rate each risk: Impact (1=Negligible, 2=Minor, 3=Moderate, 4=Major, 5=Catastrophic)',
              'Calculate Risk Score = Probability × Impact; categorize: Low (1–4), Medium (5–12), High (15–25)',
              `Apply risk tolerance filter (${riskTolerance}): escalate risks above tolerance threshold immediately`,
              'Visualize risks on a 5×5 heat map to communicate risk landscape to stakeholders',
            ],
          },
          {
            step: 3,
            title: 'Quantitative Analysis for Top Risks',
            description: 'Apply quantitative analysis to high-priority risks to support decision-making.',
            actions: [
              'Select top 20% of risks (by score) for quantitative analysis',
              'Estimate Expected Monetary Value (EMV): EMV = Probability% × Financial Impact',
              'Run Monte Carlo simulation for schedule and cost risks using @Risk or Crystal Ball',
              'Establish risk reserve budget = sum of EMV for all high risks × 1.2 contingency factor',
              'Document confidence intervals for schedule and cost estimates including risk exposure',
            ],
          },
          {
            step: 4,
            title: 'Risk Response Planning',
            description: 'Define specific mitigation, transfer, avoidance, or acceptance strategies per risk.',
            actions: [
              'For each High/Medium risk, choose response strategy: Avoid, Transfer, Mitigate, Accept',
              'Avoid: restructure project plan to eliminate the risk condition (e.g., drop risky scope)',
              'Transfer: shift financial impact via insurance, contracts, or SLAs with vendors',
              'Mitigate: define specific actions to reduce probability or impact with target score',
              'Accept (active): define contingency plan triggered if risk materializes; assign contingency owner',
            ],
          },
          {
            step: 5,
            title: 'Risk Monitoring & Control',
            description: 'Establish ongoing risk tracking, reporting, and escalation processes.',
            actions: [
              'Assign a risk owner for each item in the risk register; owners review their risks weekly',
              'Integrate risk review into sprint retrospective and monthly project status meetings',
              'Define risk trigger metrics and thresholds that prompt automatic escalation',
              'Update risk register after each significant project event (release, team change, external news)',
              'Conduct formal risk audit at each project phase gate before proceeding to next phase',
            ],
          },
        ],
        summary: `Risk assessment for "${data.projectName}" across ${domains.length} domains with ${riskTolerance} tolerance threshold, covering identification, qualitative/quantitative analysis, response planning, and monitoring cadence.`,
      },
      duration: Date.now() - start,
    };
  },
};
