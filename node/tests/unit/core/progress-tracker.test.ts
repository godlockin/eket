/**
 * ProgressTracker Unit Tests
 * TASK-Z05: core/ module unit testing
 *
 * Covers:
 * - Constructor initialization
 * - Phase lifecycle (start/complete)
 * - Checkpoint recording
 * - Markdown rendering
 * - Auto-flush timer management
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.unstable_mockModule('../../../src/utils/atomic-write.js', () => ({
  atomicWrite: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: jest.fn().mockResolvedValue({ status: 0, stdout: '', stderr: '' }),
}));

// Import after mocking
const { ProgressTracker } = await import('../../../src/core/progress-tracker.js');
const { TaskPhase } = await import('../../../src/types/progress-tracker.js');
const { atomicWrite } = await import('../../../src/utils/atomic-write.js');

describe('ProgressTracker', () => {
  const TEST_TASK_ID = 'TASK-TEST-001';
  const TEST_SLAVER_ID = 'slaver-test-001';
  const TEST_OUTPUT_DIR = '/tmp/eket-test-progress';

  let tracker: InstanceType<typeof ProgressTracker>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (tracker) {
      await tracker.close();
    }
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with required options', () => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });

      const snapshot = tracker.getSnapshot();
      expect(snapshot.taskId).toBe(TEST_TASK_ID);
      expect(snapshot.slaverId).toBe(TEST_SLAVER_ID);
      expect(snapshot.currentPhase).toBe(TaskPhase.ANALYSIS);
    });

    it('should use default flush interval of 30s', () => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });

      // Advance time less than 30s - no flush
      jest.advanceTimersByTime(29000);
      expect(atomicWrite).not.toHaveBeenCalled();

      // Advance past 30s - should flush
      jest.advanceTimersByTime(2000);
      expect(atomicWrite).toHaveBeenCalled();
    });

    it('should accept custom flush interval', () => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        flushIntervalMs: 5000,
        gitEnabled: false,
      });

      jest.advanceTimersByTime(5500);
      expect(atomicWrite).toHaveBeenCalled();
    });

    it('should resume from checkpoint context', () => {
      const completedPhases = new Set<string>([TaskPhase.ANALYSIS, TaskPhase.DESIGN]);
      const existingCheckpoints = [
        { timestamp: '2024-01-01T00:00:00Z', phase: 'analysis_done', metadata: {} },
      ];

      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
        resumeFrom: {
          completedPhases,
          currentPhase: TaskPhase.IMPLEMENTATION,
          checkpoints: existingCheckpoints,
        },
      });

      const snapshot = tracker.getSnapshot();
      expect(snapshot.currentPhase).toBe(TaskPhase.IMPLEMENTATION);
      expect(snapshot.completedPhases.size).toBe(2);
      expect(snapshot.checkpoints.length).toBe(1);
    });

    it('should extend EventEmitter', () => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });

      expect(tracker).toBeInstanceOf(EventEmitter);
    });
  });

  describe('startPhase', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });
    });

    it('should update current phase', async () => {
      await tracker.startPhase(TaskPhase.DESIGN);

      const snapshot = tracker.getSnapshot();
      expect(snapshot.currentPhase).toBe(TaskPhase.DESIGN);
    });

    it('should record start checkpoint', async () => {
      await tracker.startPhase(TaskPhase.IMPLEMENTATION);

      const snapshot = tracker.getSnapshot();
      const startCheckpoint = snapshot.checkpoints.find(
        (cp) => cp.phase === 'implementation_start'
      );
      expect(startCheckpoint).toBeDefined();
    });

    it('should accept custom metadata', async () => {
      await tracker.startPhase(TaskPhase.TESTING, { notes: 'Starting tests' });

      const snapshot = tracker.getSnapshot();
      const checkpoint = snapshot.checkpoints.find((cp) => cp.phase === 'testing_start');
      expect(checkpoint?.metadata.notes).toBe('Starting tests');
    });
  });

  describe('completePhase', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });
    });

    it('should add phase to completed set', async () => {
      await tracker.completePhase(TaskPhase.ANALYSIS);

      const snapshot = tracker.getSnapshot();
      expect(snapshot.completedPhases.has(TaskPhase.ANALYSIS)).toBe(true);
    });

    it('should record done checkpoint', async () => {
      await tracker.completePhase(TaskPhase.DESIGN);

      const snapshot = tracker.getSnapshot();
      const doneCheckpoint = snapshot.checkpoints.find((cp) => cp.phase === 'design_done');
      expect(doneCheckpoint).toBeDefined();
    });
  });

  describe('checkpoint', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
        syncPhases: ['critical_phase'],
      });
    });

    it('should record checkpoint with timestamp', async () => {
      await tracker.checkpoint('custom_phase', { artifact: 'test.ts' });

      const snapshot = tracker.getSnapshot();
      const checkpoint = snapshot.checkpoints.find((cp) => cp.phase === 'custom_phase');
      expect(checkpoint).toBeDefined();
      expect(checkpoint?.metadata.artifact).toBe('test.ts');
      expect(checkpoint?.timestamp).toBeDefined();
    });

    it('should skip already completed phases', async () => {
      // First complete the phase
      await tracker.completePhase('my_phase');
      const initialCount = tracker.getSnapshot().checkpoints.length;

      // Try to checkpoint same phase again
      await tracker.checkpoint('my_phase', {});

      expect(tracker.getSnapshot().checkpoints.length).toBe(initialCount);
    });

    it('should emit checkpoint event', async () => {
      const eventHandler = jest.fn();
      tracker.on('checkpoint', eventHandler);

      await tracker.checkpoint('test_phase', { notes: 'test' });

      expect(eventHandler).toHaveBeenCalledWith({
        phase: 'test_phase',
        metadata: { notes: 'test' },
      });
    });

    it('should trigger sync flush for critical phases', async () => {
      jest.clearAllMocks();

      await tracker.checkpoint('critical_phase', {});

      expect(atomicWrite).toHaveBeenCalled();
    });
  });

  describe('completeAC', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });
    });

    it('should record AC completion checkpoint', async () => {
      await tracker.completeAC('AC-1', { notes: 'Criteria met' });

      const snapshot = tracker.getSnapshot();
      const acCheckpoint = snapshot.checkpoints.find((cp) => cp.phase === 'ac_AC-1_done');
      expect(acCheckpoint).toBeDefined();
      expect(acCheckpoint?.metadata.acId).toBe('AC-1');
    });
  });

  describe('addNote / addNextStep / addBlocker', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });
    });

    it('should add note checkpoint', async () => {
      await tracker.addNote('Important observation');

      const snapshot = tracker.getSnapshot();
      const noteCheckpoint = snapshot.checkpoints.find((cp) => cp.phase === 'note');
      expect(noteCheckpoint?.metadata.notes).toBe('Important observation');
    });

    it('should accumulate next steps', () => {
      tracker.addNextStep('Step 1');
      tracker.addNextStep('Step 2');

      const snapshot = tracker.getSnapshot();
      expect(snapshot.nextSteps).toEqual(['Step 1', 'Step 2']);
    });

    it('should accumulate blockers', () => {
      tracker.addBlocker('Blocker A');
      tracker.addBlocker('Blocker B');

      const snapshot = tracker.getSnapshot();
      expect(snapshot.blockers).toEqual(['Blocker A', 'Blocker B']);
    });
  });

  describe('flush', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });
    });

    it('should write markdown to file', async () => {
      await tracker.flush();

      expect(atomicWrite).toHaveBeenCalled();
      const [filePath, content] = (atomicWrite as jest.Mock).mock.calls[0];
      expect(filePath).toContain('progress.md');
      expect(content).toContain(`# Task Progress: ${TEST_TASK_ID}`);
    });

    it('should include slaver ID in output', async () => {
      await tracker.flush();

      const [, content] = (atomicWrite as jest.Mock).mock.calls[0];
      expect(content).toContain(TEST_SLAVER_ID);
    });

    it('should handle flush errors gracefully', async () => {
      (atomicWrite as jest.Mock).mockRejectedValueOnce(new Error('Write failed'));

      // Should not throw
      await expect(tracker.flush()).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('should stop flush timer and perform final flush', async () => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });

      jest.clearAllMocks();
      await tracker.close();

      expect(atomicWrite).toHaveBeenCalled();

      // No more flushes after close
      jest.clearAllMocks();
      jest.advanceTimersByTime(60000);
      expect(atomicWrite).not.toHaveBeenCalled();
    });
  });

  describe('getSnapshot', () => {
    it('should return current state', () => {
      tracker = new ProgressTracker({
        taskId: TEST_TASK_ID,
        slaverId: TEST_SLAVER_ID,
        outputDir: TEST_OUTPUT_DIR,
        gitEnabled: false,
      });

      const snapshot = tracker.getSnapshot();

      expect(snapshot.taskId).toBe(TEST_TASK_ID);
      expect(snapshot.slaverId).toBe(TEST_SLAVER_ID);
      expect(snapshot.lastUpdate).toBeDefined();
      expect(Array.isArray(snapshot.checkpoints)).toBe(true);
      expect(snapshot.completedPhases).toBeInstanceOf(Set);
    });
  });
});
