/**
 * EKET Framework - Performance Review Skill
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PerformanceReviewInput {
  /** PR number */
  prNumber?: string;
  /** Changed file paths */
  changedFiles?: string[];
  /** Application layer: frontend, backend, database, all */
  layer?: string;
  /** Existing performance baseline (e.g., p99 latency in ms) */
  baseline?: Record<string, number>;
}

export interface PerformanceReviewOutput {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    actions: string[];
  }>;
  summary: string;
}

export const performanceReviewSkill: Skill<PerformanceReviewInput, PerformanceReviewOutput> = {
  name: 'performance-review',
  category: SkillCategory.REVIEW,
  description: 'Performance review in PRs: algorithmic complexity, N+1 queries, memory leaks, bundle size, caching.',
  version: '1.0.0',
  tags: ['review', 'performance', 'optimization', 'scalability'],

  async execute(input: SkillInput<PerformanceReviewInput>): Promise<SkillOutput<PerformanceReviewOutput>> {
    const data = input.data as unknown as PerformanceReviewInput;
    const start = Date.now();
    const context = data.prNumber ? `PR #${data.prNumber}` : 'code change';
    const layer = data.layer ?? 'full-stack';

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Analyze Algorithmic Complexity',
            description: 'Identify O(N²) or worse algorithms in hot paths and suggest optimal alternatives.',
            actions: [
              'Scan loops: flag nested loops over collections without early exit (potential O(N²))',
              'Check sort/filter chains: confirm O(N log N) or better, avoid repeated full-array scans',
              'Review recursive functions: confirm memoization or tail-call for deep recursion',
              'Identify unbounded collection growth (append-only arrays in loops)',
              'Document current Big-O and expected Big-O after optimization',
            ],
          },
          {
            step: 2,
            title: 'Detect N+1 Query Problems',
            description: 'Catch database or API call patterns that multiply linearly with result set size.',
            actions: [
              'Trace all data-fetching loops: flag any DB/API call inside a forEach/map/for loop',
              'Suggest batch queries (SQL IN clause, DataLoader, batch API endpoints)',
              'Review ORM usage: confirm eager loading of associations where needed',
              'Estimate query count: current vs. after batching (e.g., 100 queries → 1 query)',
              'Add query logging in dev mode to confirm actual query counts',
            ],
          },
          {
            step: 3,
            title: 'Check Memory Allocation & Leak Risks',
            description: 'Identify excessive allocations, retained closures, and missing cleanup.',
            actions: [
              'Flag large object creation inside hot loops (consider object pool or reuse)',
              'Review event listener registration: confirm removeEventListener/cleanup in destructors',
              'Check for closures capturing large arrays/objects unnecessarily',
              'Verify async operations have proper cancellation (AbortController, clearTimeout)',
              'Recommend heap profiling if change touches long-running process code',
            ],
          },
          {
            step: 4,
            title: 'Review Caching Strategy',
            description: 'Ensure expensive computations and remote calls are appropriately cached.',
            actions: [
              'Identify repeated calls with same arguments: suggest memoization (useMemo, lru-cache)',
              'Review cache invalidation logic: stale data risk vs. freshness requirement',
              'Check HTTP cache headers for API responses (Cache-Control, ETag, Last-Modified)',
              'Verify expensive DB queries use read-replica or query result caching',
              'Document cache TTL rationale for each new cache layer added',
            ],
          },
          {
            step: 5,
            title: 'Assess Bundle Size Impact (Frontend)',
            description: 'Ensure new dependencies or code paths do not bloat the client bundle.',
            actions: [
              `For ${layer} changes: run bundle analyzer (webpack-bundle-analyzer, vite-bundle-vis)`,
              'Check new npm packages for tree-shaking support (ESM exports)',
              'Flag any dynamic import() missing lazy loading for large libraries',
              'Compare bundle sizes: before vs. after this PR (flag > 5% increase)',
              'Suggest code splitting for new routes or heavy components',
            ],
          },
          {
            step: 6,
            title: 'Benchmark Critical Paths & Document Findings',
            description: 'Run targeted benchmarks on changed code and record results.',
            actions: [
              'Write micro-benchmark for any algorithm changed (using benchmark.js or vitest bench)',
              'Run load test on affected API endpoints (k6, autocannon) against baseline',
              'Compare p50/p95/p99 latencies: confirm no regression vs. baseline',
              'Attach benchmark results to PR as a comment table',
              'List all performance issues found with severity: Critical/High/Medium/Low',
            ],
          },
        ],
        summary: `Performance review of ${context} (${layer}): analyzed algorithmic complexity, N+1 query risks, memory allocation patterns, caching strategy, and bundle size impact. Benchmark comparison documented.`,
      },
      duration: Date.now() - start,
    };
  },
};
