export type ModelTier = 'haiku' | 'sonnet' | 'opus';

const DEFAULT_RULES: { tags: string[]; model: ModelTier }[] = [
  { tags: ['classify', 'route', 'triage', 'lint', 'check'], model: 'haiku' },
  { tags: ['implement', 'code', 'feature', 'refactor', 'build'], model: 'opus' },
];

export function resolveModel(ticket: { tags?: string[]; model?: string }): ModelTier {
  if (ticket.model && ['haiku', 'sonnet', 'opus'].includes(ticket.model)) {
    return ticket.model as ModelTier;
  }
  const tags = ticket.tags ?? [];
  for (const rule of DEFAULT_RULES) {
    if (tags.some((tag) => rule.tags.includes(tag.toLowerCase()))) {
      return rule.model;
    }
  }
  return 'sonnet';
}

export function getModelDisplayName(tier: ModelTier): string {
  const map: Record<ModelTier, string> = {
    haiku: 'claude-haiku-4-5',
    sonnet: 'claude-sonnet-4-5',
    opus: 'claude-opus-4-5',
  };
  return map[tier];
}
