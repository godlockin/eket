/**
 * logs.ts
 *
 * Commands for querying error recovery logs.
 * Implements logs:context-overflow to display context overflow error statistics.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { Command } from 'commander';

import { printError } from '../utils/error-handler.js';

/**
 * Parsed log entry structure
 */
interface LogEntry {
  timestamp: string;
  sessionId: string;
  taskId: string;
  errorType: string;
  recovery: string;
  result: string;
}

/**
 * Registers the logs:context-overflow command
 *
 * @param program - Commander program instance
 */
export function registerLogsCommand(program: Command): void {
  program
    .command('logs:context-overflow')
    .description('Display context overflow error statistics')
    .option('-p, --project-root <path>', 'Project root directory', process.cwd())
    .option('-n, --limit <number>', 'Number of recent entries to show', '10')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli logs:context-overflow                    # Show last 10 context overflow errors
  $ eket-cli logs:context-overflow -n 20              # Show last 20 errors
  $ eket-cli logs:context-overflow -p /path/to/repo   # Query specific project

Output:
  - Total errors logged
  - Recovery success rate
  - Last 10 error entries with details
`
    )
    .action(async (options) => {
      const projectRoot = options.projectRoot;
      const limit = parseInt(options.limit, 10);

      const logPath = path.join(projectRoot, '.eket/logs/context-overflow.log');

      try {
        const fileExists = await fs
          .access(logPath)
          .then(() => true)
          .catch(() => false);

        if (!fileExists) {
          console.log('\n📊 Context Overflow Log Statistics\n');
          console.log('No context overflow errors logged yet.');
          console.log('\nExample log format:');
          console.log(
            '[2026-05-10T10:00:00.000Z] sessionId=abc123, taskId=TASK-601, error_type=context_length_exceeded, recovery=compact_retry, result=recovered\n'
          );
          return;
        }

        const content = await fs.readFile(logPath, 'utf-8');
        const lines = content
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        if (lines.length === 0) {
          console.log('\n📊 Context Overflow Log Statistics\n');
          console.log('No context overflow errors logged yet.\n');
          return;
        }

        const entries = parseLogEntries(lines);

        // Statistics
        const totalErrors = entries.length;
        const recoveredCount = entries.filter((e) => e.result === 'recovered').length;
        const successRate = totalErrors > 0 ? (recoveredCount / totalErrors) * 100 : 0;

        console.log('\n📊 Context Overflow Log Statistics\n');
        console.log(`Total Errors:        ${totalErrors}`);
        console.log(`Recovered:           ${recoveredCount}`);
        console.log(`Success Rate:        ${successRate.toFixed(1)}%`);
        console.log('');

        // Recent entries
        const recentEntries = entries.slice(-limit).reverse();
        console.log(`Recent ${Math.min(limit, recentEntries.length)} Entries:\n`);

        recentEntries.forEach((entry, index) => {
          console.log(`${index + 1}. [${entry.timestamp}]`);
          console.log(`   Session:  ${entry.sessionId}`);
          console.log(`   Task:     ${entry.taskId}`);
          console.log(`   Error:    ${entry.errorType}`);
          console.log(`   Recovery: ${entry.recovery}`);
          console.log(`   Result:   ${entry.result}`);
          console.log('');
        });
      } catch (error) {
        printError({
          code: 'LOGS_READ_FAILED',
          message: error instanceof Error ? error.message : 'Failed to read logs',
          solutions: [
            'Verify project root path is correct',
            'Check if .eket/logs directory exists',
            'Ensure log file permissions are readable',
          ],
        });
        process.exit(1);
      }
    });
}

/**
 * Parses log file lines into structured entries
 *
 * @param lines - Raw log file lines
 * @returns Array of parsed log entries
 */
function parseLogEntries(lines: string[]): LogEntry[] {
  return lines
    .map((line) => {
      // Format: [ISO8601] sessionId=xxx, taskId=xxx, error_type=xxx, recovery=xxx, result=xxx
      const timestampMatch = line.match(/^\[(.+?)\]/);
      const sessionMatch = line.match(/sessionId=([^,]+)/);
      const taskMatch = line.match(/taskId=([^,]+)/);
      const errorMatch = line.match(/error_type=([^,]+)/);
      const recoveryMatch = line.match(/recovery=([^,]+)/);
      const resultMatch = line.match(/result=(.+)$/);

      if (!timestampMatch || !sessionMatch || !taskMatch || !errorMatch || !recoveryMatch || !resultMatch) {
        return null;
      }

      return {
        timestamp: timestampMatch[1].trim(),
        sessionId: sessionMatch[1].trim(),
        taskId: taskMatch[1].trim(),
        errorType: errorMatch[1].trim(),
        recovery: recoveryMatch[1].trim(),
        result: resultMatch[1].trim(),
      };
    })
    .filter((entry): entry is LogEntry => entry !== null);
}
