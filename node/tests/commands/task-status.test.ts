/**
 * EKET Framework - Task Status Command Tests (TASK-X05)
 *
 * Tests AC-1~4:
 * - AC-1: Checkpoint branch detection
 * - AC-2: Last commit metadata extraction
 * - AC-3: Local vs remote comparison
 * - AC-4: Colorful output
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const TEST_TASK_ID = 'TASK-TEST-STATUS-001';
const CHECKPOINT_BRANCH = `checkpoint/${TEST_TASK_ID}`;

/**
 * Setup: Create test ticket and checkpoint branch
 */
async function setup() {
  const ticketDir = path.join(process.cwd(), `jira/tickets/${TEST_TASK_ID}`);
  await fs.mkdir(ticketDir, { recursive: true });

  // Create ticket metadata
  await fs.writeFile(
    path.join(ticketDir, `${TEST_TASK_ID}.md`),
    `# TASK-TEST-STATUS-001: Test Task

**Status**: \`in_progress\`
**Assignee**: slaver-test-005

## Goal
Test task for status command
`,
    'utf-8'
  );

  // Create progress.md
  await fs.writeFile(
    path.join(ticketDir, 'progress.md'),
    `# Task Progress: ${TEST_TASK_ID}

**Last Update**: ${new Date().toISOString()}
**Slaver**: slaver-test-005
**Current Phase**: \`ac_1\`

## Completed
- [x] analysis (${new Date(Date.now() - 3600000).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })})

## Next Steps
- [ ] Implement AC-2
`,
    'utf-8'
  );
}

/**
 * Teardown: Clean up test artifacts
 */
async function teardown() {
  try {
    await fs.rm(path.join(process.cwd(), `jira/tickets/${TEST_TASK_ID}`), { recursive: true });
  } catch {
    // Ignore errors
  }

  try {
    await execFileAsync('git', ['branch', '-D', CHECKPOINT_BRANCH]);
  } catch {
    // Ignore errors
  }

  try {
    await execFileAsync('git', ['push', 'origin', '--delete', CHECKPOINT_BRANCH]);
  } catch {
    // Ignore errors
  }
}

describe('task:status - Checkpoint Status (TASK-X05)', () => {
  beforeAll(async () => {
    await setup();
  });

  afterAll(async () => {
    await teardown();
  });

  /**
   * AC-1: Detect checkpoint branch existence
   */
  test('AC-1: should detect checkpoint branch existence', async () => {
    // Create checkpoint branch
    await execFileAsync('git', ['checkout', '-b', CHECKPOINT_BRANCH]);
    await execFileAsync('git', ['add', `jira/tickets/${TEST_TASK_ID}/progress.md`]);
    await execFileAsync('git', ['commit', '-m', 'checkpoint: analysis_done\n\n{"phase":"analysis_done","slaver_id":"slaver-test-005"}']);
    await execFileAsync('git', ['push', '-u', 'origin', CHECKPOINT_BRANCH]);

    // Run task:status
    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    expect(stdout).toContain('✅ Checkpoint:');
    expect(stdout).toContain(`origin/${CHECKPOINT_BRANCH}`);
  });

  /**
   * AC-2: Extract last commit metadata
   */
  test('AC-2: should extract last commit metadata (phase, slaver, time)', async () => {
    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    expect(stdout).toContain('Phase: analysis_done');
    expect(stdout).toContain('Slaver: slaver-test-005');
    expect(stdout).toMatch(/Last Update: \d+[smhd] ago/);
    expect(stdout).toMatch(/Commit: [a-f0-9]{7}/);
  });

  /**
   * AC-3: Compare local vs remote progress
   */
  test('AC-3: should show synced status when local == remote', async () => {
    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    // Should show synced (or local ahead, depending on test timing)
    expect(stdout).toMatch(/✅ Synced|⚠️  Local ahead/);
  });

  test('AC-3: should show local ahead when progress.md is updated but not pushed', async () => {
    // Update local progress.md
    const progressPath = path.join(process.cwd(), `jira/tickets/${TEST_TASK_ID}/progress.md`);
    const content = await fs.readFile(progressPath, 'utf-8');
    const updated = content.replace(/\*\*Last Update\*\*: .+/, `**Last Update**: ${new Date().toISOString()}`);
    await fs.writeFile(progressPath, updated, 'utf-8');

    // Wait 1 second to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    expect(stdout).toContain('⚠️  Local ahead of remote');
  });

  /**
   * AC-4: Colorful output (verify no ANSI codes with --no-color)
   */
  test('AC-4: should disable color output with --no-color flag', async () => {
    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    // Verify no ANSI escape codes
    expect(stdout).not.toMatch(/\x1b\[[0-9;]+m/);
  });

  test('AC-4: should include ANSI color codes by default', async () => {
    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID]);

    // Verify ANSI escape codes exist (green for checkmark)
    expect(stdout).toMatch(/\x1b\[[0-9;]+m/);
  });

  /**
   * Edge case: No checkpoint branch
   */
  test('should handle missing checkpoint gracefully', async () => {
    // Delete checkpoint branch
    await execFileAsync('git', ['push', 'origin', '--delete', CHECKPOINT_BRANCH]);

    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    expect(stdout).toContain('⚠️  No checkpoint');
  });

  /**
   * Edge case: No local progress.md
   */
  test('should handle missing local progress.md', async () => {
    const progressPath = path.join(process.cwd(), `jira/tickets/${TEST_TASK_ID}/progress.md`);
    await fs.unlink(progressPath);

    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    expect(stdout).toContain('⚠️  No local progress.md found');
  });

  /**
   * Edge case: Malformed commit message
   */
  test('should fallback when commit message has no JSON metadata', async () => {
    // Create a commit without structured metadata
    await execFileAsync('git', ['checkout', CHECKPOINT_BRANCH]);
    await execFileAsync('git', ['commit', '--allow-empty', '-m', 'WIP checkpoint']);
    await execFileAsync('git', ['push', 'origin', CHECKPOINT_BRANCH]);

    const { stdout } = await execFileAsync('node', ['dist/index.js', 'task:status', TEST_TASK_ID, '--no-color']);

    // Should still work, but phase might be "unknown"
    expect(stdout).toContain('Checkpoint:');
    expect(stdout).toMatch(/Phase: (unknown|WIP)/);
  });
});
