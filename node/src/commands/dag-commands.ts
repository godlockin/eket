/**
 * DAG Commands (TASK-635, TASK-639)
 *
 * CLI commands for DAG execution with auto-detection and routing:
 *   - dag:run   - Execute a DAG file
 *   - dag:health - Show engine availability
 *   - dag:validate - Validate DAG structure
 *   - dag:status - Check run status
 *   - dag:view  - Visualize DAG (ASCII/Mermaid) [TASK-639]
 */

import { execFileSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { Command } from 'commander';
import ora from 'ora';

import { createDAGExecutor } from '../core/dag-executor.js';
import { createDAGVisualizer } from '../core/dag-visualizer.js';
import { printError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Helpers
// ============================================================================

/** Sleep for specified milliseconds */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Types
// ============================================================================

type EngineType = 'rust' | 'node' | 'shell';

interface EngineStatus {
  available: boolean;
  version?: string;
  reason?: string;
}

interface HealthStatus {
  rust: EngineStatus;
  node: EngineStatus;
  shell: EngineStatus;
  recommended: EngineType;
}

// ============================================================================
// Engine Detection
// ============================================================================

/**
 * Check if Rust DAG engine is available
 */
function checkRustEngine(): EngineStatus {
  try {
    // Check if eket binary exists using which
    const eketPath = execFileSync('which', ['eket'], { encoding: 'utf-8' }).trim();
    if (!eketPath) {
      return { available: false, reason: 'eket binary not found' };
    }

    // Check eket version
    try {
      const version = execFileSync('eket', ['--version'], { encoding: 'utf-8' }).trim();
      // Check if dag:health works
      execFileSync('eket', ['dag:health'], { encoding: 'utf-8' });
      return { available: true, version };
    } catch {
      return { available: false, reason: 'eket dag:health failed' };
    }
  } catch {
    return { available: false, reason: 'eket binary not found' };
  }
}

/**
 * Check if Node.js DAG executor is available
 */
function checkNodeEngine(): EngineStatus {
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);

    if (majorVersion < 20) {
      return { available: false, reason: `node version < 20 (got ${nodeVersion})` };
    }

    // Check if dag-executor module exists
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const executorPath = join(__dirname, '..', 'core', 'dag-executor.js');

    if (!existsSync(executorPath)) {
      return { available: false, reason: 'dag-executor module not found' };
    }

    return { available: true, version: nodeVersion };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

/**
 * Check if Shell runner is available
 */
function checkShellEngine(): EngineStatus {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const scriptPath = join(__dirname, '..', '..', '..', 'scripts', 'dag-runner.sh');

    if (!existsSync(scriptPath)) {
      return { available: false, reason: 'dag-runner.sh not found' };
    }

    // Check bash version
    try {
      const bashOutput = execFileSync('bash', ['--version'], { encoding: 'utf-8' });
      const bashVersion = bashOutput.split('\n')[0].match(/version (\d+\.\d+)/)?.[1] || 'unknown';
      return { available: true, version: `bash ${bashVersion}` };
    } catch {
      return { available: true, version: 'bash (version unknown)' };
    }
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

/**
 * Get health status of all engines
 */
function getHealthStatus(): HealthStatus {
  const rust = checkRustEngine();
  const node = checkNodeEngine();
  const shell = checkShellEngine();

  let recommended: EngineType = 'shell';
  if (rust.available) {
    recommended = 'rust';
  } else if (node.available) {
    recommended = 'node';
  }

  return { rust, node, shell, recommended };
}

/**
 * Detect best available engine
 */
function detectBestEngine(): EngineType {
  const status = getHealthStatus();
  return status.recommended;
}

// ============================================================================
// Engine Execution
// ============================================================================

/**
 * Execute DAG with Rust engine
 */
async function executeWithRust(dagPath: string, options: { dryRun?: boolean }): Promise<void> {
  const args = ['dag:run', dagPath];
  if (options.dryRun) {
    args.push('--dry-run');
  }

  return new Promise((resolve, reject) => {
    const child = spawn('eket', args, {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Rust engine exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Execute DAG with Node.js engine
 */
async function executeWithNode(dagPath: string, options: { dryRun?: boolean }): Promise<void> {
  const executor = createDAGExecutor();

  try {
    // Load and validate DAG
    const dag = await executor.load(dagPath);
    const validation = executor.validate(dag);

    if (!validation.valid) {
      throw new Error(
        `Invalid DAG: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`
      );
    }

    // Execute
    const result = await executor.execute(dag, {
      dryRun: options.dryRun,
      onNodeStart: (nodeId) => {
        logger.info('dag_node_start', { nodeId });
      },
      onNodeComplete: (nodeId, nodeResult) => {
        logger.info('dag_node_complete', {
          nodeId,
          status: nodeResult.status,
          duration: nodeResult.duration,
        });
      },
    });

    // Print summary
    console.log('');
    console.log('========================================');
    console.log('       DAG Execution Summary            ');
    console.log('========================================');
    console.log('');
    console.log(`Run ID:     ${result.runId}`);
    console.log(`EPIC:       ${result.epicId}`);
    console.log(`Status:     ${result.status}`);
    console.log(`Duration:   ${result.duration ? `${result.duration}ms` : 'N/A'}`);
    console.log(`Total:      ${result.totalNodes}`);
    console.log(`Completed:  ${result.completedNodes}`);
    console.log(`Failed:     ${result.failedNodes}`);
    console.log(`Skipped:    ${result.skippedNodes}`);
    console.log('');

    if (result.status === 'failed') {
      process.exitCode = 1;
    }
  } finally {
    executor.disconnect();
  }
}

/**
 * Execute DAG with Shell engine
 */
async function executeWithShell(dagPath: string, options: { dryRun?: boolean }): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const scriptPath = join(__dirname, '..', '..', '..', 'scripts', 'dag-runner.sh');

  const args = options.dryRun ? ['--dry-run', dagPath] : [dagPath];

  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args], {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Shell engine exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// ============================================================================
// CLI Commands
// ============================================================================

/**
 * Register DAG commands with Commander program
 */
export function registerDAGCommands(program: Command): void {
  // dag:run - Execute a DAG
  program
    .command('dag:run <file>')
    .description('Execute a DAG YAML file with auto-detected or specified engine')
    .option('--engine <type>', 'Force engine: rust, node, or shell')
    .option('--dry-run', 'Show execution plan without running')
    .option('--no-fallback', 'Disable fallback to lower-level engines')
    .addHelpText(
      'after',
      `
Examples:
  $ eket dag:run dag.yml                     # Auto-detect best engine
  $ eket dag:run --engine=node dag.yml       # Force Node.js engine
  $ eket dag:run --dry-run dag.yml           # Preview execution order
  $ eket dag:run --no-fallback dag.yml       # Fail if preferred engine unavailable

Environment Variables:
  EKET_DAG_ENGINE    Force specific engine (rust|node|shell)
  EKET_DAG_FALLBACK  Enable fallback chain (default: true)

Related Commands:
  $ eket dag:health                          # Check engine availability
  $ eket dag:validate <file>                 # Validate DAG structure
  $ eket dag:status <runId>                  # Check run status
`
    )
    .action(async (file: string, options: { engine?: string; dryRun?: boolean; fallback?: boolean }) => {
      const spinner = ora('Detecting engine...').start();

      try {
        // Validate file exists
        if (!existsSync(file)) {
          throw new Error(`DAG file not found: ${file}`);
        }

        // Determine engine
        let engine: EngineType = options.engine as EngineType || process.env.EKET_DAG_ENGINE as EngineType;
        const fallbackEnabled = options.fallback !== false && process.env.EKET_DAG_FALLBACK !== 'false';

        if (!engine) {
          engine = detectBestEngine();
        }

        // Validate engine choice
        const health = getHealthStatus();
        const engineStatus = health[engine];

        if (!engineStatus.available) {
          if (fallbackEnabled) {
            // Try fallback
            spinner.warn(`${engine} engine unavailable: ${engineStatus.reason}`);

            if (engine === 'rust' && health.node.available) {
              engine = 'node';
              console.log(`[DAG] Fallback to L2 Node (Rust unavailable: ${engineStatus.reason})`);
            } else if ((engine === 'rust' || engine === 'node') && health.shell.available) {
              engine = 'shell';
              console.log(`[DAG] Fallback to L0 Shell (${engine} unavailable: ${engineStatus.reason})`);
            } else {
              throw new Error(`No engines available! ${engineStatus.reason}`);
            }
          } else {
            throw new Error(`${engine} engine not available: ${engineStatus.reason}`);
          }
        }

        const engineLabel = engine === 'rust' ? 'L1 Rust' : engine === 'node' ? 'L2 Node' : 'L0 Shell';
        spinner.succeed(`Using ${engineLabel} engine`);

        logger.info('dag_run_start', {
          file,
          engine,
          dryRun: options.dryRun ?? false,
        });

        // Execute with selected engine
        switch (engine) {
          case 'rust':
            await executeWithRust(file, { dryRun: options.dryRun });
            break;
          case 'node':
            await executeWithNode(file, { dryRun: options.dryRun });
            break;
          case 'shell':
            await executeWithShell(file, { dryRun: options.dryRun });
            break;
        }
      } catch (err) {
        spinner.fail('DAG execution failed');
        printError({
          code: 'DAG_EXECUTION_FAILED',
          message: (err as Error).message,
          causes: [
            'Invalid DAG YAML structure',
            'Script execution failure',
            'Dependency cycle detected',
          ],
          solutions: [
            'Run eket dag:validate <file> to check DAG structure',
            'Check individual script commands',
            'Review dependency graph for cycles',
          ],
        });
        process.exit(1);
      }
    });

  // dag:health - Show engine availability
  program
    .command('dag:health')
    .description('Display DAG engine availability status')
    .addHelpText(
      'after',
      `
Examples:
  $ eket dag:health                          # Show all engine status

Output:
  Shows availability of each execution layer:
    L1 Rust  - High-performance native engine
    L2 Node  - TypeScript with EventBus
    L0 Shell - POSIX fallback

Related Commands:
  $ eket dag:run <file>                      # Execute a DAG
  $ eket system:doctor                       # Full system diagnosis
`
    )
    .action(() => {
      const health = getHealthStatus();

      console.log('');
      console.log('[DAG] Engine Availability');
      console.log('');

      // Rust
      if (health.rust.available) {
        console.log(`  \x1b[32mL1 Rust:\x1b[0m  available (${health.rust.version})`);
      } else {
        console.log(`  \x1b[31mL1 Rust:\x1b[0m  unavailable (${health.rust.reason})`);
      }

      // Node
      if (health.node.available) {
        console.log(`  \x1b[32mL2 Node:\x1b[0m  available (node ${health.node.version})`);
      } else {
        console.log(`  \x1b[31mL2 Node:\x1b[0m  unavailable (${health.node.reason})`);
      }

      // Shell
      if (health.shell.available) {
        console.log(`  \x1b[32mL0 Shell:\x1b[0m available (${health.shell.version})`);
      } else {
        console.log(`  \x1b[31mL0 Shell:\x1b[0m unavailable (${health.shell.reason})`);
      }

      console.log('');
      const recommendedLabel =
        health.recommended === 'rust' ? 'L1 Rust' :
        health.recommended === 'node' ? 'L2 Node' : 'L0 Shell';
      console.log(`[DAG] Recommended: ${recommendedLabel}`);
      console.log('');
    });

  // dag:validate - Validate DAG structure
  program
    .command('dag:validate <file>')
    .description('Validate DAG YAML structure without executing')
    .addHelpText(
      'after',
      `
Examples:
  $ eket dag:validate dag.yml                # Validate DAG structure

Validation checks:
  - Required fields (version, epic, nodes)
  - Node structure (id, script, deps)
  - Dependency references exist
  - No circular dependencies
  - Settings within bounds

Related Commands:
  $ eket dag:run <file>                      # Execute a DAG
  $ eket dag:health                          # Check engine availability
`
    )
    .action(async (file: string) => {
      const spinner = ora('Validating DAG...').start();

      try {
        if (!existsSync(file)) {
          throw new Error(`DAG file not found: ${file}`);
        }

        const executor = createDAGExecutor();

        try {
          const dag = await executor.load(file);
          const validation = executor.validate(dag);

          if (validation.valid) {
            spinner.succeed('DAG is valid');
            console.log('');
            console.log(`Version: ${dag.version}`);
            console.log(`EPIC:    ${dag.epic}`);
            console.log(`Nodes:   ${dag.nodes.length}`);
            console.log('');
            console.log('Nodes:');
            for (const node of dag.nodes) {
              const deps = node.deps?.length ? ` (deps: ${node.deps.join(', ')})` : '';
              console.log(`  - ${node.id}${deps}`);
            }
          } else {
            spinner.fail('DAG validation failed');
            console.log('');
            console.log('Errors:');
            for (const error of validation.errors) {
              console.log(`  - ${error.path}: ${error.message}`);
            }
            process.exit(1);
          }
        } finally {
          executor.disconnect();
        }
      } catch (err) {
        spinner.fail('Validation failed');
        printError({
          code: 'DAG_VALIDATION_FAILED',
          message: (err as Error).message,
        });
        process.exit(1);
      }
    });

  // dag:status - Check run status
  program
    .command('dag:status <runId>')
    .description('Check status of a DAG run')
    .option('--live', 'Watch mode: refresh status every 2 seconds')
    .option('--interval <ms>', 'Custom refresh interval in milliseconds (default: 2000)', '2000')
    .option('--dag <file>', 'DAG file path (required for --live mode ASCII visualization)')
    .addHelpText(
      'after',
      `
Examples:
  $ eket dag:status dag_abc123               # Check run status
  $ eket dag:status dag_abc123 --live        # Watch mode with 2s refresh
  $ eket dag:status dag_abc123 --live --interval 5000  # Watch with 5s refresh
  $ eket dag:status dag_abc123 --live --dag dag.yml    # Watch with ASCII visualization

Related Commands:
  $ eket dag:run <file>                      # Execute a DAG
  $ eket dag:run --resume <runId>            # Resume a failed run
  $ eket dag:view <file>                     # Visualize DAG structure
`
    )
    .action(async (runId: string, options: { live?: boolean; interval?: string; dag?: string }) => {
      const spinner = ora('Fetching run status...').start();

      try {
        const executor = createDAGExecutor();
        const visualizer = createDAGVisualizer();
        let dag: Awaited<ReturnType<typeof visualizer.loadFromFile>> | null = null;

        // Load DAG if provided for visualization
        if (options.dag) {
          try {
            dag = await visualizer.loadFromFile(options.dag);
          } catch (err) {
            spinner.warn(`Could not load DAG file: ${(err as Error).message}`);
          }
        }

        // Live mode: watch with periodic refresh
        if (options.live) {
          spinner.succeed('Starting live watch mode (Ctrl+C to exit)');
          const interval = parseInt(options.interval ?? '2000', 10);

          // Setup graceful exit
          let running = true;
          const cleanup = () => {
            running = false;
            executor.disconnect();
            console.log('\n[DAG] Watch stopped');
            process.exit(0);
          };
          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);

          // Clear screen helper
          const clearScreen = () => process.stdout.write('\x1B[2J\x1B[0f');

          while (running) {
            clearScreen();
            const status = await executor.getStatus(runId);

            if (!status) {
              console.log(`[DAG] Run not found: ${runId}`);
              await sleep(interval);
              continue;
            }

            // Header
            console.log(`[DAG] Live Status - ${new Date().toISOString()}`);
            console.log('');
            console.log(`Run ID:     ${status.runId}`);
            console.log(`EPIC:       ${status.epicId}`);
            console.log(`Status:     ${status.status}`);
            console.log(`Started:    ${new Date(status.startedAt).toISOString()}`);
            if (status.completedAt) {
              console.log(`Completed:  ${new Date(status.completedAt).toISOString()}`);
            }
            if (status.duration) {
              console.log(`Duration:   ${status.duration}ms`);
            }
            console.log('');

            // Progress bar
            const total = status.totalNodes;
            const completed = status.completedNodes + status.failedNodes + status.skippedNodes;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            const barWidth = 40;
            const filledWidth = Math.round((percent / 100) * barWidth);
            const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);
            console.log(`Progress:   [${bar}] ${percent}%`);
            console.log('');

            // Node counts
            console.log('Nodes:');
            console.log(`  Total:     ${status.totalNodes}`);
            console.log(`  Completed: ${status.completedNodes}`);
            console.log(`  Failed:    ${status.failedNodes}`);
            console.log(`  Skipped:   ${status.skippedNodes}`);

            // ASCII visualization if DAG is loaded
            if (dag && visualizer) {
              console.log('');
              console.log('─'.repeat(50));
              const result = visualizer.visualize(dag, status);
              console.log(result.ascii);
            }

            console.log('');
            console.log(`[Refreshing every ${interval}ms - Ctrl+C to exit]`);

            // Exit if completed
            if (status.status === 'completed' || status.status === 'failed') {
              console.log('');
              console.log(`[DAG] Run ${status.status}. Exiting watch mode.`);
              break;
            }

            await sleep(interval);
          }

          executor.disconnect();
          return;
        }

        // Non-live mode: single status check
        try {
          const status = await executor.getStatus(runId);

          if (!status) {
            spinner.fail(`Run not found: ${runId}`);
            process.exit(1);
          }

          spinner.succeed('Run status retrieved');
          console.log('');
          console.log(`Run ID:     ${status.runId}`);
          console.log(`EPIC:       ${status.epicId}`);
          console.log(`Status:     ${status.status}`);
          console.log(`Started:    ${new Date(status.startedAt).toISOString()}`);
          if (status.completedAt) {
            console.log(`Completed:  ${new Date(status.completedAt).toISOString()}`);
          }
          if (status.duration) {
            console.log(`Duration:   ${status.duration}ms`);
          }
          console.log('');
          console.log('Nodes:');
          console.log(`  Total:     ${status.totalNodes}`);
          console.log(`  Completed: ${status.completedNodes}`);
          console.log(`  Failed:    ${status.failedNodes}`);
          console.log(`  Skipped:   ${status.skippedNodes}`);
        } finally {
          executor.disconnect();
        }
      } catch (err) {
        spinner.fail('Failed to get status');
        printError({
          code: 'DAG_STATUS_FAILED',
          message: (err as Error).message,
        });
        process.exit(1);
      }
    });

  // dag:view - Visualize DAG (TASK-639)
  program
    .command('dag:view <file>')
    .description('Visualize DAG structure in ASCII or Mermaid format')
    .option('--format <type>', 'Output format: ascii or mermaid (default: ascii)', 'ascii')
    .option('--run-id <id>', 'Include status from a specific run')
    .option('--no-critical', 'Hide critical path highlighting')
    .addHelpText(
      'after',
      `
Examples:
  $ eket dag:view dag.yml                         # ASCII visualization
  $ eket dag:view --format=mermaid dag.yml        # Mermaid flowchart
  $ eket dag:view --run-id=dag_abc123 dag.yml     # Include run status
  $ eket dag:view --no-critical dag.yml           # Hide critical path

Output Formats:
  ascii    - Terminal-friendly tree with Unicode box drawing
  mermaid  - GitHub/GitLab compatible flowchart

Status Icons:
  ✅ done    ⏳ running    ⏸️ pending    ❌ failed    ⏭️ skipped

Related Commands:
  $ eket dag:run <file>                           # Execute a DAG
  $ eket dag:status <runId>                       # Check run status
  $ eket dag:validate <file>                      # Validate DAG structure
`
    )
    .action(async (file: string, options: { format?: string; runId?: string; critical?: boolean }) => {
      const spinner = ora('Loading DAG...').start();

      try {
        if (!existsSync(file)) {
          throw new Error(`DAG file not found: ${file}`);
        }

        const visualizer = createDAGVisualizer();
        const dag = await visualizer.loadFromFile(file);

        // Load run state if specified
        let runState: Awaited<ReturnType<InstanceType<typeof import('../core/dag-executor.js').DAGExecutor>['getStatus']>> | null = null;
        if (options.runId) {
          const executor = createDAGExecutor();
          try {
            runState = await executor.getStatus(options.runId);
            if (!runState) {
              spinner.warn(`Run ${options.runId} not found, showing pending status`);
            }
          } finally {
            executor.disconnect();
          }
        }

        spinner.succeed('DAG loaded');

        // Generate visualization
        const result = visualizer.visualize(dag, runState ?? undefined);

        // Output based on format
        const format = options.format?.toLowerCase() ?? 'ascii';

        if (format === 'mermaid') {
          console.log('');
          console.log(result.mermaid);
        } else if (format === 'ascii') {
          console.log('');
          console.log(result.ascii);
        } else {
          throw new Error(`Unknown format: ${format}. Use 'ascii' or 'mermaid'.`);
        }

        // Show critical path if enabled
        if (options.critical !== false && result.criticalPath.length > 0) {
          console.log('');
          console.log(`Critical Path: ${result.criticalPath.join(' -> ')}`);
        }

        logger.info('dag_view_generated', {
          file,
          format,
          runId: options.runId,
          totalNodes: result.summary.total,
          criticalPathLength: result.criticalPath.length,
        });
      } catch (err) {
        spinner.fail('Failed to visualize DAG');
        printError({
          code: 'DAG_VIEW_FAILED',
          message: (err as Error).message,
          causes: [
            'Invalid DAG YAML structure',
            'Run ID not found',
            'Invalid format option',
          ],
          solutions: [
            'Run eket dag:validate <file> to check DAG structure',
            'Check run ID with eket dag:status <runId>',
            'Use --format=ascii or --format=mermaid',
          ],
        });
        process.exit(1);
      }
    });
}
