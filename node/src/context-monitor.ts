#!/usr/bin/env node
/**
 * Context monitoring CLI
 *
 * Usage:
 *   node dist/context-monitor.js --check
 *
 * Output:
 *   {"tokens": 85000, "method": "precise", "threshold": "warn"}
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import { ContextEstimator } from './core/context-estimator.js';

interface LogEntry {
  timestamp: number;
  tokens: number;
  method: 'rough' | 'precise';
  threshold: 'safe' | 'warn' | 'danger';
  duration?: number;
}

const THRESHOLDS = {
  WARN: 70000,  // 70% of ~100K context
  DANGER: 85000  // 85% of ~100K context
} as const;

function getThreshold(tokens: number): LogEntry['threshold'] {
  if (tokens >= THRESHOLDS.DANGER) {return 'danger';}
  if (tokens >= THRESHOLDS.WARN) {return 'warn';}
  return 'safe';
}

async function main() {
  const estimator = new ContextEstimator();
  const result = await estimator.estimate();

  const logEntry: LogEntry = {
    timestamp: Date.now(),
    tokens: result.tokens,
    method: result.method,
    threshold: getThreshold(result.tokens),
    duration: result.duration
  };

  // Write to logs/context-monitor.jsonl
  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const logFile = join(logsDir, 'context-monitor.jsonl');
  writeFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });

  // Output to stdout (parseable JSON)
  console.log(JSON.stringify({
    tokens: result.tokens,
    method: result.method,
    threshold: logEntry.threshold
  }));

  // Exit codes for scripting
  if (logEntry.threshold === 'danger') {
    process.exit(2);
  } else if (logEntry.threshold === 'warn') {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(JSON.stringify({
    error: err.message,
    stack: err.stack
  }));
  process.exit(3);
});
