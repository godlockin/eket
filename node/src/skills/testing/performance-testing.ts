import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PerformanceTestingInput {
  targetService: string;
  testType?: 'load' | 'stress' | 'spike' | 'soak' | 'volume';
  targetRps?: number;
  durationSeconds?: number;
}

export interface PerformanceTestingOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const performanceTestingSkill: Skill<PerformanceTestingInput, PerformanceTestingOutput> = {
  name: 'performance-testing',
  category: SkillCategory.TESTING,
  description: 'Load and stress testing methodology using k6 — from baseline to breaking point',
  version: '1.0.0',
  async execute(input: SkillInput<PerformanceTestingInput>): Promise<SkillOutput<PerformanceTestingOutput>> {
    const data = input as unknown as PerformanceTestingInput;
    const start = Date.now();
    const service = data.targetService || 'API service';
    const testType = data.testType || 'load';
    const targetRps = data.targetRps || 100;
    const duration = data.durationSeconds || 300;

    const testTypeDescriptions: Record<string, string> = {
      load: 'Verify system handles expected traffic at normal and peak load',
      stress: 'Find breaking point — gradually increase load until system fails',
      spike: 'Test sudden traffic burst recovery — 10x normal load for 60s',
      soak: 'Detect memory leaks and degradation over extended time (hours)',
      volume: 'Test with large data volumes — millions of records in DB',
    };

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Define Performance Requirements',
            description: 'Without clear requirements, "performance test" is meaningless.',
            actions: [
              `Test type: ${testType} — ${testTypeDescriptions[testType]}`,
              `Target: ${targetRps} RPS sustained for ${duration}s`,
              'Define SLOs: p95 < 200ms, p99 < 500ms, error rate < 0.1%, availability > 99.9%',
              'Identify test scenarios by traffic share: 60% GET /api/items, 20% POST /api/orders, etc.',
              'Set environment: use production-equivalent infrastructure — avoid testing on underspec\'d servers',
              'Define success/failure criteria before running tests — not after seeing results',
            ],
          },
          {
            step: 2,
            title: 'Set Up k6 Test Environment',
            description: 'Configure k6 for realistic load generation from correct network location.',
            actions: [
              'Install k6: `brew install k6` (local) or use k6 Cloud for distributed load generation',
              'Run load generator from same region as target service — not from laptop',
              'Configure test data: pre-generate auth tokens, test users, product IDs (not dynamic per request)',
              'Set up k6 output: `--out influxdb` or `--out cloud` for real-time metrics visualization',
              'Connect k6 dashboard to Grafana for live monitoring during tests',
              'Warm up environment: run 10% load for 2 minutes before ramping to target',
            ],
          },
          {
            step: 3,
            title: 'Write k6 Test Scripts',
            description: 'Write realistic test scenarios that mirror actual user behavior.',
            actions: [
              'Structure script: options (stages/targets) → setup() → default function → teardown()',
              `Define load stages for ${testType}: ${testType === 'load' ? 'ramp-up 5min → sustain target for ' + duration + 's → ramp-down 5min' : testType === 'stress' ? 'ramp 10% increments every 2min until failure, then ramp-down' : testType === 'spike' ? '10% base → instant spike to 1000% for 60s → return to base' : 'steady low load for 4+ hours'}`,
              'Add realistic think time: `sleep(Math.random() * 2 + 1)` between requests',
              'Use parameterized test data from CSV/JSON files — avoid hot-spotting single resource',
              'Implement authentication in setup() — reuse tokens, don\'t re-authenticate per iteration',
              'Add custom metrics: `new Rate("checkout_success_rate")` for business-level tracking',
            ],
          },
          {
            step: 4,
            title: 'Execute & Monitor',
            description: 'Run test while monitoring system internals — load test is also observability test.',
            actions: [
              'Start test: `k6 run --vus 50 --duration 5m script.js`',
              'Monitor in parallel: CPU/memory/disk on application servers, DB connection pool',
              'Watch for: response time increasing over time (memory leak), error rate spike, connection timeouts',
              'Check DB: slow query log during test, connection pool exhaustion, deadlocks',
              'Monitor infrastructure: autoscaling triggered? Load balancer health? DNS resolution time?',
              'Capture full k6 summary JSON: `k6 run --summary-export=results.json script.js`',
            ],
          },
          {
            step: 5,
            title: 'Analyze Results',
            description: 'Extract actionable insights from raw metrics.',
            actions: [
              'Check k6 summary: http_req_duration p95/p99, http_req_failed rate, vus_max reached',
              'Plot latency distribution — bimodal distribution indicates two different code paths',
              'Correlate latency spikes with resource metrics: CPU spike at 80% → compute bound',
              'Identify breaking point: at what RPS did error rate exceed 1%? What was p99 then?',
              'Root cause analysis: is bottleneck CPU, memory, DB, network, or application logic?',
              'Document findings: "Service handles 150 RPS with p99=180ms; degrades at 200 RPS (connection pool exhaustion)"',
            ],
          },
          {
            step: 6,
            title: 'Report & Integrate into CI',
            description: 'Make performance testing continuous — not just a one-time activity.',
            actions: [
              'Generate HTML report: `k6 run --out json=results.json && k6 results summary`',
              'Add performance test to CI pipeline on nightly schedule (not every PR — too slow)',
              'Set CI thresholds: `thresholds: { http_req_duration: ["p95<200"] }` — fail if exceeded',
              'Store results in time-series DB (InfluxDB) to track performance over releases',
              'Alert on regression: if p95 increases >20% vs last passing run, page on-call',
              'Archive test scripts in repo: `tests/performance/` — version controlled alongside code',
            ],
          },
        ],
        summary: `Performance testing guide for ${service} — ${testType} test targeting ${targetRps} RPS over ${duration}s. 6-phase: requirements → k6 setup → script writing → execution & monitoring → analysis → CI integration.`,
      },
      duration: Date.now() - start,
    };
  },
};
