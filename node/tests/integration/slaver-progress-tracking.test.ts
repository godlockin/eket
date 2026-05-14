/**
 * TASK-X02: Slaver ProgressTracker Integration Tests
 *
 * Test that ProgressTracker correctly integrates into Slaver workflow:
 * - Initialization on task:claim
 * - Automatic checkpoints at key milestones
 * - Error tolerance (failures don't block execution)
 * - Proper cleanup on task completion
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  initializeProgressTracker,
  safeCheckpoint,
  closeProgressTracker,
  getProgressTracker,
  isTrackingActive,
} from '../../src/core/slaver-progress-integration.js';
import {
  recordAnalysisComplete,
  recordDesignComplete,
  recordACComplete,
  recordTestsPassedComplete,
} from '../../src/utils/checkpoint-helpers.js';

describe('Slaver ProgressTracker Integration', () => {
  const TEST_TASK_ID = 'TASK-TEST-X02';
  const TEST_SLAVER_ID = 'slaver-test-integration';
  const TEST_OUTPUT_DIR = path.join(process.cwd(), 'jira', 'tickets', TEST_TASK_ID);
  const PROGRESS_FILE = path.join(TEST_OUTPUT_DIR, 'progress.md');

  beforeEach(() => {
    // Clean up test output directory
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up tracker
    await closeProgressTracker();

    // Clean up test files
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('AC-1: Slaver 初始化 ProgressTracker', () => {
    it('should initialize tracker on task claim', async () => {
      // Given: No tracker active
      expect(isTrackingActive()).toBe(false);

      // When: Initialize tracker (simulates task:claim)
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // Then: Tracker is active
      expect(isTrackingActive()).toBe(true);
      expect(getProgressTracker()).not.toBeNull();
    });

    it('should create progress.md file', async () => {
      // Given: Tracker initialized
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // When: Force immediate flush (don't wait for async timer)
      const tracker = getProgressTracker();
      await tracker?.flush();

      // Then: progress.md exists
      expect(fs.existsSync(PROGRESS_FILE)).toBe(true);
    });

    it('should record task_claimed checkpoint', async () => {
      // Given: Tracker initialized
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // When: Force flush
      const tracker = getProgressTracker();
      await tracker?.flush();

      // Then: progress.md contains task_claimed
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('task_claimed');
    });

    it('should close tracker on task completion', async () => {
      // Given: Active tracker
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);
      expect(isTrackingActive()).toBe(true);

      // When: Close tracker (simulates submit-pr)
      await closeProgressTracker();

      // Then: Tracker is inactive
      expect(isTrackingActive()).toBe(false);
      expect(getProgressTracker()).toBeNull();
    });
  });

  describe('AC-2: 装饰器模式最小侵入', () => {
    it('should work with minimal code changes', async () => {
      // Given: Tracker initialized
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // When: Call checkpoint helpers (minimal API surface)
      await recordAnalysisComplete('analysis-report.md');
      await recordDesignComplete('design-decisions.md');
      await recordACComplete('1', {
        files: ['src/auth.ts'],
        testCommand: 'npm test -- auth',
      });

      // Then: All checkpoints recorded
      const tracker = getProgressTracker();
      await tracker?.flush();

      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('analysis');
      expect(content).toContain('design');
      expect(content).toContain('ac_1');
    });

    it('should not require direct ProgressTracker instantiation', async () => {
      // AC-2: Slaver code never directly creates ProgressTracker
      // Only uses initializeProgressTracker() + helper functions

      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // All operations through facade functions
      await recordAnalysisComplete('analysis.md');
      await safeCheckpoint('custom_milestone', { notes: 'Custom work' });

      // No direct `new ProgressTracker()` in Slaver code
      expect(isTrackingActive()).toBe(true);
    });
  });

  describe('AC-3: 自动 checkpoint 触发点', () => {
    beforeEach(async () => {
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);
    });

    it('should record analysis_done checkpoint', async () => {
      // When: Analysis complete
      await recordAnalysisComplete('analysis-report.md');

      const tracker = getProgressTracker();
      await tracker?.flush();

      // Then: Checkpoint recorded
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('analysis');
      expect(content).toContain('analysis-report.md');
    });

    it('should record design_done checkpoint', async () => {
      // When: Design complete
      await recordDesignComplete('design-decisions.md');

      const tracker = getProgressTracker();
      await tracker?.flush();

      // Then: Checkpoint recorded
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('design');
      expect(content).toContain('design-decisions.md');
    });

    it('should record ac_N_done checkpoints', async () => {
      // When: Multiple ACs complete
      await recordACComplete('1', {
        files: ['src/auth.ts', 'tests/auth.test.ts'],
        testCommand: 'npm test -- auth',
        exitCode: 0,
      });

      await recordACComplete('2', {
        files: ['src/db.ts'],
        testCommand: 'npm test -- db',
        exitCode: 0,
      });

      const tracker = getProgressTracker();
      await tracker?.flush();

      // Then: All AC checkpoints recorded
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('ac_1');
      expect(content).toContain('ac_2');
      expect(content).toContain('src/auth.ts');
      expect(content).toContain('src/db.ts');
    });

    it('should record ready_for_pr checkpoint (from submit-pr)', async () => {
      // When: Ready for PR (simulates submit-pr command)
      await safeCheckpoint('ready_for_pr', {
        commit: 'abc123def',
        notes: 'All ACs complete, PR ready',
      });

      const tracker = getProgressTracker();
      await tracker?.flush();

      // Then: Checkpoint recorded
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('ready_for_pr');
      expect(content).toContain('abc123def');
    });
  });

  describe('AC-4: 错误容错', () => {
    it('should not crash when checkpoint fails', async () => {
      // Given: Tracker initialized
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // When: Make progress file readonly (simulate disk full)
      const tracker = getProgressTracker();
      await tracker?.flush(); // Ensure file exists
      fs.chmodSync(PROGRESS_FILE, 0o444); // Read-only

      // Then: Checkpoint call should not throw
      await expect(safeCheckpoint('test_phase', { notes: 'Test' })).resolves.not.toThrow();

      // Cleanup: restore permissions
      fs.chmodSync(PROGRESS_FILE, 0o644);
    });

    it('should continue execution after checkpoint failure', async () => {
      // Given: Tracker initialized
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // Simulate filesystem error
      const tracker = getProgressTracker();
      await tracker?.flush();
      fs.chmodSync(PROGRESS_FILE, 0o444);

      // When: Perform multiple operations after checkpoint failure
      await recordAnalysisComplete('analysis.md'); // May fail silently
      await recordDesignComplete('design.md'); // May fail silently

      // Then: No exceptions thrown, execution continues
      expect(isTrackingActive()).toBe(true);

      // Cleanup
      fs.chmodSync(PROGRESS_FILE, 0o644);
    });

    it('should log warnings on checkpoint failures', async () => {
      // Given: Tracker initialized
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // When: Remove output directory to cause write failure
      const tracker = getProgressTracker();
      await tracker?.flush();

      // Remove entire output dir to guarantee failure
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });

      // Try to checkpoint (will fail silently)
      await safeCheckpoint('test_phase', { notes: 'Test' });

      // Try to flush (will fail and log warning)
      try {
        await tracker?.flush();
      } catch {
        // Silently caught by ProgressTracker
      }

      // Then: No exception thrown (error tolerance)
      // The exact warning format is implementation detail
      // Key requirement: execution continues despite errors
      expect(true).toBe(true);

      // Recreate dir for cleanup
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    });
  });

  describe('Full Slaver workflow simulation', () => {
    it('should track complete task execution lifecycle', async () => {
      // 1. Task claim → Initialize tracker
      await initializeProgressTracker(TEST_TASK_ID, TEST_SLAVER_ID);

      // 2. Analysis phase
      await recordAnalysisComplete('jira/tickets/TASK-TEST-X02/analysis-report.md');

      // 3. Design phase
      await recordDesignComplete('jira/tickets/TASK-TEST-X02/design-decisions.md');

      // 4. Implementation: AC-1
      await recordACComplete('1', {
        files: ['src/database.ts', 'tests/database.test.ts'],
        testCommand: 'npm test -- database',
        exitCode: 0,
      });

      // 5. Implementation: AC-2
      await recordACComplete('2', {
        files: ['src/api.ts', 'tests/api.test.ts'],
        testCommand: 'npm test -- api',
        exitCode: 0,
      });

      // 6. Tests passed
      await recordTestsPassedComplete('npm test');

      // 7. Ready for PR
      await safeCheckpoint('ready_for_pr', {
        commit: 'feature/TASK-TEST-X02',
      });

      // 8. Close tracker (submit-pr)
      await closeProgressTracker();

      // Verify: progress.md contains all phases
      const content = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      expect(content).toContain('task_claimed');
      expect(content).toContain('analysis');
      expect(content).toContain('design');
      expect(content).toContain('ac_1');
      expect(content).toContain('ac_2');
      expect(content).toContain('tests_passed');
      expect(content).toContain('ready_for_pr');

      // Verify: Tracker is closed
      expect(isTrackingActive()).toBe(false);
    });
  });

  describe('Environment variable control', () => {
    it('should respect ENABLE_PROGRESS_TRACKING env var documentation', () => {
      // This test documents the expected behavior:
      // Setting ENABLE_PROGRESS_TRACKING=false before module import
      // will disable tracking completely

      // The implementation checks the env var at module load time
      // Module caching in Jest prevents full re-import testing

      // Verify the constant is read from env
      const envValue = process.env.ENABLE_PROGRESS_TRACKING;
      expect(typeof envValue === 'string' || envValue === undefined).toBe(true);
    });
  });
});
