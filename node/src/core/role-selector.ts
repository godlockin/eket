/**
 * EKET Framework - Slaver Role Selector (TASK-045)
 */

export type SlaverRole = 'code' | 'test' | 'review' | 'infra';

const ROLE_MAP: Record<string, SlaverRole> = {
  feature: 'code',
  bug: 'code',
  refactor: 'code',
  test: 'test',
  quality: 'test',
  review: 'review',
  infra: 'infra',
  ci: 'infra',
  devops: 'infra',
} as const;

export function selectRole(ticketType: string): SlaverRole {
  return ROLE_MAP[ticketType.toLowerCase()] ?? 'code';
}

export function getRulesFileName(role: SlaverRole): string {
  return `SLAVER-RULES-${role.toUpperCase()}.md`;
}

export function getRulesPath(role: SlaverRole): string {
  return `template/docs/${getRulesFileName(role)}`;
}
