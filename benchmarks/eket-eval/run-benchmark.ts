#!/usr/bin/env npx ts-node
/**
 * EKET Framework Self-Evaluation Benchmark
 *
 * Evaluates EKET across multiple dimensions:
 * 1. Test Suite Health - Jest test pass rate
 * 2. Code Quality - TypeScript strict compliance
 * 3. Ticket Resolution - Task completion metrics
 * 4. Documentation Coverage - Doc file analysis
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BenchmarkResult {
  dimension: string;
  score: number;
  maxScore: number;
  percentage: number;
  details: Record<string, unknown>;
}

interface BenchmarkReport {
  timestamp: string;
  framework: string;
  version: string;
  results: BenchmarkResult[];
  overallScore: number;
  grade: string;
}

const ROOT = path.resolve(__dirname, '../..');

function runCommand(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 300000 });
  } catch (e: unknown) {
    const error = e as { stdout?: string; stderr?: string };
    return error.stdout || error.stderr || '';
  }
}

function evaluateTestSuite(): BenchmarkResult {
  console.log('📊 Evaluating Test Suite...');

  // Run npm test and capture output
  let output = '';
  try {
    output = execFileSync('npm', ['test'], {
      cwd: path.join(ROOT, 'node'),
      encoding: 'utf-8',
      timeout: 300000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e: unknown) {
    const error = e as { stdout?: string; stderr?: string };
    output = (error.stdout || '') + (error.stderr || '');
  }

  const passMatch = output.match(/Tests:\s+(\d+)\s+passed/);
  const failMatch = output.match(/(\d+)\s+failed/);
  const totalMatch = output.match(/Tests:.*?(\d+)\s+total/);

  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;
  const total = totalMatch ? parseInt(totalMatch[1]) : passed + failed;

  const score = passed;
  const maxScore = total || 1;

  return {
    dimension: 'Test Suite Health',
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    details: { passed, failed, total }
  };
}

function evaluateCodeQuality(): BenchmarkResult {
  console.log('📊 Evaluating Code Quality...');

  // Count TypeScript 'any' usage using grep
  const grepOutput = runCommand('grep', ['-r', 'any', 'node/src', '--include=*.ts']);
  const anyUsage = grepOutput.split('\n').filter(line => line.trim()).length;

  // Count source files
  const findOutput = runCommand('find', ['node/src', '-name', '*.ts']);
  const totalFiles = findOutput.split('\n').filter(line => line.trim()).length || 1;

  // Score: fewer 'any' = better (target: 0)
  const maxScore = 100;
  const penalty = Math.min(anyUsage, 100);
  const score = maxScore - penalty;

  return {
    dimension: 'Code Quality (Type Safety)',
    score: Math.max(score, 0),
    maxScore,
    percentage: Math.max(score, 0),
    details: { anyUsage, totalFiles, avgAnyPerFile: (anyUsage / totalFiles).toFixed(2) }
  };
}

function evaluateTicketResolution(): BenchmarkResult {
  console.log('📊 Evaluating Ticket Resolution...');

  const ticketDir = path.join(ROOT, 'jira/tickets');

  let total = 0;
  let completed = 0;

  if (fs.existsSync(ticketDir)) {
    const files = fs.readdirSync(ticketDir).filter(f => f.startsWith('TASK-') && f.endsWith('.md'));
    total = files.length;

    for (const file of files) {
      const content = fs.readFileSync(path.join(ticketDir, file), 'utf-8');
      if (/status.*done|status.*completed/i.test(content)) {
        completed++;
      }
    }
  }

  const maxScore = total || 1;

  return {
    dimension: 'Ticket Resolution',
    score: completed,
    maxScore,
    percentage: Math.round((completed / maxScore) * 100),
    details: { completed, total, pending: total - completed }
  };
}

function evaluateDocumentation(): BenchmarkResult {
  console.log('📊 Evaluating Documentation...');

  const docOutput = runCommand('find', ['confluence', '-name', '*.md']);
  const docs = docOutput.split('\n').filter(line => line.trim()).length;

  // Target: at least 50 docs
  const target = 50;
  const score = Math.min(docs, target);

  return {
    dimension: 'Documentation Coverage',
    score,
    maxScore: target,
    percentage: Math.round((score / target) * 100),
    details: { confluenceDocs: docs }
  };
}

function evaluateCodeScale(): BenchmarkResult {
  console.log('📊 Evaluating Code Scale...');

  // Count lines using wc
  const srcFiles = runCommand('find', ['node/src', '-name', '*.ts']);
  const testFiles = runCommand('find', ['node/tests', '-name', '*.ts']);

  const srcFileList = srcFiles.split('\n').filter(f => f.trim());
  const testFileList = testFiles.split('\n').filter(f => f.trim());

  let srcLines = 0;
  let testLines = 0;

  for (const file of srcFileList) {
    try {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
      srcLines += content.split('\n').length;
    } catch {
      // ignore
    }
  }

  for (const file of testFileList) {
    try {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
      testLines += content.split('\n').length;
    } catch {
      // ignore
    }
  }

  // Test coverage ratio (target: 50%)
  const ratio = srcLines > 0 ? (testLines / srcLines) * 100 : 0;
  const score = Math.min(Math.round(ratio), 100);

  return {
    dimension: 'Test Coverage Ratio',
    score,
    maxScore: 100,
    percentage: score,
    details: { sourceLines: srcLines, testLines: testLines, ratio: ratio.toFixed(1) + '%' }
  };
}

function calculateGrade(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

async function main() {
  console.log('🚀 EKET Framework Benchmark v1.0');
  console.log('================================\n');

  const results: BenchmarkResult[] = [
    evaluateTestSuite(),
    evaluateCodeQuality(),
    evaluateTicketResolution(),
    evaluateDocumentation(),
    evaluateCodeScale(),
  ];

  // Calculate overall score (weighted average)
  const weights = [0.35, 0.20, 0.15, 0.15, 0.15];
  const overallScore = results.reduce((sum, r, i) => sum + r.percentage * weights[i], 0);

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    framework: 'EKET',
    version: '2.19.0-beta',
    results,
    overallScore: Math.round(overallScore),
    grade: calculateGrade(overallScore)
  };

  // Print results
  console.log('\n📋 BENCHMARK RESULTS');
  console.log('====================\n');

  for (const r of results) {
    const bar = '█'.repeat(Math.floor(r.percentage / 5)) + '░'.repeat(20 - Math.floor(r.percentage / 5));
    console.log(`${r.dimension}`);
    console.log(`  ${bar} ${r.percentage}% (${r.score}/${r.maxScore})`);
    console.log(`  Details: ${JSON.stringify(r.details)}\n`);
  }

  console.log('====================');
  console.log(`OVERALL SCORE: ${report.overallScore}% (Grade: ${report.grade})`);
  console.log('====================\n');

  // Save report
  const reportPath = path.join(__dirname, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportPath}`);

  return report;
}

main().catch(console.error);
