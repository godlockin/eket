/**
 * Ultrareview Command
 *
 * 并行启动 3 个独立 reviewer（security / performance / architecture）
 * 分析 PR diff，合并结果，生成 UltrareviewReport。
 *
 * Usage:
 *   node dist/index.js task:ultrareview <PR_NUMBER>
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { WorktreeManager } from '../core/worktree-manager.js';
import type { ReviewerResult, UltrareviewReport } from '../types/index.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

// ============================================================================
// Reviewer definitions
// ============================================================================

const REVIEWERS = [
  { id: 'security-reviewer', focus: '安全漏洞、权限检查、SQL注入、XSS' },
  { id: 'performance-reviewer', focus: 'N+1查询、内存泄漏、O(n²)复杂度、缓存缺失' },
  { id: 'architecture-reviewer', focus: 'SRP违反、循环依赖、过度设计、接口稳定性' },
] as const;

// ============================================================================
// Heuristic analyzers per reviewer
// ============================================================================

function analyzeSecurityIssues(
  diff: string,
  _files: string[],
): ReviewerResult['issues'] {
  const issues: ReviewerResult['issues'] = [];

  const dangerousPatterns: Array<{ pattern: RegExp; message: string; severity: 'critical' | 'warning' | 'info' }> = [
    { pattern: /eval\s*\(/, message: 'Dangerous eval() usage detected', severity: 'critical' },
    { pattern: /child_process\.exec\b/, message: 'Shell injection risk via child_process.exec — use execFile', severity: 'critical' },
    { pattern: /password\s*=\s*['"][^'"]{4,}['"]/, message: 'Possible hardcoded password', severity: 'critical' },
    { pattern: /api[_-]?key\s*=\s*['"][^'"]{8,}['"]/i, message: 'Possible hardcoded API key', severity: 'critical' },
    { pattern: /secret\s*=\s*['"][^'"]{8,}['"]/i, message: 'Possible hardcoded secret', severity: 'warning' },
    { pattern: /innerHTML\s*=/, message: 'XSS risk via innerHTML assignment', severity: 'warning' },
    { pattern: /document\.write\s*\(/, message: 'XSS risk via document.write', severity: 'warning' },
    { pattern: /dangerouslySetInnerHTML/, message: 'React XSS risk via dangerouslySetInnerHTML', severity: 'warning' },
    { pattern: /console\.(log|warn|error).*?(token|password|secret|key)/i, message: 'Sensitive data logged to console', severity: 'warning' },
    { pattern: /\bhttp:\/\/(?!localhost|127\.0\.0\.1)/, message: 'Insecure HTTP (non-localhost) connection', severity: 'info' },
  ];

  for (const { pattern, message, severity } of dangerousPatterns) {
    if (pattern.test(diff)) {
      issues.push({ severity, message });
    }
  }

  // Missing input validation
  const hasInputHandling = /req\.body|req\.params|req\.query|formData|userInput/i.test(diff);
  const hasValidation = /validate|sanitize|zod|joi|yup|schema\.parse/i.test(diff);
  if (hasInputHandling && !hasValidation) {
    issues.push({ severity: 'warning', message: 'Input handling detected without apparent validation' });
  }

  return issues;
}

function analyzePerformanceIssues(
  diff: string,
  _files: string[],
): ReviewerResult['issues'] {
  const issues: ReviewerResult['issues'] = [];

  const patterns: Array<{ pattern: RegExp; message: string; severity: 'critical' | 'warning' | 'info' }> = [
    { pattern: /SELECT\s+\*/i, message: 'SELECT * query — fetch only needed columns', severity: 'warning' },
    { pattern: /for\s*\([^)]+\)\s*\{[^}]*\.find\s*\(/s, message: 'Possible N+1: .find() inside loop', severity: 'critical' },
    { pattern: /for\s*\([^)]+\)\s*\{[^}]*await\s+/s, message: 'Sequential awaits in loop — use Promise.all', severity: 'warning' },
    { pattern: /\.forEach\s*\(\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[^}]*await\s+/s, message: 'await inside forEach — use for...of or Promise.all', severity: 'warning' },
    { pattern: /for\s*\([^{]+\)\s*\{[^{}]*for\s*\(/, message: 'Nested loops — verify O(n²) complexity', severity: 'warning' },
    { pattern: /JSON\.parse\s*\(\s*JSON\.stringify/, message: 'Deep clone via JSON — use structuredClone', severity: 'info' },
    { pattern: /setInterval\s*\(\s*[^,]+,\s*0\s*\)/, message: 'setInterval with 0ms — potential busy-wait', severity: 'info' },
  ];

  for (const { pattern, message, severity } of patterns) {
    if (pattern.test(diff)) {
      issues.push({ severity, message });
    }
  }

  if (/WHERE\s+\w+\s*=/i.test(diff) && !/CREATE\s+INDEX/i.test(diff)) {
    issues.push({ severity: 'info', message: 'DB WHERE clause — verify index exists' });
  }

  return issues;
}

function analyzeArchitectureIssues(
  diff: string,
  files: string[],
): ReviewerResult['issues'] {
  const issues: ReviewerResult['issues'] = [];

  const patterns: Array<{ pattern: RegExp; message: string; severity: 'critical' | 'warning' | 'info' }> = [
    { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, message: 'Empty catch block — error swallowed', severity: 'critical' },
    { pattern: /:\s*any\b/, message: 'TypeScript any type — reduces type safety', severity: 'warning' },
    { pattern: /@ts-ignore/, message: '@ts-ignore — fix type error instead', severity: 'warning' },
    { pattern: /TODO|FIXME|HACK|XXX/, message: 'Technical debt marker in changed code', severity: 'info' },
    { pattern: /require\s*\(\s*['"`]\.\.\/\.\.\/\.\.\//, message: 'Deep relative import (3+ levels) — use path alias', severity: 'info' },
    { pattern: /\bconsole\.(log|warn|error)\s*\(/, message: 'console.log in code — use structured logger', severity: 'info' },
  ];

  for (const { pattern, message, severity } of patterns) {
    if (pattern.test(diff)) {
      issues.push({ severity, message });
    }
  }

  // Check for large files in changed set
  for (const file of files) {
    const absPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(absPath)) {continue;}
    try {
      const lines = fs.readFileSync(absPath, 'utf-8').split('\n').length;
      if (lines > 400) {
        issues.push({
          severity: 'warning',
          message: `File ${file} has ${lines} lines (>400) — consider splitting`,
          file,
        });
      }
    } catch {
      // skip unreadable
    }
  }

  return issues;
}

// ============================================================================
// Per-reviewer runner (uses WorktreeManager for isolation)
// ============================================================================

async function runReviewerInWorktree(
  prNumber: number,
  reviewer: typeof REVIEWERS[number],
  diff: string,
  files: string[],
): Promise<ReviewerResult> {
  const projectRoot = process.cwd();
  const wm = new WorktreeManager({ projectRoot });

  let issues: ReviewerResult['issues'] = [];
  const ticketId = `ultrareview-${reviewer.id}-${prNumber}-${Date.now()}`;
  const slaverId = reviewer.id;
  let worktreePath: string | undefined;

  try {
    worktreePath = await wm.createWorktree(ticketId, slaverId);

    switch (reviewer.id) {
      case 'security-reviewer':
        issues = analyzeSecurityIssues(diff, files);
        break;
      case 'performance-reviewer':
        issues = analyzePerformanceIssues(diff, files);
        break;
      case 'architecture-reviewer':
        issues = analyzeArchitectureIssues(diff, files);
        break;
    }
  } finally {
    if (worktreePath) {
      await wm.removeWorktree(ticketId, true).catch(() => {/* best effort */});
    }
  }

  const score = Math.max(
    0,
    100 -
      issues.filter((issue) => issue.severity === 'critical').length * 20 -
      issues.filter((issue) => issue.severity === 'warning').length * 10 -
      issues.filter((issue) => issue.severity === 'info').length * 3,
  );

  return { reviewerId: reviewer.id, focus: reviewer.focus, issues, score };
}

// ============================================================================
// Main ultrareview function
// ============================================================================

export async function runUltrareview(prNumber: number): Promise<UltrareviewReport> {
  // Fetch PR diff
  const diffResult = await execFileNoThrow('gh', ['pr', 'diff', String(prNumber)]);
  if (diffResult.status !== 0) {
    throw new Error(`Failed to fetch PR diff: ${diffResult.stderr}`);
  }
  const diff = diffResult.stdout;

  // Fetch changed files
  const filesResult = await execFileNoThrow('gh', [
    'pr', 'view', String(prNumber),
    '--json', 'files',
    '--jq', '.files[].path',
  ]);
  const files = filesResult.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  // Run 3 reviewers in parallel
  const reviewers = await Promise.all(
    REVIEWERS.map((r) => runReviewerInWorktree(prNumber, r, diff, files)),
  );

  // Weighted overall score: security 40%, performance 30%, architecture 30%
  const weights: number[] = [0.4, 0.3, 0.3];
  const overallScore = Math.round(
    reviewers.reduce((sum: number, r: ReviewerResult, idx: number) => sum + r.score * (weights[idx] ?? 0), 0),
  );

  // Merge issues, dedup by message
  const issueMap = new Map<string, { severity: string; message: string; reviewers: string[] }>();
  for (const reviewer of reviewers) {
    for (const issue of reviewer.issues) {
      const key = issue.message;
      if (issueMap.has(key)) {
        issueMap.get(key)!.reviewers.push(reviewer.reviewerId);
      } else {
        issueMap.set(key, { severity: issue.severity, message: issue.message, reviewers: [reviewer.reviewerId] });
      }
    }
  }

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const topIssues = Array.from(issueMap.values()).sort((a, b) => {
    const sa = severityOrder[a.severity] ?? 3;
    const sb = severityOrder[b.severity] ?? 3;
    if (sa !== sb) {return sa - sb;}
    return b.reviewers.length - a.reviewers.length;
  });

  const hasCritical = topIssues.some((i) => i.severity === 'critical');
  const hasWarning = topIssues.some((i) => i.severity === 'warning');
  const recommendation: UltrareviewReport['recommendation'] =
    hasCritical ? 'request-changes' : hasWarning ? 'comment' : 'approve';

  const report: UltrareviewReport = {
    prNumber,
    overallScore,
    reviewers,
    topIssues,
    recommendation,
    generatedAt: Date.now(),
  };

  // Write report
  const reviewsDir = path.join(process.cwd(), '.eket', 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });
  const reportPath = path.join(reviewsDir, `${prNumber}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // Console summary
  console.log(`\n🔍 Ultrareview Report — PR #${prNumber}`);
  console.log(`   Overall Score: ${overallScore}/100`);
  console.log(`   Recommendation: ${recommendation.toUpperCase()}`);
  console.log('   Top Issues:');
  topIssues.slice(0, 5).forEach((issue) => {
    const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
    console.log(`     ${icon} [${issue.severity}] ${issue.message}`);
  });
  console.log(`   Report saved to: ${reportPath}\n`);

  // Post PR comment (best-effort)
  const commentBody =
    `## 🔍 Ultrareview Report\n\n` +
    `**Overall Score**: ${overallScore}/100 | **Recommendation**: \`${recommendation}\`\n\n` +
    `### Top Issues\n` +
    topIssues
      .slice(0, 10)
      .map((topIssue) => {
        const icon = topIssue.severity === 'critical' ? '🔴' : topIssue.severity === 'warning' ? '🟡' : '🔵';
        return `- ${icon} **[${topIssue.severity}]** ${topIssue.message} _(${topIssue.reviewers.join(', ')})_`;
      })
      .join('\n') +
    `\n\n<details><summary>Reviewer Breakdown</summary>\n\n` +
    reviewers
      .map(
        (rev: ReviewerResult) =>
          `**${rev.reviewerId}** (Score: ${rev.score}/100, Focus: ${rev.focus})\n` +
          (rev.issues.length === 0
            ? '  ✅ No issues found\n'
            : rev.issues.map((iss) => `  - [${iss.severity}] ${iss.message}`).join('\n') + '\n'),
      )
      .join('\n') +
    `</details>\n\n_Generated by EKET Ultrareview_`;

  const commentResult = await execFileNoThrow('gh', [
    'pr', 'comment', String(prNumber), '--body', commentBody,
  ]);
  if (commentResult.status === 0) {
    console.log('✅ PR comment posted successfully');
  } else {
    console.log('ℹ️  Could not post PR comment (gh not configured or no permission)');
  }

  return report;
}

// ============================================================================
// Command registration
// ============================================================================

export function registerUltrareview(program: Command): void {
  program
    .command('task:ultrareview <prNumber>')
    .description('Run multi-reviewer parallel code review on a PR (security/performance/architecture)')
    .action(async (prNumberStr: string) => {
      const prNumber = parseInt(prNumberStr, 10);
      if (isNaN(prNumber) || prNumber <= 0) {
        console.error('❌ Invalid PR number');
        process.exit(1);
      }
      try {
        await runUltrareview(prNumber);
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.error('❌ Ultrareview failed:', err.message ?? String(e));
        process.exit(1);
      }
    });
}
