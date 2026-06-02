/**
 * EPIC Run Command (TASK-642)
 *
 * One-click EPIC execution with optional DAG mode:
 *   - epic:run EPIC-017         - Execute EPIC with simple sequential mode
 *   - epic:run EPIC-017 --dag   - Execute EPIC with DAG orchestration
 *
 * DAG Mode Flow:
 *   1. epic:analyze -> check complexity
 *   2. dag:generate -> create DAG YAML (if not exists)
 *   3. dag:run -> execute with Slaver auto-dispatch
 *
 * Sequential Mode Flow:
 *   1. Find all ready tickets
 *   2. Execute one by one in priority order
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';
import ora from 'ora';

import { createDAGExecutor } from '../core/dag-executor.js';
import { createDAGSlaverBridge, type DAGProgress } from '../core/dag-slaver-bridge.js';
import {
  findEpicTickets,
  analyzeComplexity,
  generateDAGConfig,
  dagConfigToYaml,
} from '../core/epic-utils.js';
import { createEventBus } from '../core/event-bus.js';
import { logger } from '../utils/logger.js';
import { printError } from '../utils/error-handler.js';

// ============================================================================
// Types
// ============================================================================

interface EpicRunOptions {
  projectRoot: string;
  dag: boolean;
  dryRun: boolean;
  force: boolean;
  watch: boolean;
  interval: number;
}

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Execute EPIC with DAG mode
 */
async function executeWithDAG(
  epicId: string,
  projectRoot: string,
  options: { dryRun: boolean; force: boolean; watch: boolean; interval: number }
): Promise<void> {
  const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
  const epicDir = path.join(ticketsDir, epicId);
  const dagPath = path.join(epicDir, 'dag.yml');

  // Step 1: Check if DAG exists, generate if not
  if (!fs.existsSync(dagPath) || options.force) {
    console.log(`\n[epic:run] Generating DAG for ${epicId}...`);

    const tickets = await findEpicTickets(epicId, projectRoot);
    if (tickets.length === 0) {
      throw new Error(`No tickets found for ${epicId}`);
    }

    const dagConfig = generateDAGConfig(epicId, tickets);
    const yaml = dagConfigToYaml(dagConfig);

    // Ensure EPIC directory exists
    fs.mkdirSync(epicDir, { recursive: true });
    fs.writeFileSync(dagPath, yaml, 'utf-8');

    console.log(`[epic:run] DAG generated: ${dagPath}`);
    console.log(`[epic:run] Nodes: ${dagConfig.nodes.length}`);
  } else {
    console.log(`[epic:run] Using existing DAG: ${dagPath}`);
  }

  // Step 2: Create shared EventBus for DAG executor and bridge
  const eventBus = createEventBus();
  eventBus.connect();

  // Step 3: Create DAG-Slaver bridge
  const bridge = createDAGSlaverBridge({
    projectRoot,
    masterId: 'master',
    eventBus,
  });

  // Step 4: Execute DAG
  const executor = createDAGExecutor({ eventBus });

  console.log(`\n[epic:run] Executing DAG with Slaver auto-dispatch...`);
  console.log(`[epic:run] Dry run: ${options.dryRun}`);
  console.log('');

  try {
    const dag = await executor.load(dagPath);
    const result = await executor.execute(dag, {
      dryRun: options.dryRun,
      dagPath,
      onNodeStart: (nodeId) => {
        console.log(`  [NODE] ${nodeId} starting...`);
      },
      onNodeComplete: (nodeId, nodeResult) => {
        const statusIcon = nodeResult.status === 'done' ? '\x1b[32m+\x1b[0m' :
                          nodeResult.status === 'failed' ? '\x1b[31mx\x1b[0m' :
                          nodeResult.status === 'skipped' ? '\x1b[33m>\x1b[0m' : '?';
        console.log(`  [NODE] ${nodeId} ${statusIcon} (${nodeResult.duration ?? 0}ms)`);
      },
    });

    // Print summary
    printDAGSummary(result, bridge.getActiveRunProgress());

    // Watch mode: periodically check progress
    if (options.watch && !options.dryRun && result.status === 'running') {
      console.log(`\n[epic:run] Watch mode enabled (interval: ${options.interval}s)`);
      console.log('[epic:run] Press Ctrl+C to stop watching');

      const watchInterval = setInterval(() => {
        const progress = bridge.getRunProgress(result.runId);
        if (progress) {
          console.log(`\n[${new Date().toISOString().slice(11, 19)}] Progress:`);
          console.log(`  Completed: ${progress.completedNodes}/${progress.totalNodes}`);
          console.log(`  Running: ${progress.runningNodes}`);
          console.log(`  Failed: ${progress.failedNodes}`);
          console.log(`  Pending dispatch: ${bridge.getPendingDispatchCount()}`);

          if (progress.status !== 'running') {
            clearInterval(watchInterval);
            console.log(`\n[epic:run] DAG execution ${progress.status}`);
          }
        }
      }, options.interval * 1000);

      // Handle Ctrl+C - cleanup resources before exit
      process.on('SIGINT', async () => {
        clearInterval(watchInterval);
        console.log('\n[epic:run] Stopping watch mode...');

        // Cleanup resources
        try {
          executor.disconnect();
          bridge.disconnect();
          eventBus.disconnect();
          console.log('[epic:run] Resources cleaned up');
        } catch (cleanupErr) {
          logger.warn('epic_run_cleanup_error', { error: (cleanupErr as Error).message });
        }

        process.exit(0);
      });
    }
  } finally {
    if (!options.watch) {
      executor.disconnect();
      bridge.disconnect();
      eventBus.disconnect();
    }
  }
}

/**
 * Execute EPIC with sequential mode
 */
async function executeSequential(
  epicId: string,
  projectRoot: string,
  options: { dryRun: boolean }
): Promise<void> {
  const tickets = await findEpicTickets(epicId, projectRoot);

  if (tickets.length === 0) {
    throw new Error(`No tickets found for ${epicId}`);
  }

  const complexity = analyzeComplexity(tickets, epicId);

  // Filter ready tasks and sort by priority
  const readyTasks = complexity.tasks
    .filter(t => t.status === 'ready' || t.status === 'backlog')
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
    });

  console.log(`\n[epic:run] Sequential mode`);
  console.log(`[epic:run] Total tasks: ${complexity.tasks.length}`);
  console.log(`[epic:run] Ready tasks: ${readyTasks.length}`);
  console.log('');

  if (options.dryRun) {
    console.log('Execution order (dry-run):');
    for (let i = 0; i < readyTasks.length; i++) {
      const task = readyTasks[i];
      const deps = task.dependencies.length > 0 ? ` (deps: ${task.dependencies.join(', ')})` : '';
      console.log(`  ${i + 1}. ${task.id} [${task.priority}]${deps}`);
    }
    return;
  }

  // Execute tasks
  for (const task of readyTasks) {
    console.log(`[TASK] Executing ${task.id}...`);
    console.log(`       Run: eket task:claim ${task.id}`);
    // In real mode, this would invoke task:claim via CLI or API
  }
}

/**
 * Print DAG execution summary
 */
function printDAGSummary(result: import('../core/dag-executor.js').DAGRun, progress: DAGProgress[]): void {
  console.log('');
  console.log('========================================');
  console.log('       EPIC DAG Execution Summary       ');
  console.log('========================================');
  console.log('');
  console.log(`Run ID:     ${result.runId}`);
  console.log(`EPIC:       ${result.epicId}`);
  console.log(`Status:     ${result.status}`);
  console.log(`Duration:   ${result.duration ? `${result.duration}ms` : 'N/A'}`);
  console.log('');
  console.log('Nodes:');
  console.log(`  Total:      ${result.totalNodes}`);
  console.log(`  Completed:  ${result.completedNodes}`);
  console.log(`  Failed:     ${result.failedNodes}`);
  console.log(`  Skipped:    ${result.skippedNodes}`);
  console.log('');

  // Show Slaver assignments
  const runProgress = progress.find(p => p.runId === result.runId);
  if (runProgress && runProgress.assignments.length > 0) {
    console.log('Slaver Assignments:');
    for (const assignment of runProgress.assignments) {
      const statusIcon = assignment.status === 'done' ? '\x1b[32m+\x1b[0m' :
                        assignment.status === 'failed' ? '\x1b[31mx\x1b[0m' :
                        assignment.status === 'running' ? '\x1b[34m>\x1b[0m' : 'o';
      console.log(`  ${statusIcon} ${assignment.nodeId} -> ${assignment.slaverId}`);
    }
    console.log('');
  }
}

// ============================================================================
// CLI Command Registration
// ============================================================================

/**
 * Register epic:run command
 */
export function registerEpicRunCommand(program: Command): void {
  program
    .command('epic:run <epicId>')
    .description('Execute an EPIC with sequential or DAG mode')
    .option('-p, --project-root <path>', 'Project root directory', process.cwd())
    .option('--dag', 'Use DAG mode for parallel execution with Slaver dispatch')
    .option('--dry-run', 'Preview execution without running tasks')
    .option('--force', 'Force regenerate DAG even if exists')
    .option('--watch', 'Watch mode: periodically report progress')
    .option('--interval <seconds>', 'Watch interval in seconds', '30')
    .addHelpText(
      'after',
      `
Examples:
  $ eket epic:run EPIC-017                  # Sequential execution
  $ eket epic:run EPIC-017 --dag            # DAG mode with Slaver dispatch
  $ eket epic:run EPIC-017 --dag --dry-run  # Preview DAG execution
  $ eket epic:run EPIC-017 --dag --watch    # Watch progress in real-time

DAG Mode:
  When --dag is specified:
  1. Analyzes EPIC complexity
  2. Generates dag.yml (if not exists or --force)
  3. Executes DAG with parallel tasks
  4. Auto-dispatches nodes to idle Slavers via mailbox

Sequential Mode:
  Without --dag:
  1. Finds all ready tickets
  2. Executes in priority order (P0 -> P1 -> P2 -> P3)
  3. Respects dependencies

Related Commands:
  $ eket epic:analyze EPIC-017              # Analyze complexity
  $ eket dag:generate EPIC-017              # Generate DAG manually
  $ eket dag:run dag.yml                    # Execute DAG directly
  $ eket dag:view dag.yml                   # Visualize DAG
`
    )
    .action(async (epicId: string, opts: Partial<EpicRunOptions>) => {
      const spinner = ora(`Preparing ${epicId}...`).start();

      const options: EpicRunOptions = {
        projectRoot: opts.projectRoot ?? process.cwd(),
        dag: opts.dag ?? false,
        dryRun: opts.dryRun ?? false,
        force: opts.force ?? false,
        watch: opts.watch ?? false,
        interval: parseInt(opts.interval?.toString() ?? '30', 10),
      };

      try {
        // Validate EPIC ID format
        if (!/^EPIC-\d+$/.test(epicId)) {
          throw new Error(`Invalid EPIC ID format: ${epicId}. Expected: EPIC-NNN`);
        }

        // Check tickets directory exists
        const ticketsDir = path.join(options.projectRoot, 'jira', 'tickets');
        if (!fs.existsSync(ticketsDir)) {
          throw new Error(`Tickets directory not found: ${ticketsDir}`);
        }

        spinner.succeed(`Prepared ${epicId}`);

        logger.info('epic_run_start', {
          epicId,
          mode: options.dag ? 'dag' : 'sequential',
          dryRun: options.dryRun,
        });

        if (options.dag) {
          await executeWithDAG(epicId, options.projectRoot, {
            dryRun: options.dryRun,
            force: options.force,
            watch: options.watch,
            interval: options.interval,
          });
        } else {
          await executeSequential(epicId, options.projectRoot, {
            dryRun: options.dryRun,
          });
        }

        logger.info('epic_run_complete', { epicId, mode: options.dag ? 'dag' : 'sequential' });
      } catch (err) {
        spinner.fail(`EPIC execution failed: ${(err as Error).message}`);
        printError({
          code: 'EPIC_RUN_FAILED',
          message: (err as Error).message,
          causes: [
            'Invalid EPIC ID',
            'No tickets found for EPIC',
            'DAG validation failure',
            'Slaver dispatch failure',
          ],
          solutions: [
            'Verify EPIC ID format (EPIC-NNN)',
            'Check jira/tickets directory for tickets',
            'Run eket dag:validate to check DAG structure',
            'Ensure Slavers are running with heartbeat',
          ],
        });
        process.exit(1);
      }
    });
}
