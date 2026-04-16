/**
 * EKET Framework - Slaver Role Selector (TASK-046 redesign)
 * 覆盖完整软件工程周期的 12 种专项角色。
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
  | 'implementation';

export const ALL_ROLES: SlaverRole[] = [
  'analysis', 'design', 'planning', 'code', 'test', 'review', 'docs', 'infra', 'security',
  'data', 'ops', 'implementation',
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
