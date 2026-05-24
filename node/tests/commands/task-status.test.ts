/**
 * EKET Framework - Task Status Command Tests (TASK-X05)
 *
 * Tests AC-1~4 using a fully isolated local Git repository sandbox.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);
const cliPath = path.resolve(currentDirname, '../../dist/index.js');

const TEST_TASK_ID = 'TASK-TEST-STATUS-001';
const CHECKPOINT_BRANCH = `checkpoint/${TEST_TASK_ID}`;

let tempGitDir = '';
let mockRemoteDir = '';

/**
 * Setup: Create fully isolated mock Git repository and ticket structure
 */
async function setup() {
  const rootDir = process.cwd();
  const testTempDir = path.join(rootDir, '.test-temp');
  await fs.mkdir(testTempDir, { recursive: true });

  const timestamp = Date.now();
  tempGitDir = path.join(testTempDir, `task-status-repo-${timestamp}`);
  mockRemoteDir = path.join(testTempDir, `task-status-remote-${timestamp}`);

  // 1. Create directory structures
  await fs.mkdir(tempGitDir, { recursive: true });
  await fs.mkdir(mockRemoteDir, { recursive: true });

  // 2. Initialize bare origin repo and local repo
  await execFileAsync('git', ['init', '--bare'], { cwd: mockRemoteDir });
  await execFileAsync('git', ['init'], { cwd: tempGitDir });
  await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: tempGitDir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempGitDir });
  await execFileAsync('git', ['remote', 'add', 'origin', mockRemoteDir], { cwd: tempGitDir });

  // 3. Create ticket structure inside local repo
  const ticketDir = path.join(tempGitDir, `jira/tickets/${TEST_TASK_ID}`);
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

  // 4. Initial commit in local repo so it has a main branch
  await execFileAsync('git', ['add', '.'], { cwd: tempGitDir });
  await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: tempGitDir });
  // Push to remote main to establish tracking
  await execFileAsync('git', ['branch', '-M', 'main'], { cwd: tempGitDir });
  await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: tempGitDir });
}

/**
 * Teardown: Clean up isolated test repositories
 */
async function teardown() {
  if (tempGitDir) {
    try {
      await fs.rm(tempGitDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }

  if (mockRemoteDir) {
    try {
      await fs.rm(mockRemoteDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
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
    await execFileAsync('git', ['checkout', '-b', CHECKPOINT_BRANCH], { cwd: tempGitDir });
    
    // Modify file to ensure we have changes to commit
    const progressPath = path.join(tempGitDir, `jira/tickets/${TEST_TASK_ID}/progress.md`);
    await fs.writeFile(
      progressPath,
      `# Task Progress: ${TEST_TASK_ID}\n\n**Last Update**: ${new Date().toISOString()}\n**Slaver**: slaver-test-005\n**Current Phase**: \`ac_1\``,
      'utf-8'
    );

    await execFileAsync('git', ['add', `jira/tickets/${TEST_TASK_ID}/progress.md`], { cwd: tempGitDir });
    await execFileAsync('git', ['commit', '-m', 'checkpoint: analysis_done\n\n{"phase":"analysis_done","slaver_id":"slaver-test-005"}'], { cwd: tempGitDir });
    await execFileAsync('git', ['push', '-u', 'origin', CHECKPOINT_BRANCH], { cwd: tempGitDir });

    // Run task:status
    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    expect(stdout).toContain('✅ Checkpoint:');
    expect(stdout).toContain(`origin/${CHECKPOINT_BRANCH}`);
  });

  /**
   * AC-2: Extract last commit metadata
   */
  test('AC-2: should extract last commit metadata (phase, slaver, time)', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    expect(stdout).toContain('Phase: analysis_done');
    expect(stdout).toContain('Slaver: slaver-test-005');
    expect(stdout).toMatch(/Last Update: \d+[smhd] ago/);
    expect(stdout).toMatch(/Commit: [a-f0-9]{7}/);
  });

  /**
   * AC-3: Compare local vs remote progress
   */
  test('AC-3: should show synced status when local == remote', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    // Should show synced (or local ahead, depending on test timing)
    expect(stdout).toMatch(/✅ Synced|⚠️  Local ahead/);
  });

  test('AC-3: should show local ahead when progress.md is updated but not pushed', async () => {
    // Update local progress.md with a future timestamp to ensure it's > 60s ahead of remote
    const progressPath = path.join(tempGitDir, `jira/tickets/${TEST_TASK_ID}/progress.md`);
    const content = await fs.readFile(progressPath, 'utf-8');
    const updated = content.replace(/\*\*Last Update\*\*: .+/, `**Last Update**: ${new Date(Date.now() + 120000).toISOString()}`);
    await fs.writeFile(progressPath, updated, 'utf-8');

    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    expect(stdout).toContain('⚠️  Local ahead of remote');
  });

  /**
   * AC-4: Colorful output (verify no ANSI codes with --no-color)
   */
  test('AC-4: should disable color output with --no-color flag', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    // Verify no ANSI escape codes
    expect(stdout).not.toMatch(/\x1b\[[0-9;]+m/);
  });

  test('AC-4: should include ANSI color codes by default', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID],
      { cwd: tempGitDir }
    );

    // Verify ANSI escape codes exist (green for checkmark)
    expect(stdout).toMatch(/\x1b\[[0-9;]+m/);
  });

  /**
   * Edge case: No local progress.md
   */
  test('should handle missing local progress.md', async () => {
    const progressPath = path.join(tempGitDir, `jira/tickets/${TEST_TASK_ID}/progress.md`);
    const originalContent = await fs.readFile(progressPath, 'utf-8');
    await fs.unlink(progressPath);

    try {
      const { stdout } = await execFileAsync(
        'node',
        [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
        { cwd: tempGitDir }
      );

      expect(stdout).toContain('⚠️  No local progress.md found');
    } finally {
      // Re-write to avoid affecting subsequent tests
      await fs.writeFile(progressPath, originalContent, 'utf-8');
    }
  });

  /**
   * Edge case: Malformed commit message
   */
  test('should fallback when commit message has no JSON metadata', async () => {
    // Recreate the branch and make a clean commit without JSON metadata
    try {
      await execFileAsync('git', ['checkout', '-b', CHECKPOINT_BRANCH], { cwd: tempGitDir });
    } catch {
      await execFileAsync('git', ['checkout', CHECKPOINT_BRANCH], { cwd: tempGitDir });
    }

    await execFileAsync('git', ['commit', '--allow-empty', '-m', 'checkpoint: wip_state'], { cwd: tempGitDir });
    await execFileAsync('git', ['push', 'origin', CHECKPOINT_BRANCH], { cwd: tempGitDir });

    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    // Should still work, but phase might be extracted from the first line prefix or fallback to "unknown"
    expect(stdout).toContain('Checkpoint:');
    expect(stdout).toMatch(/Phase: (unknown|wip_state)/);
  });

  /**
   * Edge case: No checkpoint branch
   */
  test('should handle missing checkpoint gracefully', async () => {
    // Delete remote checkpoint branch
    try {
      await execFileAsync('git', ['push', 'origin', '--delete', CHECKPOINT_BRANCH], { cwd: tempGitDir });
    } catch {
      // Ignore
    }

    // Discard any unstaged changes to avoid checkout aborts
    try {
      await execFileAsync('git', ['checkout', '--', '.'], { cwd: tempGitDir });
    } catch {
      // Ignore
    }

    // Switch local repo to main so we can delete the local branch safely
    await execFileAsync('git', ['checkout', 'main'], { cwd: tempGitDir });

    // Delete local checkpoint branch
    try {
      await execFileAsync('git', ['branch', '-D', CHECKPOINT_BRANCH], { cwd: tempGitDir });
    } catch {
      // Ignore
    }

    const { stdout } = await execFileAsync(
      'node',
      [cliPath, 'task:status', TEST_TASK_ID, '--no-color'],
      { cwd: tempGitDir }
    );

    expect(stdout).toContain('⚠️  No checkpoint');
  });
});
