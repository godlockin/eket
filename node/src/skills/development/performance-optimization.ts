import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PerformanceOptimizationInput {
  systemType: 'frontend' | 'backend' | 'database' | 'fullstack';
  symptoms?: string[];
  targetMetric?: string;
}

export interface PerformanceOptimizationOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const performanceOptimizationSkill: Skill<PerformanceOptimizationInput, PerformanceOptimizationOutput> = {
  name: 'performance-optimization',
  category: SkillCategory.DEVELOPMENT,
  description: 'Systematic performance profiling and optimization workflow — measure first, optimize second',
  version: '1.0.0',
  async execute(input: SkillInput<PerformanceOptimizationInput>): Promise<SkillOutput<PerformanceOptimizationOutput>> {
    const data = input.data as unknown as PerformanceOptimizationInput;
    const start = Date.now();
    const sysType = data.systemType || 'fullstack';
    const target = data.targetMetric || 'response time p99 < 200ms';
    const symptoms = data.symptoms || ['slow response', 'high CPU'];

    const profilingTools: Record<string, string[]> = {
      frontend: ['Chrome DevTools Performance tab', 'Lighthouse CI', 'React DevTools Profiler', 'WebPageTest'],
      backend: ['Node.js --prof + node-tick-processor', 'clinic.js (flame/doctor/bubbleprof)', 'pyspy (Python)', 'async_profiler (JVM)'],
      database: ['EXPLAIN ANALYZE (PostgreSQL)', 'EXPLAIN FORMAT=JSON (MySQL)', 'MongoDB explain()', 'slow query log analysis'],
      fullstack: ['Distributed tracing (OpenTelemetry)', 'APM (Datadog/New Relic)', 'Chrome DevTools + server profiler combined'],
    };

    const tools = profilingTools[sysType] || profilingTools.fullstack;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Establish Performance Baseline',
            description: 'You cannot optimize what you cannot measure. Set baselines before touching code.',
            actions: [
              `Define success metric: ${target}`,
              'Run benchmark in production-like environment (not localhost)',
              'Capture p50, p95, p99 latencies — not just averages (averages hide tail latency)',
              'Record CPU, memory, I/O utilization during load',
              'Commit baseline results to repo (docs/performance/baseline.json)',
              'Set up continuous performance tracking to detect regressions automatically',
            ],
          },
          {
            step: 2,
            title: 'Profile & Find Bottlenecks',
            description: `Use data to find the actual bottleneck — symptoms: ${symptoms.join(', ')}.`,
            actions: [
              `Run profiler: ${tools[0]}`,
              `Secondary profiler for cross-validation: ${tools[1] || tools[0]}`,
              'Generate flame graph — identify widest bars (most time spent)',
              'Look for: hot loops, blocking I/O, N+1 queries, large allocations, GC pressure',
              'Check network waterfall: serial requests that could be parallelized',
              'Document findings: "X% of time in Y function called Z times per request"',
            ],
          },
          {
            step: 3,
            title: 'Prioritize Optimizations (Pareto)',
            description: '80% of gains come from 20% of fixes. Focus on highest-impact items first.',
            actions: [
              'Rank bottlenecks by: (time saved × frequency) / implementation effort',
              'Quick wins first: missing cache headers, missing DB indexes, N+1 queries',
              'Categorize: algorithmic (O complexity), I/O (network/disk), rendering (frontend)',
              'Algorithmic improvements always beat micro-optimizations — fix O(N²) to O(N log N)',
              'Create optimization backlog with estimated impact for each item',
              'Avoid premature micro-optimization — profile proves need before implementing',
            ],
          },
          {
            step: 4,
            title: 'Implement Optimizations',
            description: 'Apply optimizations one at a time, verifying impact after each.',
            actions: [
              sysType === 'database' || sysType === 'fullstack'
                ? 'Add missing indexes: EXPLAIN ANALYZE before/after — verify index is used'
                : 'Memoize expensive computations: useMemo/useCallback (frontend), LRU cache (backend)',
              'Implement caching layer: Redis for hot data, HTTP cache headers for static assets',
              'Parallelize independent async operations: Promise.all instead of sequential awaits',
              'Implement pagination/cursor for large list endpoints — never return unbounded results',
              'Use connection pooling for DB and HTTP clients — avoid connection setup overhead',
              'Enable compression (gzip/brotli) for API responses > 1KB',
            ],
          },
          {
            step: 5,
            title: 'Validate Improvements',
            description: 'Confirm optimization achieves target without introducing regressions.',
            actions: [
              'Re-run identical benchmark as baseline — compare p50/p95/p99',
              'Verify correctness: optimized code must produce identical results',
              'Check for new issues: cache invalidation bugs, race conditions from parallelism',
              'Run load test to verify improvement holds under concurrent traffic',
              'Compare resource utilization: CPU/memory should decrease, not just latency',
              `Confirm target met: ${target}`,
            ],
          },
          {
            step: 6,
            title: 'Document & Prevent Regression',
            description: 'Lock in gains and prevent future performance regressions.',
            actions: [
              'Update docs/performance/ with new benchmark results and optimization summary',
              'Add performance assertions to CI: fail build if p99 exceeds threshold',
              'Write ADR documenting the optimization decision and rationale',
              'Add comments to non-obvious optimizations explaining why they exist',
              'Set up alerting: PagerDuty/Grafana alert if p99 exceeds baseline + 20%',
              'Schedule quarterly performance reviews to catch gradual degradation',
            ],
          },
        ],
        summary: `Performance optimization guide for ${sysType} system — target: ${target}. 6-phase: baseline → profile → prioritize → implement → validate → regression prevention. Reported symptoms: ${symptoms.join(', ')}.`,
      },
      duration: Date.now() - start,
    };
  },
};
