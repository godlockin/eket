/**
 * EKET Framework - Task Verification Command
 *
 * Implements `eket task:verify <task-id>` to cross-verify progress.md
 * against actual git state and file existence.
 *
 * Prevents Slaver from forging progress by validating:
 * - Git commits exist
 * - Declared files exist
 * - Tests can be re-run
 * - Timestamps are monotonic
 */

import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { parseProgressMarkdown } from '../utils/progress-parser.js';
import { Checkpoint } from '../types/progress-tracker.js';

const execFileAsync = promisify(execFile);

/**
 * Verification check result
 */
interface VerificationCheck {
  ac: string;
  check: 'file' | 'commit' | 'test' | 'timestamp';
  result: 'pass' | 'fail';
  details?: string;
  missing?: string[];
}

/**
 * Overall verification result
 */
interface VerificationResult {
  taskId: string;
  status: 'verified' | 'failed' | 'error';
  checks: VerificationCheck[];
  error?: string;
}

/**
 * Options for verify command
 */
interface VerifyOptions {
  runTests?: boolean;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Register task:verify command
 */
export function registerTaskVerify(program: Command): void {
  program
    .command('task:verify <task-id>')
    .description('Verify progress.md integrity against git and filesystem')
    .option('--run-tests', 'Re-run tests for verification')
    .option('--json', 'Output JSON format')
    .option('--verbose', 'Show detailed verification steps')
    .addHelpText(
      'after',
      `
Examples:
  $ eket task:verify TASK-640                    # Verify basic integrity
  $ eket task:verify TASK-640 --run-tests        # Include test re-execution
  $ eket task:verify TASK-640 --json             # JSON output for CI
  $ eket task:verify TASK-640 --verbose          # Detailed output

Verification Checks:
  ✅ File Existence    - Declared files exist
  ✅ Commit Existence  - Git commits exist in history
  ✅ Test Execution    - Tests can be re-run (--run-tests)
  ✅ Timestamp Order   - Timestamps are monotonic
`
    )
    .action(async (taskId: string, options: VerifyOptions) => {
      const result = await verifyTask(taskId, options);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printVerificationResult(result, options.verbose || false);
      }

      // Exit with appropriate code
      process.exit(result.status === 'verified' ? 0 : result.status === 'error' ? 2 : 1);
    });
}

/**
 * Verify task progress
 */
async function verifyTask(taskId: string, options: VerifyOptions): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];

  try {
    // 1. Read progress.md
    const progressPath = path.join(process.cwd(), `jira/tickets/${taskId}/progress.md`);

    let progressContent: string;
    try {
      progressContent = await fs.readFile(progressPath, 'utf-8');
    } catch (error) {
      return {
        taskId,
        status: 'error',
        checks: [],
        error: `Progress file not found: ${progressPath}`,
      };
    }

    // 2. Parse progress.md
    const parseResult = parseProgressMarkdown(progressContent, taskId);
    if (!parseResult.success || !parseResult.data) {
      return {
        taskId,
        status: 'error',
        checks: [],
        error: `Invalid progress.md format: ${parseResult.error?.message}`,
      };
    }

    const snapshot = parseResult.data;

    // 3. Filter completed checkpoints (exclude notes and in-progress)
    const completedCheckpoints = snapshot.checkpoints.filter(
      (cp) => cp.phase !== 'note' && !cp.phase.endsWith('_start')
    );

    if (completedCheckpoints.length === 0) {
      return {
        taskId,
        status: 'verified',
        checks: [],
      };
    }

    // 4. Verify file existence
    for (const cp of completedCheckpoints) {
      if (cp.metadata.files && cp.metadata.files.length > 0) {
        const fileChecks = await verifyFiles(cp);
        checks.push(...fileChecks);
      }
    }

    // 5. Verify git commits
    for (const cp of completedCheckpoints) {
      if (cp.metadata.commit) {
        const commitCheck = await verifyCommit(cp);
        checks.push(commitCheck);
      }
    }

    // 6. Verify timestamp monotonicity
    const timestampCheck = verifyTimestampOrder(completedCheckpoints);
    checks.push(timestampCheck);

    // 7. Optionally re-run tests
    if (options.runTests) {
      for (const cp of completedCheckpoints) {
        if (cp.metadata.tests) {
          const testCheck = await verifyTests(cp);
          checks.push(testCheck);
        }
      }
    }

    // 8. Determine overall status
    const hasFailed = checks.some((c) => c.result === 'fail');
    const status = hasFailed ? 'failed' : 'verified';

    return {
      taskId,
      status,
      checks,
    };
  } catch (error) {
    return {
      taskId,
      status: 'error',
      checks,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verify file existence
 */
async function verifyFiles(checkpoint: Checkpoint): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];
  const missing: string[] = [];

  for (const file of checkpoint.metadata.files || []) {
    const filePath = path.join(process.cwd(), file);
    try {
      await fs.access(filePath);
    } catch {
      missing.push(file);
    }
  }

  const acId = checkpoint.metadata.acId || checkpoint.phase;

  checks.push({
    ac: acId,
    check: 'file',
    result: missing.length === 0 ? 'pass' : 'fail',
    details: missing.length === 0 ? `All ${checkpoint.metadata.files!.length} files exist` : undefined,
    missing,
  });

  return checks;
}

/**
 * Verify git commit existence
 */
async function verifyCommit(checkpoint: Checkpoint): Promise<VerificationCheck> {
  const acId = checkpoint.metadata.acId || checkpoint.phase;
  const commit = checkpoint.metadata.commit!;

  try {
    // Use safe execFile (no shell injection)
    await execFileAsync('git', ['show', '--quiet', commit], {
      cwd: process.cwd(),
      timeout: 5000,
    });

    return {
      ac: acId,
      check: 'commit',
      result: 'pass',
      details: `Commit ${commit.substring(0, 7)} exists`,
    };
  } catch (error) {
    return {
      ac: acId,
      check: 'commit',
      result: 'fail',
      details: `Commit ${commit.substring(0, 7)} not found in git history`,
    };
  }
}

/**
 * Verify timestamp monotonicity (chronological order)
 */
function verifyTimestampOrder(checkpoints: Checkpoint[]): VerificationCheck {
  let previousTime = 0;
  let isMonotonic = true;

  for (const cp of checkpoints) {
    const currentTime = new Date(cp.timestamp).getTime();
    if (currentTime < previousTime) {
      isMonotonic = false;
      break;
    }
    previousTime = currentTime;
  }

  return {
    ac: 'all',
    check: 'timestamp',
    result: isMonotonic ? 'pass' : 'fail',
    details: isMonotonic
      ? `All ${checkpoints.length} timestamps are in chronological order`
      : 'Timestamp order violation detected',
  };
}

/**
 * Verify tests can be re-run
 */
async function verifyTests(checkpoint: Checkpoint): Promise<VerificationCheck> {
  const acId = checkpoint.metadata.acId || checkpoint.phase;
  const testCommand = checkpoint.metadata.tests?.command || 'npm test';

  try {
    // Parse command (simple split, assumes no complex quoting)
    const [cmd, ...args] = testCommand.split(/\s+/);

    await execFileAsync(cmd, args, {
      cwd: process.cwd(),
      timeout: 60000, // 60s max
    });

    return {
      ac: acId,
      check: 'test',
      result: 'pass',
      details: `Test command succeeded: ${testCommand}`,
    };
  } catch (error) {
    return {
      ac: acId,
      check: 'test',
      result: 'fail',
      details: `Test command failed: ${testCommand}`,
    };
  }
}

/**
 * Print verification result (human-readable)
 */
function printVerificationResult(result: VerificationResult, verbose: boolean): void {
  if (result.status === 'error') {
    console.error(`\n❌ ${result.taskId} Verification ERROR`);
    console.error(`  ${result.error}\n`);
    return;
  }

  const passCount = result.checks.filter((c) => c.result === 'pass').length;
  const failCount = result.checks.filter((c) => c.result === 'fail').length;

  if (result.status === 'verified') {
    console.log(`\n✅ ${result.taskId} Verification PASSED (${passCount}/${passCount + failCount} checks)`);
  } else {
    console.log(`\n❌ ${result.taskId} Verification FAILED (${passCount}/${passCount + failCount} checks)`);
  }

  // Group checks by AC
  const checksByAC = new Map<string, VerificationCheck[]>();
  for (const check of result.checks) {
    const existing = checksByAC.get(check.ac) || [];
    existing.push(check);
    checksByAC.set(check.ac, existing);
  }

  for (const [ac, checks] of checksByAC) {
    console.log(`\n  ${ac}:`);
    for (const check of checks) {
      const icon = check.result === 'pass' ? '✅' : '❌';
      const checkName = check.check;

      if (verbose || check.result === 'fail') {
        console.log(`    ${icon} ${checkName}: ${check.details || check.result}`);
        if (check.missing && check.missing.length > 0) {
          console.log(`       Missing: ${check.missing.join(', ')}`);
        }
      } else {
        console.log(`    ${icon} ${checkName}`);
      }
    }
  }

  console.log(`\nStatus: ${result.status.toUpperCase()}\n`);
}
