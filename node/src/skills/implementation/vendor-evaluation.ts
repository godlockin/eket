import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface VendorEvaluationInput {
  category: string;
  useCase?: string;
  budget?: string;
}

export interface VendorEvaluationOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const vendorEvaluationSkill: Skill<VendorEvaluationInput, VendorEvaluationOutput> = {
  name: 'vendor-evaluation',
  category: SkillCategory.ANALYSIS,
  description: 'Structured vendor evaluation process: requirements definition, shortlisting, POC, scoring matrix, and final decision.',
  version: '1.0.0',
  async execute(input: SkillInput<VendorEvaluationInput>): Promise<SkillOutput<VendorEvaluationOutput>> {
    const data = input as unknown as VendorEvaluationInput;
    const start = Date.now();
    const category = data.category || 'vendor';
    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Requirements',
            description: 'Elicit and document functional, non-functional, and compliance requirements before looking at any vendors.',
            actions: [
              'Interview stakeholders to capture must-have vs nice-to-have features',
              'Define non-functional requirements: performance, availability, scalability',
              'Document compliance and data residency constraints',
              'Establish budget envelope and TCO target',
              'Agree on evaluation timeline and decision-making authority',
            ],
          },
          {
            step: 2,
            title: 'Shortlist Vendors',
            description: 'Apply initial screening to narrow from the market to 3-5 viable candidates.',
            actions: [
              'Research market landscape via Gartner, G2, analyst reports',
              'Apply hard filters: compliance certs, region availability, pricing model',
              'Request RFI from shortlisted vendors',
              'Review customer references and case studies in similar industries',
              'Produce shortlist document with rationale for inclusions/exclusions',
            ],
          },
          {
            step: 3,
            title: 'Run Proof of Concept',
            description: 'Execute time-boxed technical POC (2-4 weeks) against a representative workload for each finalist.',
            actions: [
              'Define POC success criteria and test scenarios upfront',
              'Provision sandbox environments with production-like data volumes',
              'Measure integration effort, API quality, and developer experience',
              'Test edge cases: failover, rate limits, error handling',
              'Document POC findings in a structured evaluation report',
            ],
          },
          {
            step: 4,
            title: 'Build Scoring Matrix',
            description: 'Quantify evaluation results using a weighted scoring model to enable objective comparison.',
            actions: [
              'Define evaluation dimensions: technical fit, support, pricing, roadmap, risk',
              'Assign weights reflecting business priorities (must-haves carry higher weight)',
              'Score each vendor 1-5 per dimension based on POC and RFI data',
              'Calculate weighted total scores and sensitivity analysis',
              'Share draft matrix with stakeholders for calibration before finalizing',
            ],
          },
          {
            step: 5,
            title: 'Make and Document Decision',
            description: 'Formalize the vendor selection with a decision record that captures rationale and negotiation outcomes.',
            actions: [
              'Present scoring matrix to decision committee',
              'Negotiate contract terms: SLA penalties, data portability, exit clauses',
              'Document Architecture Decision Record (ADR) with alternatives considered',
              'Define onboarding milestones and success metrics for first 90 days',
              'Communicate decision to stakeholders and archive evaluation artifacts',
            ],
          },
        ],
        summary: `Vendor evaluation process for ${category} completed: 5-step framework from requirements through decision, ensuring objective and auditable selection.`,
      },
      duration: Date.now() - start,
    };
  },
};
