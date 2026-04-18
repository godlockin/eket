#!/usr/bin/env node
/**
 * benchmarks/check-regression.mjs
 *
 * Runs after simple-benchmark.js. Computes the median p95 of the last N runs
 * (N = EKET_BENCH_SAMPLES, default 3) in benchmarks/results/, compares against
 * benchmarks/baseline.json, and exits non-zero if median p95 exceeds
 * baseline * (1 + threshold_pct/100).
 *
 * Invoked from CI; safe to run locally for pre-commit sanity.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, 'results');
const baselinePath = resolve(here, 'baseline.json');

const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
const threshold = 1 + Number(baseline._threshold_pct ?? 20) / 100;
// Use median of the last N runs to damp GC / CI scheduler jitter.
const SAMPLE_SIZE = Number(process.env.EKET_BENCH_SAMPLES ?? 3);

// Sort by mtime so historical files (e.g. `round4-*.json`) don't shadow new runs
// just because 'r' > digits in ASCII.
const files = readdirSync(resultsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: f, mtime: statSync(join(resultsDir, f)).mtimeMs }))
  .sort((a, b) => a.mtime - b.mtime);

if (files.length === 0) {
  console.error('no benchmark results found in benchmarks/results/');
  process.exit(2);
}

// Pull the last N samples; if fewer exist, fall back to what we have.
const sampleFiles = files.slice(-SAMPLE_SIZE);
const samples = sampleFiles.map((f) => JSON.parse(readFileSync(join(resultsDir, f.name), 'utf-8')));

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const enqueueP95Median = median(
  samples.map((s) => s.enqueue?.p95).filter((v) => typeof v === 'number')
);
const dequeueP95Median = median(
  samples.map((s) => s.dequeue?.p95).filter((v) => typeof v === 'number')
);

const checks = [
  { metric: 'enqueue.p95', actual: enqueueP95Median, baseline: baseline.enqueue_p95_ms },
  { metric: 'dequeue.p95', actual: dequeueP95Median, baseline: baseline.dequeue_p95_ms },
];

let fail = false;
console.log(
  `Comparing median of last ${samples.length} run(s) against baseline.json (threshold: +${baseline._threshold_pct}%)`
);
console.log(`Samples: ${sampleFiles.map((f) => f.name).join(', ')}`);
console.log('');

for (const { metric, actual, baseline: base } of checks) {
  const limit = base * threshold;
  const ok = actual <= limit;
  const marker = ok ? '✓' : '✗';
  const pct = ((actual / base - 1) * 100).toFixed(1);
  console.log(
    `  ${marker} ${metric}: ${actual.toFixed(3)}ms (baseline ${base}ms, limit ${limit.toFixed(3)}ms, delta ${pct}%)`
  );
  if (!ok) fail = true;
}

if (fail) {
  console.error('\nperf regression: one or more p95 metrics exceed baseline threshold.');
  console.error('Fix the regression, or deliberately bump baseline.json (reviewer approval required).');
  process.exit(1);
}

console.log('\nperf within baseline threshold.');
