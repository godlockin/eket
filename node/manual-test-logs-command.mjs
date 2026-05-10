#!/usr/bin/env node
/**
 * manual-test-logs-command.mjs
 *
 * Manual verification of logs:context-overflow command
 */

import { registerLogsCommand } from './dist/commands/logs.js';
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';

const TEST_DIR = '/tmp/test-eket-manual';

async function setup() {
  console.log('🔧 Setting up test environment...\n');

  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Create log file with sample data
  const logPath = path.join(TEST_DIR, '.eket/logs/context-overflow.log');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const logContent = `[2026-05-10T10:00:00.000Z] sessionId=abc123, taskId=TASK-601, error_type=context_length_exceeded, recovery=compact_retry, result=recovered
[2026-05-10T11:00:00.000Z] sessionId=def456, taskId=TASK-602, error_type=context_length_exceeded, recovery=nuclear_restart, result=recovered
[2026-05-10T12:00:00.000Z] sessionId=ghi789, taskId=TASK-603, error_type=context_length_exceeded, recovery=compact_retry, result=failed
[2026-05-10T13:00:00.000Z] sessionId=jkl012, taskId=TASK-604, error_type=context_length_exceeded, recovery=compact_retry, result=recovered
[2026-05-10T14:00:00.000Z] sessionId=mno345, taskId=TASK-605, error_type=context_length_exceeded, recovery=compact_retry, result=failed
`;

  await fs.writeFile(logPath, logContent);
  console.log(`✅ Created test log: ${logPath}\n`);
}

async function runTest() {
  console.log('🧪 Running logs:context-overflow command...\n');
  console.log('=' .repeat(60));

  const program = new Command();
  registerLogsCommand(program);

  // Simulate command execution
  await program.parseAsync(['node', 'test', 'logs:context-overflow', '-p', TEST_DIR, '-n', '3']);

  console.log('='.repeat(60));
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  console.log('✅ Test complete!\n');
}

async function main() {
  try {
    await setup();
    await runTest();
    await cleanup();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
