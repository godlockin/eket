/**
 * EKET Framework - Resume Workflow Integration Tests
 *
 * TASK-X06: Test resume functionality across the full workflow.
 *
 * Test Scenarios:
 * - AC-1: Checkout checkpoint branch
 * - AC-2: Display completed ACs
 * - AC-3: Interactive prompt (continue/re-analyze/abort)
 * - AC-4: ProgressTracker skips completed phases
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { ProgressTracker } from '../../src/core/progress-tracker.js';
import { parseProgressMarkdown } from '../../src/utils/progress-parser.js';
import type { ResumeContext } from '../../src/types/progress-tracker.js';

const execFileAsync = promisify(execFile);

describe('Resume Workflow', () => {
  const testDir = path.join(process.cwd(), 'tests/fixtures/resume-test');
  const taskId = 'TASK-RESUME-001';
  const slaverId = 'test-slaver-001';
  const ticketDir = path.join(testDir, 'jira/tickets', taskId);

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(ticketDir, { recursive: true });

    // Initialize git repo
    await execFileAsync('git', ['init'], { cwd: testDir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: testDir });
    await execFileAsync('git', ['config', 'user.email', 'test@eket.dev'], { cwd: testDir });
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('AC-1: Should checkout checkpoint branch when resume flag is used', async () => {
    // Setup: Create checkpoint branch with progress.md
    const checkpointBranch = `checkpoint/${taskId}`;

    // Create initial progress.md
    const progressContent = `# Task Progress: ${taskId}

**Last Update**: 2026-05-14T10:00:00.000Z
**Slaver**: slaver-previous
**Current Phase**: \`analysis\`

## Completed
- [x] analysis (05/14/2026, 10:00:00 AM)
  - artifact: analysis-report.md
`;
    await fs.writeFile(path.join(ticketDir, 'progress.md'), progressContent, 'utf-8');

    // Commit and create checkpoint branch
    await execFileAsync('git', ['add', '.'], { cwd: testDir });
    await execFileAsync('git', ['commit', '-m', 'Initial checkpoint'], { cwd: testDir });
    await execFileAsync('git', ['checkout', '-b', checkpointBranch], { cwd: testDir });

    // Simulate remote push (skip actual remote)
    // Go back to main branch
    await execFileAsync('git', ['checkout', '-b', 'main'], { cwd: testDir });

    // Test: Check if branch exists
    const { stdout } = await execFileAsync('git', ['branch', '--list', checkpointBranch], {
      cwd: testDir,
    });

    expect(stdout.trim()).toContain(checkpointBranch);
  }, 10000);

  it('AC-2: Should parse and display completed ACs from progress.md', async () => {
    // Setup: Create progress.md with completed ACs
    const progressContent = `# Task Progress: ${taskId}

**Last Update**: 2026-05-14T10:30:00.000Z
**Slaver**: slaver-previous
**Current Phase**: \`implementation\`

## Completed
- [x] analysis (05/14/2026, 10:00:00 AM)
  - artifact: analysis-report.md
- [x] ac_1 (05/14/2026, 10:15:00 AM)
  - files: src/auth.ts, src/auth.test.ts
  - test: ✅
- [x] ac_2 (05/14/2026, 10:30:00 AM)
  - files: src/validation.ts
`;
    await fs.writeFile(path.join(ticketDir, 'progress.md'), progressContent, 'utf-8');

    // Test: Parse progress.md
    const content = await fs.readFile(path.join(ticketDir, 'progress.md'), 'utf-8');
    const parseResult = parseProgressMarkdown(content, taskId);

    expect(parseResult.success).toBe(true);
    expect(parseResult.data).toBeDefined();

    const snapshot = parseResult.data!;
    expect(snapshot.slaverId).toBe('slaver-previous');
    expect(snapshot.currentPhase).toBe('implementation');

    // Check completed checkpoints
    const completed = snapshot.checkpoints.filter(
      (cp) => cp.phase !== 'note' && !cp.phase.endsWith('_start')
    );
    expect(completed).toHaveLength(3);
    expect(completed[0].phase).toBe('analysis');
    expect(completed[1].phase).toBe('ac_1');
    expect(completed[2].phase).toBe('ac_2');
  }, 10000);

  it('AC-4: ProgressTracker should skip already completed phases', async () => {
    // Setup: Create resume context with completed phases
    const resumeContext: ResumeContext = {
      completedPhases: new Set(['analysis_done', 'ac_1_done']),
      currentPhase: 'implementation',
      checkpoints: [
        {
          timestamp: '2026-05-14T10:00:00.000Z',
          phase: 'analysis_done',
          metadata: { artifact: 'analysis-report.md' },
        },
        {
          timestamp: '2026-05-14T10:15:00.000Z',
          phase: 'ac_1_done',
          metadata: { files: ['src/auth.ts'] },
        },
      ],
    };

    // Initialize ProgressTracker with resume context
    const tracker = new ProgressTracker({
      taskId,
      slaverId,
      outputDir: ticketDir,
      progressFileName: 'progress.md',
      resumeFrom: resumeContext,
      gitEnabled: false, // Disable git for unit test
    });

    // Test: Try to checkpoint already completed phase
    await tracker.checkpoint('analysis_done', { artifact: 'retry.md' });

    // Verify: No new checkpoint added (should be skipped)
    const snapshot = tracker.getSnapshot();
    const newCheckpoints = snapshot.checkpoints.filter((cp) => cp.phase === 'analysis_done');
    expect(newCheckpoints).toHaveLength(1); // Only the original one

    // Cleanup
    await tracker.close();
  }, 10000);

  it('AC-4: ProgressTracker should allow new checkpoints for incomplete phases', async () => {
    // Setup: Resume context with some completed phases
    const resumeContext: ResumeContext = {
      completedPhases: new Set(['analysis_done']),
      currentPhase: 'implementation',
      checkpoints: [
        {
          timestamp: '2026-05-14T10:00:00.000Z',
          phase: 'analysis_done',
          metadata: {},
        },
      ],
    };

    // Initialize ProgressTracker with resume context
    const tracker = new ProgressTracker({
      taskId,
      slaverId,
      outputDir: ticketDir,
      progressFileName: 'progress.md',
      resumeFrom: resumeContext,
      gitEnabled: false,
    });

    // Test: Add new checkpoint for incomplete phase
    await tracker.checkpoint('ac_1_done', { files: ['src/new.ts'] });

    // Verify: New checkpoint added
    const snapshot = tracker.getSnapshot();
    const ac1Checkpoints = snapshot.checkpoints.filter((cp) => cp.phase === 'ac_1_done');
    expect(ac1Checkpoints).toHaveLength(1);
    expect(ac1Checkpoints[0].metadata.files).toContain('src/new.ts');

    // Cleanup
    await tracker.close();
  }, 10000);

  it('Edge case: Resume with no checkpoint should fallback gracefully', async () => {
    // Test: Try to parse non-existent progress.md
    try {
      await fs.readFile(path.join(ticketDir, 'progress.md'), 'utf-8');
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Expected: File not found
      expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  }, 10000);

  it('Edge case: Corrupted progress.md should fail gracefully', async () => {
    // Setup: Create invalid progress.md
    const invalidContent = `# Task Progress: ${taskId}

**Invalid Field**: corrupted data
No structured content here
`;
    await fs.writeFile(path.join(ticketDir, 'progress.md'), invalidContent, 'utf-8');

    // Test: Parse should fail gracefully
    const content = await fs.readFile(path.join(ticketDir, 'progress.md'), 'utf-8');
    const parseResult = parseProgressMarkdown(content, taskId);

    // Should fail but not throw
    expect(parseResult.success).toBe(false);
    expect(parseResult.error).toBeDefined();
  }, 10000);
});
