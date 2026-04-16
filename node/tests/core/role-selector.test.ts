import { describe, it, expect } from '@jest/globals';
import { selectRole, getRulesPath, getRulesFileName } from '../../src/core/role-selector.js';

describe('selectRole', () => {
  it('maps feature → code', () => {
    expect(selectRole('feature')).toBe('code');
  });

  it('maps test → test', () => {
    expect(selectRole('test')).toBe('test');
  });

  it('maps review → review', () => {
    expect(selectRole('review')).toBe('review');
  });

  it('maps infra → infra', () => {
    expect(selectRole('infra')).toBe('infra');
  });

  it('falls back to code for unknown type', () => {
    expect(selectRole('unknown-type')).toBe('code');
  });
});

describe('getRulesFileName', () => {
  it('returns uppercase filename for code role', () => {
    expect(getRulesFileName('code')).toBe('SLAVER-RULES-CODE.md');
  });

  it('returns uppercase filename for test role', () => {
    expect(getRulesFileName('test')).toBe('SLAVER-RULES-TEST.md');
  });

  it('returns uppercase filename for infra role', () => {
    expect(getRulesFileName('infra')).toBe('SLAVER-RULES-INFRA.md');
  });
});

describe('getRulesPath', () => {
  it('returns correct path for code role', () => {
    expect(getRulesPath('code')).toBe('template/docs/SLAVER-RULES-CODE.md');
  });

  it('returns correct path for review role', () => {
    expect(getRulesPath('review')).toBe('template/docs/SLAVER-RULES-REVIEW.md');
  });
});
