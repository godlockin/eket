/**
 * EKET Framework - Slaver Role Selector (TASK-050: extended to 16 roles)
 * 覆盖完整软件工程周期的 16 种专项角色。
 */

export type SlaverRole =
  | 'analysis'
  | 'design'
  | 'planning'
  | 'code'
  | 'test'
  | 'review'
  | 'docs'
  | 'infra'
  | 'security'
  | 'data'
  | 'ops'
  | 'implementation'
  | 'hr'
  | 'algorithm'
  | 'llm'
  | 'ux';

export const ALL_ROLES: SlaverRole[] = [
  'analysis', 'design', 'planning', 'code', 'test', 'review', 'docs', 'infra', 'security',
  'data', 'ops', 'implementation', 'hr', 'algorithm', 'llm', 'ux',
];

const ROLE_MAP: Record<string, SlaverRole> = {
  // Analysis
  analysis: 'analysis',
  research: 'analysis',
  spike: 'analysis',
  investigation: 'analysis',
  // Design
  design: 'design',
  architecture: 'design',
  schema: 'design',
  modeling: 'design',
  // Planning
  planning: 'planning',
  epic: 'planning',
  breakdown: 'planning',
  roadmap: 'planning',
  // Code
  feature: 'code',
  bug: 'code',
  refactor: 'code',
  implement: 'code',
  // Test
  test: 'test',
  qa: 'test',
  quality: 'test',
  coverage: 'test',
  // Review
  review: 'review',
  audit: 'review',
  pr: 'review',
  // Docs
  docs: 'docs',
  documentation: 'docs',
  readme: 'docs',
  wiki: 'docs',
  guide: 'docs',
  // Infra
  infra: 'infra',
  ci: 'infra',
  devops: 'infra',
  deploy: 'infra',
  pipeline: 'infra',
  // Security
  security: 'security',
  vulnerability: 'security',
  pentest: 'security',
  // Data
  data: 'data',
  analytics: 'data',
  etl: 'data',
  reporting: 'data',
  dashboard: 'data',
  metric: 'data',
  // Ops
  ops: 'ops',
  operations: 'ops',
  monitoring: 'ops',
  alerting: 'ops',
  sre: 'ops',
  oncall: 'ops',
  // Implementation
  implementation: 'implementation',
  integration: 'implementation',
  migration: 'implementation',
  onboarding: 'implementation',
  setup: 'implementation',
  // HR
  hr: 'hr',
  recruit: 'hr',
  hiring: 'hr',
  headhunt: 'hr',
  interview: 'hr',
  jd: 'hr',
  offer: 'hr',
  talent: 'hr',
  // Algorithm
  algorithm: 'algorithm',
  algo: 'algorithm',
  ml: 'algorithm',
  benchmark: 'algorithm',
  'feature-engineering': 'algorithm',
  paper: 'algorithm',
  labeling: 'algorithm',
  annotation: 'algorithm',
  training: 'algorithm',
  experiment: 'algorithm',
  automl: 'algorithm',
  drift: 'algorithm',
  // LLM
  llm: 'llm',
  prompt: 'llm',
  rag: 'llm',
  finetune: 'llm',
  inference: 'llm',
  embedding: 'llm',
  // UX
  ux: 'ux',
  ui: 'ux',
  'user-research': 'ux',
  persona: 'ux',
  wireframe: 'ux',
  prototype: 'ux',
  usability: 'ux',
  accessibility: 'ux',
  'design-system': 'ux',
  interaction: 'ux',
};

export function selectRole(ticketType: string): SlaverRole {
  return ROLE_MAP[ticketType.toLowerCase()] ?? 'code';
}

export function getRulesFileName(role: SlaverRole): string {
  return `SLAVER-RULES-${role.toUpperCase()}.md`;
}

export function getRulesPath(role: SlaverRole): string {
  return `template/docs/${getRulesFileName(role)}`;
}
