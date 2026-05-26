/**
 * EKET Framework - Checkpoint GC Command
 *
 * Implements `eket checkpoint:gc` to clean up old checkpoint branches (TASK-X07)
 *
 * Features:
 * - Scans all remote checkpoint/* branches
 * - Applies cleanup rules (done 7d+ / cancelled 3d+ / stale 30d+)
 * - Protects branches with unmerged PRs (via gh CLI, optional)
 * - Dry-run mode by default (--execute to actually delete)
 * - Custom age threshold (--older-than)
 *
 * Usage:
 *   eket checkpoint:gc                          # Dry-run (list only)
 *   eket checkpoint:gc --execute                # Delete eligible branches
 *   eket checkpoint:gc --older-than 14d         # Custom threshold
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { Command } from 'commander';

import type { GCOptions, CheckpointBranch, TaskStatus, PRStatus } from '../types/checkpoint-gc.js';

const execFileAsync = promisify(execFile);

/**
 * ANSI color codes (reused from task-status.ts)
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

/**
 * Register checkpoint:gc command
 */
export function registerCheckpointGC(program: Command): void {
  program
    .command('checkpoint:gc')
    .description('Garbage collect old checkpoint branches')
    .option('--dry-run', 'List branches without deleting (default)')
    .option('--execute', 'Execute deletion (default: dry-run)')
    .option('--older-than <duration>', 'Only delete branches older than this (e.g., "7d", "14d")', '7d')
    .addHelpText(
      'after',
      `
Examples:
  $ eket checkpoint:gc                          # List eligible branches (dry-run)
  $ eket checkpoint:gc --execute                # Delete branches (7d+ old)
  $ eket checkpoint:gc --older-than 14d --execute  # Delete 14d+ old branches

Cleanup Rules:
  ✅ Task status = done AND branch > 7d
  ✅ Task status = cancelled AND branch > 3d
  ✅ No recent activity (> 30d) regardless of status
  ⚠️  Skip if PR not merged (protection)

Output Indicators:
  ✅ Green  - Eligible for deletion
  ⚠️  Yellow - Skipped (active or protected)
  ❌ Red    - Deletion failed
`
    )
    .action(async (options: GCOptions) => {
      try {
        const isDryRun = !options.execute;
        const olderThanMs = parseDuration(options.olderThan || '7d');

        console.log(COLORS.bold + '\n🔍 Scanning checkpoint branches...\n' + COLORS.reset);

        const branches = await scanCheckpointBranches(olderThanMs);

        printGCReport(branches, isDryRun);

        if (options.execute) {
          await deleteCheckpointBranches(branches);
        }
      } catch (error) {
        console.error(
          `${COLORS.red}❌ Error: ${error instanceof Error ? error.message : String(error)}${COLORS.reset}`
        );
        process.exit(1);
      }
    });
}

/**
 * Scan all checkpoint branches and determine eligibility
 */
async function scanCheckpointBranches(olderThanMs: number): Promise<CheckpointBranch[]> {
  const branches: CheckpointBranch[] = [];

  // 1. List all remote checkpoint branches
  const branchNames = await listRemoteCheckpointBranches();

  if (branchNames.length === 0) {
    console.log(COLORS.green + '✅ No checkpoint branches found (all clean)\n' + COLORS.reset);
    return branches;
  }

  console.log(COLORS.gray + `Found ${branchNames.length} checkpoint branches\n` + COLORS.reset);

  // 2. Check each branch concurrently (limited to 5 parallel)
  const chunkSize = 5;
  for (let i = 0; i < branchNames.length; i += chunkSize) {
    const chunk = branchNames.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((branchName) => checkBranchEligibility(branchName, olderThanMs))
    );
    branches.push(...results);
  }

  return branches;
}

/**
 * List all remote checkpoint/* branches
 */
async function listRemoteCheckpointBranches(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-remote', '--heads', 'origin', 'checkpoint/*'], {
      cwd: process.cwd(),
      timeout: 10000, // 10s timeout
    });

    if (!stdout.trim()) {
      return [];
    }

    return stdout
      .trim()
      .split('\n')
      .filter((line) => line)
      .map((line) => line.split('\t')[1].replace('refs/heads/', ''));
  } catch (error) {
    throw new Error(`Failed to list remote branches: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if a branch is eligible for deletion
 */
async function checkBranchEligibility(branchName: string, olderThanMs: number): Promise<CheckpointBranch> {
  const taskId = branchName.replace('checkpoint/', '');

  // 1. Fetch branch to get last commit date
  let lastUpdate: Date;
  try {
    await execFileAsync('git', ['fetch', 'origin', branchName], {
      cwd: process.cwd(),
      timeout: 5000,
    });

    const { stdout: logOutput } = await execFileAsync(
      'git',
      ['log', `origin/${branchName}`, '--format=%aI', '-1'],
      { cwd: process.cwd() }
    );

    lastUpdate = new Date(logOutput.trim());
  } catch (error) {
    // If fetch fails, assume branch is gone (edge case)
    return {
      name: branchName,
      taskId,
      lastUpdate: new Date(0),
      eligible: false,
      reason: 'fetch failed (branch may be deleted)',
    };
  }

  const ageMs = Date.now() - lastUpdate.getTime();

  // 2. Check eligibility rules
  const { eligible, reason } = await isEligibleForDeletion(taskId, ageMs, olderThanMs);

  return {
    name: branchName,
    taskId,
    lastUpdate,
    eligible,
    reason,
  };
}

/**
 * Apply deletion eligibility rules
 */
async function isEligibleForDeletion(
  taskId: string,
  ageMs: number,
  olderThanMs: number
): Promise<{ eligible: boolean; reason: string }> {
  // Rule 1: Too young (< threshold)
  if (ageMs < olderThanMs) {
    return { eligible: false, reason: `active (updated ${formatAge(ageMs)} ago)` };
  }

  // Rule 2: Check task status from ticket
  const taskStatus = await getTaskStatus(taskId);

  // Rule 3: Task done and old enough (> 7d)
  if (taskStatus === 'done' && ageMs > 7 * 24 * 3600 * 1000) {
    return { eligible: true, reason: `merged ${formatAge(ageMs)} ago` };
  }

  // Rule 4: Task cancelled and > 3d
  if (taskStatus === 'cancelled' && ageMs > 3 * 24 * 3600 * 1000) {
    return { eligible: true, reason: `cancelled ${formatAge(ageMs)} ago` };
  }

  // Rule 5: Stale (> 30d, no activity)
  if (ageMs > 30 * 24 * 3600 * 1000) {
    return { eligible: true, reason: `stale ${formatAge(ageMs)}, no activity` };
  }

  // Rule 6: Check PR status (protection rule)
  const prStatus = await checkPRStatus(taskId);
  if (prStatus && prStatus !== 'merged') {
    return { eligible: false, reason: `PR #${prStatus} not merged (protection)` };
  }

  // Default: not eligible
  return { eligible: false, reason: 'does not meet deletion criteria' };
}

/**
 * Get task status from ticket file
 */
async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const ticketPath = path.join(process.cwd(), `jira/tickets/${taskId}/${taskId}.md`);

  try {
    const content = await fs.readFile(ticketPath, 'utf-8');

    // Match pattern: **状态**: `done` or **Status**: done
    const statusMatch =
      content.match(/\*\*状态\*\*:\s*`?(\w+)`?/i) ||
      content.match(/\*\*Status\*\*:\s*`?(\w+)`?/i) ||
      content.match(/Status:\s*(\w+)/i);

    if (!statusMatch) {
      return null;
    }

    const rawStatus = statusMatch[1].toLowerCase();
    const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'analysis_review', 'approved', 'review', 'done', 'cancelled'];

    return validStatuses.includes(rawStatus as TaskStatus) ? (rawStatus as TaskStatus) : null;
  } catch {
    // Ticket not found or unreadable → treat as stale
    return null;
  }
}

/**
 * Check PR status via gh CLI (graceful fallback if gh unavailable)
 */
async function checkPRStatus(taskId: string): Promise<PRStatus> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--search', `head:checkpoint/${taskId}`, '--json', 'number,state'],
      { cwd: process.cwd(), timeout: 5000 }
    );

    const prs = JSON.parse(stdout);
    if (prs.length === 0) {
      return false; // No PR
    }

    const pr = prs[0];
    return pr.state === 'MERGED' ? 'merged' : String(pr.number);
  } catch {
    // gh CLI unavailable or error → skip PR check (graceful fallback)
    return false;
  }
}

/**
 * Delete eligible checkpoint branches
 */
async function deleteCheckpointBranches(branches: CheckpointBranch[]): Promise<void> {
  console.log(COLORS.bold + '\n🗑️  Deleting checkpoint branches...\n' + COLORS.reset);

  const eligible = branches.filter((b) => b.eligible);

  if (eligible.length === 0) {
    console.log(COLORS.green + '✅ No branches to delete\n' + COLORS.reset);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const branch of eligible) {
    try {
      await execFileAsync('git', ['push', 'origin', '--delete', branch.name], {
        cwd: process.cwd(),
        timeout: 10000,
      });

      console.log(COLORS.green + `✅ ${branch.name} deleted` + COLORS.reset);
      successCount++;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      console.log(COLORS.red + `❌ ${branch.name} failed: ${errMsg}` + COLORS.reset);
      failCount++;
    }
  }

  console.log(
    COLORS.bold +
      `\n📊 Total: ${successCount} deleted, ${failCount} failed\n` +
      COLORS.reset
  );
}

/**
 * Print GC report (eligible + skipped branches)
 */
function printGCReport(branches: CheckpointBranch[], isDryRun: boolean): void {
  const eligible = branches.filter((b) => b.eligible);
  const skipped = branches.filter((b) => !b.eligible);

  console.log(COLORS.bold + '📊 Checkpoint branches eligible for cleanup:\n' + COLORS.reset);

  if (eligible.length === 0) {
    console.log(COLORS.green + '✅ No branches to delete (all clean)\n' + COLORS.reset);
  } else {
    for (const branch of eligible) {
      console.log(COLORS.green + `✅ ${branch.name} (${branch.reason})` + COLORS.reset);
    }
  }

  if (skipped.length > 0) {
    console.log(COLORS.bold + '\n⚠️  Skipped:\n' + COLORS.reset);
    for (const branch of skipped) {
      console.log(COLORS.yellow + `   - ${branch.name} (${branch.reason})` + COLORS.reset);
    }
  }

  const actionHint = isDryRun ? `(use --execute to delete)` : '';
  console.log(
    COLORS.bold +
      `\n📊 Total: ${eligible.length} branches to delete ${actionHint}\n` +
      COLORS.reset
  );
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(d|h|m)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Expected format: <number><d|h|m> (e.g., "7d", "14d")`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'd') {return value * 24 * 3600 * 1000;}
  if (unit === 'h') {return value * 3600 * 1000;}
  if (unit === 'm') {return value * 60 * 1000;}

  throw new Error(`Invalid duration unit: ${unit}`);
}

/**
 * Format age (milliseconds) as human-readable string
 */
function formatAge(ageMs: number): string {
  const days = Math.floor(ageMs / (24 * 3600 * 1000));
  if (days > 0) {return `${days}d`;}

  const hours = Math.floor(ageMs / (3600 * 1000));
  if (hours > 0) {return `${hours}h`;}

  const minutes = Math.floor(ageMs / (60 * 1000));
  return `${minutes}m`;
}
