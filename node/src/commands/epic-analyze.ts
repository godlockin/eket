/**
 * EPIC Analyze Command (TASK-640)
 *
 * CLI commands for EPIC complexity analysis and DAG generation:
 *   - epic:analyze   - Analyze EPIC complexity and suggest DAG mode
 *   - dag:generate   - Auto-generate dag.yml from EPIC tickets
 *
 * Complexity Rules:
 * | Metric           | Threshold | Weight |
 * |------------------|-----------|--------|
 * | Sub-task count   | >= 5      | 2      |
 * | Dependency depth | >= 3      | 3      |
 * | Max blocked_by   | >= 2      | 1      |
 * | Cross-module     | >= 3      | 1      |
 *
 * Complexity Score = Sum(exceeds_threshold × weight)
 * Suggest DAG if score >= 4
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';
import ora from 'ora';

import {
  findEpicTickets,
  analyzeComplexity,
  generateDAGConfig,
  dagConfigToYaml,
  formatComplexityReport,
} from '../core/epic-utils.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// CLI Commands
// ============================================================================

/**
 * Register EPIC analyze commands with Commander program
 */
export function registerEpicAnalyze(program: Command): void {
  // epic:analyze - Analyze EPIC complexity
  program
    .command('epic:analyze <epicId>')
    .description('Analyze EPIC complexity and suggest DAG mode if warranted')
    .option('-p, --project-root <path>', 'Project root directory', process.cwd())
    .option('--json', 'Output as JSON')
    .addHelpText(
      'after',
      `
Examples:
  $ eket epic:analyze EPIC-017                 # Analyze EPIC-017 complexity
  $ eket epic:analyze EPIC-007 --json          # Output as JSON

Complexity Rules:
  Sub-tasks >= 5      -> +2 points
  Dependency depth >= 3 -> +3 points
  Max blocked_by >= 2 -> +1 point
  Cross-module >= 3   -> +1 point

  Total >= 4 points   -> Suggest DAG mode

Related Commands:
  $ eket dag:generate EPIC-017                 # Generate dag.yml
  $ eket dag:run dag.yml                       # Execute DAG
`
    )
    .action(async (epicId: string, options: { projectRoot: string; json?: boolean }) => {
      const spinner = ora(`Analyzing ${epicId} complexity...`).start();

      try {
        const ticketsDir = path.join(options.projectRoot, 'jira', 'tickets');

        if (!fs.existsSync(ticketsDir)) {
          throw new Error(`Tickets directory not found: ${ticketsDir}`);
        }

        // Find and parse tickets
        const tasks = await findEpicTickets(epicId, options.projectRoot);
        if (tasks.length === 0) {
          throw new Error(`No tickets found for ${epicId}`);
        }

        // Analyze complexity
        const result = analyzeComplexity(tasks, epicId);

        spinner.succeed(`Analyzed ${tasks.length} tasks for ${epicId}`);

        // Output
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatComplexityReport(result));
        }

        logger.info('epic_analyze_complete', {
          epicId,
          taskCount: tasks.length,
          totalScore: result.totalScore,
          suggestDAG: result.suggestDAG,
        });

        // Exit with code 2 if DAG suggested (for scripting)
        if (result.suggestDAG) {
          process.exitCode = 2;
        }
      } catch (err) {
        spinner.fail(`Analysis failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // dag:generate - Generate DAG from EPIC
  program
    .command('dag:generate <epicId>')
    .description('Auto-generate dag.yml from EPIC tickets')
    .option('-p, --project-root <path>', 'Project root directory', process.cwd())
    .option('-o, --output <file>', 'Output file path', 'dag.yml')
    .option('--dry-run', 'Preview DAG without writing file')
    .addHelpText(
      'after',
      `
Examples:
  $ eket dag:generate EPIC-017                 # Generate dag.yml
  $ eket dag:generate EPIC-007 -o epic007.yml  # Custom output file
  $ eket dag:generate EPIC-017 --dry-run       # Preview without writing

Generated DAG includes:
  - Topologically sorted nodes based on dependencies
  - Parallel execution settings (max_parallel: 3)
  - Retry on failure enabled
  - Timeout based on priority (P0=2h, P1=4h)

Related Commands:
  $ eket epic:analyze EPIC-017                 # Analyze complexity first
  $ eket dag:run dag.yml                       # Execute the generated DAG
  $ eket dag:validate dag.yml                  # Validate DAG structure
`
    )
    .action(async (epicId: string, options: { projectRoot: string; output: string; dryRun?: boolean }) => {
      const spinner = ora(`Generating DAG for ${epicId}...`).start();

      try {
        const ticketsDir = path.join(options.projectRoot, 'jira', 'tickets');

        if (!fs.existsSync(ticketsDir)) {
          throw new Error(`Tickets directory not found: ${ticketsDir}`);
        }

        // Find and parse tickets
        const tasks = await findEpicTickets(epicId, options.projectRoot);
        if (tasks.length === 0) {
          throw new Error(`No tickets found for ${epicId}`);
        }

        // Generate DAG
        const dagConfig = generateDAGConfig(epicId, tasks);
        const yaml = dagConfigToYaml(dagConfig);

        spinner.succeed(`Generated DAG with ${dagConfig.nodes.length} nodes`);

        if (options.dryRun) {
          console.log('\n--- DAG Preview ---');
          console.log(yaml);
          console.log('--- End Preview ---\n');
        } else {
          const outputPath = path.isAbsolute(options.output)
            ? options.output
            : path.join(options.projectRoot, options.output);

          fs.writeFileSync(outputPath, yaml, 'utf-8');
          console.log(`\n+ Written to: ${outputPath}`);
          console.log(`\nNext steps:`);
          console.log(`  1. Review: cat ${options.output}`);
          console.log(`  2. Validate: eket dag:validate ${options.output}`);
          console.log(`  3. Execute: eket dag:run ${options.output}`);
        }

        logger.info('dag_generate_complete', {
          epicId,
          nodeCount: dagConfig.nodes.length,
          outputPath: options.dryRun ? 'dry-run' : options.output,
        });
      } catch (err) {
        spinner.fail(`DAG generation failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
