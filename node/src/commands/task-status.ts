/**
 * EKET Framework - Task Status Command
 *
 * Implements `eket task:status <task-id>` to display task progress
 * with checkpoint branch status (AC-1~4).
 *
 * Features:
 * - Detects remote checkpoint branch existence (AC-1)
 * - Displays last commit metadata (time, phase, slaver) (AC-2)
 * - Compares local vs remote progress (AC-3)
 * - Colorful output with sync status icons (AC-4)
 *
 * Usage:
 *   eket task:status TASK-640
 *   eket task:status TASK-640 --no-color  # For CI environments
 */

import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { parseProgressMarkdown } from '../utils/progress-parser.js';
import { ProgressSnapshot } from '../types/progress-tracker.js';

const execFileAsync = promisify(execFile);

/**
 * ANSI color codes (reused from error-handler.ts)
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
 * Task status interface
 */
interface TaskStatus {
  taskId: string;
  title: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  assignee: string | null;
  checkpoint: CheckpointStatus | null;
  localProgress: LocalProgressStatus | null;
}

/**
 * Checkpoint branch status
 */
interface CheckpointStatus {
  exists: boolean;
  branch: string;
  lastCommit: {
    sha: string;
    message: string;
    timestamp: Date;
    phase: string;
    slaverId: string;
  } | null;
}

/**
 * Local progress.md status
 */
interface LocalProgressStatus {
  exists: boolean;
  lastUpdate: Date | null;
  currentPhase: string | null;
}

/**
 * Command options
 */
interface StatusOptions {
  color?: boolean;
}

/**
 * Register task:status command
 */
export function registerTaskStatus(program: Command): void {
  program
    .command('task:status <task-id>')
    .description('Show task progress with checkpoint branch status')
    .option('--no-color', 'Disable color output (for CI environments)')
    .addHelpText(
      'after',
      `
Examples:
  $ eket task:status TASK-640               # Show full status
  $ eket task:status TASK-640 --no-color    # Plain text output

Output Indicators:
  ✅ Green  - Synced (local == remote)
  ⚠️ Yellow - Local ahead (uncommitted changes)
  ❌ Red    - Diverged / No checkpoint
`
    )
    .action(async (taskId: string, options: StatusOptions) => {
      try {
        const status = await getTaskStatus(taskId);
        printTaskStatus(status, options.color ?? true);
      } catch (error) {
        console.error(
          `${COLORS.red}❌ Error fetching task status: ${error instanceof Error ? error.message : String(error)}${COLORS.reset}`
        );
        process.exit(1);
      }
    });
}

/**
 * Get comprehensive task status
 */
async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  // 1. Read ticket metadata
  const ticketPath = path.join(process.cwd(), `jira/tickets/${taskId}/${taskId}.md`);
  const ticketMeta = await parseTicketMetadata(ticketPath);

  // 2. Check checkpoint branch
  const checkpointStatus = await getCheckpointStatus(taskId);

  // 3. Check local progress.md
  const localProgress = await getLocalProgress(taskId);

  return {
    taskId,
    title: ticketMeta.title,
    status: ticketMeta.status,
    assignee: ticketMeta.assignee,
    checkpoint: checkpointStatus,
    localProgress,
  };
}

/**
 * Parse ticket metadata from markdown
 */
async function parseTicketMetadata(
  ticketPath: string
): Promise<{ title: string; status: 'todo' | 'in_progress' | 'review' | 'done'; assignee: string | null }> {
  try {
    const content = await fs.readFile(ticketPath, 'utf-8');
    const lines = content.split('\n');

    // Extract first heading as title
    const titleMatch = lines.find((line) => line.startsWith('# '));
    const title = titleMatch ? titleMatch.replace(/^#\s+/, '').trim() : 'Unknown Task';

    // Extract status from frontmatter or content
    const statusMatch = content.match(/\*\*Status\*\*:\s*`?(\w+)`?/i) ||
                       content.match(/Status:\s*(\w+)/i);
    const rawStatus = statusMatch ? statusMatch[1].toLowerCase() : 'todo';
    const status = (['todo', 'in_progress', 'review', 'done'].includes(rawStatus)
      ? rawStatus
      : 'todo') as 'todo' | 'in_progress' | 'review' | 'done';

    // Extract assignee
    const assigneeMatch = content.match(/\*\*Assignee\*\*:\s*(.+)/i) ||
                         content.match(/Assignee:\s*(.+)/i);
    const assignee = assigneeMatch ? assigneeMatch[1].trim() : null;

    return { title, status, assignee };
  } catch (error) {
    throw new Error(`Failed to read ticket metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get checkpoint branch status (AC-1, AC-2)
 */
async function getCheckpointStatus(taskId: string): Promise<CheckpointStatus> {
  const branch = `checkpoint/${taskId}`;

  try {
    // Try remote branch first (AC-1)
    try {
      await execFileAsync('git', ['fetch', 'origin', branch], {
        cwd: process.cwd(),
        timeout: 5000, // 5s timeout (reduced from 10s)
      });
    } catch {
      // Fallback: check local branch if fetch fails
      // (offline mode or no remote)
    }

    // Check if origin/<branch> exists, fallback to local <branch>
    const remoteBranch = `origin/${branch}`;
    let actualBranch = remoteBranch;

    const { stdout: lsRemote } = await execFileAsync(
      'git',
      ['branch', '-r', '--list', remoteBranch],
      { cwd: process.cwd() }
    );

    if (!lsRemote.trim()) {
      // Remote branch doesn't exist, try local
      const { stdout: lsLocal } = await execFileAsync(
        'git',
        ['branch', '--list', branch],
        { cwd: process.cwd() }
      );

      if (!lsLocal.trim()) {
        // Neither remote nor local exists
        return {
          exists: false,
          branch: remoteBranch,
          lastCommit: null,
        };
      }

      // Use local branch
      actualBranch = branch;
    }

    // 2. Get last commit info (AC-2)
    const { stdout: logOutput } = await execFileAsync(
      'git',
      ['log', actualBranch, '--format=%H|%s|%aI|%an', '-1'],
      { cwd: process.cwd() }
    );

    if (!logOutput.trim()) {
      return {
        exists: false,
        branch: actualBranch,
        lastCommit: null,
      };
    }

    const [sha, message, timestamp, author] = logOutput.trim().split('|');

    // 3. Parse commit message for metadata
    // Expected format: "checkpoint: ac_1_done\n\n{...json...}"
    const phaseMatch = message.match(/checkpoint:\s*(\w+)/);
    let slaverId = 'unknown';
    let phase = phaseMatch ? phaseMatch[1] : 'unknown';

    // Try to extract JSON metadata from commit message
    try {
      const jsonMatch = message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const metadata = JSON.parse(jsonMatch[0]);
        slaverId = metadata.slaver_id || author;
        phase = metadata.phase || phase;
      }
    } catch {
      // Fallback to author if JSON parsing fails
      slaverId = author;
    }

    return {
      exists: true,
      branch: actualBranch,
      lastCommit: {
        sha: sha.substring(0, 7),
        message,
        timestamp: new Date(timestamp),
        phase,
        slaverId,
      },
    };
  } catch (error) {
    // Branch doesn't exist or fetch failed
    return {
      exists: false,
      branch: `origin/${branch}`,
      lastCommit: null,
    };
  }
}

/**
 * Get local progress.md status (AC-3)
 */
async function getLocalProgress(taskId: string): Promise<LocalProgressStatus> {
  const progressPath = path.join(process.cwd(), `jira/tickets/${taskId}/progress.md`);

  try {
    const content = await fs.readFile(progressPath, 'utf-8');
    const parseResult = parseProgressMarkdown(content, taskId);

    if (!parseResult.success || !parseResult.data) {
      return { exists: false, lastUpdate: null, currentPhase: null };
    }

    const data = parseResult.data as ProgressSnapshot;

    return {
      exists: true,
      lastUpdate: new Date(data.lastUpdate),
      currentPhase: data.currentPhase,
    };
  } catch {
    return { exists: false, lastUpdate: null, currentPhase: null };
  }
}

/**
 * Print task status with colored output (AC-4)
 */
function printTaskStatus(status: TaskStatus, useColor: boolean): void {
  const c = useColor ? COLORS : noColor;

  console.log('');
  console.log(c.bold + `${status.taskId}: ${status.title}` + c.reset);
  console.log('━'.repeat(60));
  console.log(`Status: ${c.cyan}${status.status}${c.reset}`);
  console.log(`Assignee: ${status.assignee ? c.cyan + status.assignee + c.reset : c.gray + '(unassigned)' + c.reset}`);
  console.log('');

  // Checkpoint status (AC-1, AC-2)
  if (status.checkpoint?.exists && status.checkpoint.lastCommit) {
    const commit = status.checkpoint.lastCommit;
    const timeAgo = formatTimeAgo(commit.timestamp);

    console.log(c.green + '✅ Checkpoint: ' + c.reset + c.gray + status.checkpoint.branch + c.reset);
    console.log(`   Last Update: ${c.yellow}${timeAgo}${c.reset} (${commit.timestamp.toLocaleString()})`);
    console.log(`   Phase: ${c.cyan}${commit.phase}${c.reset}`);
    console.log(`   Slaver: ${c.gray}${commit.slaverId}${c.reset}`);
    console.log(`   Commit: ${c.gray}${commit.sha}${c.reset}`);
    console.log('');

    // Compare with local progress (AC-3)
    if (status.localProgress?.exists && status.localProgress.lastUpdate) {
      const localTime = status.localProgress.lastUpdate.getTime();
      const remoteTime = commit.timestamp.getTime();
      const diff = localTime - remoteTime;

      if (Math.abs(diff) < 60000) {
        // < 1min difference = synced
        console.log(c.green + '   ✅ Synced with local progress' + c.reset);
      } else if (diff > 0) {
        // Local ahead
        console.log(c.yellow + '   ⚠️  Local ahead of remote (uncommitted changes)' + c.reset);
        console.log(c.gray + `   Local: ${status.localProgress.lastUpdate.toLocaleString()}` + c.reset);
      } else {
        // Local behind (unusual)
        console.log(c.red + '   ❌ Local behind remote (possible conflict)' + c.reset);
        console.log(c.gray + `   Local: ${status.localProgress.lastUpdate.toLocaleString()}` + c.reset);
      }
    } else if (!status.localProgress?.exists) {
      console.log(c.gray + '   ⚠️  No local progress.md found' + c.reset);
    }
  } else {
    console.log(c.yellow + '⚠️  No checkpoint (new task or checkpoint disabled)' + c.reset);
  }

  console.log('');
}

/**
 * Format time difference as human-readable string
 */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * No-color fallback (returns plain strings)
 */
const noColor = {
  reset: '',
  red: '',
  yellow: '',
  blue: '',
  green: '',
  cyan: '',
  gray: '',
  bold: '',
};
