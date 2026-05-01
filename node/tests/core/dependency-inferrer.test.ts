import { DependencyInferrer } from '../../src/core/dependency-inferrer.js';

describe('DependencyInferrer', () => {
  let inferrer: DependencyInferrer;

  beforeEach(() => {
    inferrer = new DependencyInferrer();
  });

  describe('extractTechnicalTerms', () => {
    it('extracts CamelCase terms correctly', () => {
      const terms = inferrer.extractTechnicalTerms(
        'Use CompletionValidator and SkillIndex to loadSkillIndex()',
      );
      expect(terms).toContain('CompletionValidator');
      expect(terms).toContain('SkillIndex');
      expect(terms).toContain('loadSkillIndex');
    });

    it('extracts .ts file references', () => {
      const terms = inferrer.extractTechnicalTerms('See complete.ts and skillIndex.ts for details');
      expect(terms).toContain('complete.ts');
      expect(terms).toContain('skillIndex.ts');
    });
  });

  describe('inferDependencies', () => {
    it('finds matching dependency with high confidence', async () => {
      const existing = [
        {
          id: 'TASK-100',
          content: 'Use CompletionValidator to validate complete.ts and inferDependencies()',
        },
      ];
      const newContent = 'CompletionValidator complete.ts inferDependencies() DependencyInferrer';
      const results = await inferrer.inferDependencies(newContent, existing);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].ticketId).toBe('TASK-100');
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.6);
      expect(results[0].reason).toContain('CompletionValidator');
    });

    it('filters out low confidence candidates (< 0.6)', async () => {
      const existing = [
        {
          id: 'TASK-200',
          content: 'Something CompletionValidator here',
        },
      ];
      // newContent has 10 unique terms, existing matches only 1 → confidence ~0.1
      const newContent =
        'TermA TermB TermC TermD TermE TermF TermG TermH TermI CompletionValidator';
      const results = await inferrer.inferDependencies(newContent, existing);
      expect(results.length).toBe(0);
    });

    it('returns empty array for empty ticket list', async () => {
      const results = await inferrer.inferDependencies('CompletionValidator DependencyInferrer', []);
      expect(results).toEqual([]);
    });
  });
});
