/**
 * TASK-X01: ProgressTracker unit tests
 * Covers: checkpoint recording, async flush, sync flush, atomic write, markdown format
 */

import fs from 'fs/promises';
import path from 'path';
import { ProgressTracker } from '../../src/core/progress-tracker.js';
import { TaskPhase } from '../../src/types/progress-tracker.js';

// Test output directory (isolated per test)
const TEST_OUTPUT_DIR = path.resolve(process.cwd(), '.test-output');

/**
 * Helper: Create test output directory
 */
async function setupTestDir(taskId: string): Promise<string> {
  const dir = path.join(TEST_OUTPUT_DIR, taskId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Helper: Clean test output directory
 */
async function cleanTestDir(): Promise<void> {
  try {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Helper: Read progress.md content
 */
async function readProgress(taskId: string): Promise<string> {
  const filePath = path.join(TEST_OUTPUT_DIR, taskId, 'progress.md');
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Helper: Wait for async operation
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ProgressTracker', () => {
  beforeAll(async () => {
    await cleanTestDir();
  });

  afterEach(async () => {
    await cleanTestDir();
  });

  describe('AC-1: Basic checkpoint recording', () => {
    it('should record checkpoint and flush to file', async () => {
      const taskId = 'TASK-TEST-001';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000, // Long interval, manual flush
      });

      await tracker.checkpoint('analysis_done', { artifact: 'analysis-report.md' });
      await tracker.flush();

      const content = await readProgress(taskId);

      expect(content).toContain('# Task Progress: TASK-TEST-001');
      expect(content).toContain('**Slaver**: slaver-test');
      expect(content).toContain('- [x] analysis'); // Phase name without _done
      expect(content).toContain('artifact: analysis-report.md');

      await tracker.close();
    });

    it('should track completed phases', async () => {
      const taskId = 'TASK-TEST-002';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      await tracker.completePhase(TaskPhase.ANALYSIS, { artifact: 'analysis.md' });
      await tracker.flush();

      const content = await readProgress(taskId);
      expect(content).toContain('analysis');

      await tracker.close();
    });
  });

  describe('AC-2: Async flush mechanism', () => {
    it('should auto-flush after interval', async () => {
      const taskId = 'TASK-TEST-003';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 100, // 100ms for test speed
      });

      // Checkpoint without manual flush
      await tracker.checkpoint('impl_progress', { files: ['x.ts'] });

      // Wait for auto-flush
      await wait(150);

      const content = await readProgress(taskId);
      expect(content).toContain('impl_progress');

      await tracker.close();
    });

    it('should accumulate multiple checkpoints in buffer', async () => {
      const taskId = 'TASK-TEST-004';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000, // Long interval
      });

      // Add multiple checkpoints
      await tracker.checkpoint('impl_ac1', { files: ['a.ts'] });
      await tracker.checkpoint('impl_ac2', { files: ['b.ts'] });
      await tracker.checkpoint('impl_ac3', { files: ['c.ts'] });

      // Manual flush
      await tracker.flush();

      const content = await readProgress(taskId);
      expect(content).toContain('impl_ac1');
      expect(content).toContain('impl_ac2');
      expect(content).toContain('impl_ac3');

      await tracker.close();
    });
  });

  describe('AC-3: Critical checkpoint sync flush', () => {
    it('should immediately flush on analysis_done', async () => {
      const taskId = 'TASK-TEST-005';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000, // Long interval
      });

      await tracker.checkpoint(TaskPhase.ANALYSIS, { artifact: 'analysis.md' });

      // Check file immediately (no wait)
      const content = await readProgress(taskId);
      expect(content).toContain('analysis');

      await tracker.close();
    });

    it('should immediately flush on ready_for_pr', async () => {
      const taskId = 'TASK-TEST-006';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000,
      });

      await tracker.checkpoint(TaskPhase.READY_FOR_PR, {});

      // Check file immediately
      const content = await readProgress(taskId);
      expect(content).toContain('ready_for_pr');

      await tracker.close();
    });
  });

  describe('AC-4: Atomic write prevents corruption', () => {
    it('should use atomic write (tmp + rename)', async () => {
      const taskId = 'TASK-TEST-007';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      await tracker.checkpoint('test', {});
      await tracker.flush();

      // Check no .tmp files left
      const files = await fs.readdir(outputDir);
      const tmpFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tmpFiles).toHaveLength(0);

      await tracker.close();
    });

    it('should preserve file integrity on repeated writes', async () => {
      const taskId = 'TASK-TEST-008';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      // Multiple rapid writes
      for (let i = 0; i < 10; i++) {
        await tracker.checkpoint(`checkpoint_${i}`, { notes: `step ${i}` });
        await tracker.flush();
      }

      // File should be valid markdown
      const content = await readProgress(taskId);
      expect(content).toContain('# Task Progress');
      expect(content).toContain('checkpoint_9'); // Last checkpoint

      await tracker.close();
    });
  });

  describe('AC-5: Markdown format correctness', () => {
    it('should render correct markdown format', async () => {
      const taskId = 'TASK-TEST-009';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      await tracker.completePhase(TaskPhase.ANALYSIS);
      await tracker.completePhase(TaskPhase.DESIGN);
      await tracker.addNextStep('Implement AC-3');
      await tracker.addBlocker('Missing API key');
      await tracker.flush();

      const content = await readProgress(taskId);

      // Check structure
      expect(content).toMatch(/# Task Progress: TASK-TEST-009/);
      expect(content).toMatch(/\*\*Last Update\*\*:/);
      expect(content).toMatch(/\*\*Slaver\*\*: slaver-test/);
      expect(content).toMatch(/\*\*Current Phase\*\*:/);
      expect(content).toMatch(/## Completed/);
      expect(content).toMatch(/## Next Steps/);
      expect(content).toMatch(/## Blockers/);

      // Check content
      expect(content).toContain('- [x] analysis');
      expect(content).toContain('- [x] design');
      expect(content).toContain('- [ ] Implement AC-3');
      expect(content).toContain('- ⚠️ Missing API key');

      await tracker.close();
    });

    it('should show completed ACs with metadata', async () => {
      const taskId = 'TASK-TEST-010';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      await tracker.completeAC('1', {
        files: ['auth.ts', 'auth.test.ts'],
        tests: { passed: true, command: 'npm test', exitCode: 0 },
        commit: 'abc123',
      });
      await tracker.flush();

      const content = await readProgress(taskId);
      expect(content).toContain('ac_1');
      expect(content).toContain('files: auth.ts, auth.test.ts');
      expect(content).toContain('test: ✅');
      expect(content).toContain('commit: abc123');

      await tracker.close();
    });

    it('should show recent notes (max 5)', async () => {
      const taskId = 'TASK-TEST-011';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      // Add 7 notes
      for (let i = 1; i <= 7; i++) {
        await tracker.addNote(`Note ${i}`);
      }
      await tracker.flush();

      const content = await readProgress(taskId);
      expect(content).toContain('## Recent Notes');
      expect(content).toContain('Note 7');
      expect(content).toContain('Note 3');
      expect(content).not.toContain('Note 2'); // Should only show last 5
      expect(content).not.toContain('Note 1');

      await tracker.close();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty checkpoints', async () => {
      const taskId = 'TASK-TEST-012';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
      });

      await tracker.flush();

      const content = await readProgress(taskId);
      expect(content).toContain('*(No completed checkpoints yet)*');

      await tracker.close();
    });

    it('should handle flush failure gracefully', async () => {
      const taskId = 'TASK-TEST-013';

      // Use invalid path (no permissions)
      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir: '/root/invalid-path', // Unlikely to have write permission
        flushIntervalMs: 60000,
      });

      // Should not throw, just log warning
      await tracker.checkpoint('test', {});
      await expect(tracker.flush()).resolves.not.toThrow();

      await tracker.close();
    });

    it('should close and flush remaining data', async () => {
      const taskId = 'TASK-TEST-014';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000,
      });

      await tracker.checkpoint('final', {});

      // Close should flush
      await tracker.close();

      const content = await readProgress(taskId);
      expect(content).toContain('final');
    });
  });

  describe('Performance', () => {
    it('should handle 100 checkpoints efficiently', async () => {
      const taskId = 'TASK-TEST-015';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000,
      });

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await tracker.checkpoint(`step_${i}`, { notes: `Progress ${i}` });
      }

      const duration = Date.now() - startTime;

      // 100 checkpoints should take < 100ms (memory ops)
      expect(duration).toBeLessThan(100);

      await tracker.close();
    });

    it('should flush large checkpoint buffer quickly', async () => {
      const taskId = 'TASK-TEST-016';
      const outputDir = await setupTestDir(taskId);

      const tracker = new ProgressTracker({
        taskId,
        slaverId: 'slaver-test',
        outputDir,
        flushIntervalMs: 60000,
      });

      // Add 50 checkpoints
      for (let i = 0; i < 50; i++) {
        await tracker.checkpoint(`step_${i}`, { files: [`file_${i}.ts`] });
      }

      const startTime = Date.now();
      await tracker.flush();
      const duration = Date.now() - startTime;

      // Flush should take < 50ms
      expect(duration).toBeLessThan(50);

      await tracker.close();
    });
  });
});
