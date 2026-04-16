import { describe, it, expect } from '@jest/globals';
import { selectRole, getRulesPath, getRulesFileName, ALL_ROLES } from '../../src/core/role-selector.js';

describe('selectRole — all 12 roles', () => {
  it('analysis: maps analysis/research/spike', () => {
    expect(selectRole('analysis')).toBe('analysis');
    expect(selectRole('research')).toBe('analysis');
    expect(selectRole('spike')).toBe('analysis');
  });

  it('design: maps design/architecture/schema', () => {
    expect(selectRole('design')).toBe('design');
    expect(selectRole('architecture')).toBe('design');
    expect(selectRole('schema')).toBe('design');
  });

  it('planning: maps planning/epic/breakdown', () => {
    expect(selectRole('planning')).toBe('planning');
    expect(selectRole('epic')).toBe('planning');
    expect(selectRole('breakdown')).toBe('planning');
  });

  it('code: maps feature/bug/refactor', () => {
    expect(selectRole('feature')).toBe('code');
    expect(selectRole('bug')).toBe('code');
    expect(selectRole('refactor')).toBe('code');
  });

  it('test: maps test/qa/quality', () => {
    expect(selectRole('test')).toBe('test');
    expect(selectRole('qa')).toBe('test');
    expect(selectRole('quality')).toBe('test');
  });

  it('review: maps review/audit/pr', () => {
    expect(selectRole('review')).toBe('review');
    expect(selectRole('audit')).toBe('review');
    expect(selectRole('pr')).toBe('review');
  });

  it('docs: maps docs/documentation/readme/wiki', () => {
    expect(selectRole('docs')).toBe('docs');
    expect(selectRole('documentation')).toBe('docs');
    expect(selectRole('readme')).toBe('docs');
    expect(selectRole('wiki')).toBe('docs');
  });

  it('infra: maps infra/ci/devops/deploy', () => {
    expect(selectRole('infra')).toBe('infra');
    expect(selectRole('ci')).toBe('infra');
    expect(selectRole('devops')).toBe('infra');
    expect(selectRole('deploy')).toBe('infra');
  });

  it('security: maps security/vulnerability/pentest', () => {
    expect(selectRole('security')).toBe('security');
    expect(selectRole('vulnerability')).toBe('security');
    expect(selectRole('pentest')).toBe('security');
  });

  it('unknown type falls back to code', () => {
    expect(selectRole('unknown-xyz')).toBe('code');
    expect(selectRole('')).toBe('code');
  });

  it('ALL_ROLES contains all 12 roles', () => {
    expect(ALL_ROLES).toHaveLength(12);
  });

  it('data: maps data/analytics/etl/reporting', () => {
    expect(selectRole('data')).toBe('data');
    expect(selectRole('analytics')).toBe('data');
    expect(selectRole('etl')).toBe('data');
    expect(selectRole('reporting')).toBe('data');
  });

  it('ops: maps ops/monitoring/sre/alerting', () => {
    expect(selectRole('ops')).toBe('ops');
    expect(selectRole('monitoring')).toBe('ops');
    expect(selectRole('sre')).toBe('ops');
    expect(selectRole('alerting')).toBe('ops');
  });

  it('implementation: maps implementation/integration/migration', () => {
    expect(selectRole('implementation')).toBe('implementation');
    expect(selectRole('integration')).toBe('implementation');
    expect(selectRole('migration')).toBe('implementation');
    expect(selectRole('setup')).toBe('implementation');
  });
});

describe('getRulesPath / getRulesFileName', () => {
  it('returns correct path for each role', () => {
    expect(getRulesPath('code')).toBe('template/docs/SLAVER-RULES-CODE.md');
    expect(getRulesPath('docs')).toBe('template/docs/SLAVER-RULES-DOCS.md');
    expect(getRulesPath('security')).toBe('template/docs/SLAVER-RULES-SECURITY.md');
    expect(getRulesPath('analysis')).toBe('template/docs/SLAVER-RULES-ANALYSIS.md');
  });
});
