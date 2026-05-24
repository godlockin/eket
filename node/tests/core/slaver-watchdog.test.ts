/**
 * TASK-AUTO-03: Slaver Watchdog Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { ProgressTracker } from '../../src/core/progress-tracker.js';
import { SlaverWatchdog } from '../../src/core/slaver-watchdog.js';

describe('SlaverWatchdog', () => {
  const TEST_TASK_ID = 'TASK-TEST-001';
  const TEST_DIR = path.join(process.cwd(), '.eket-test/state');
  let mockTracker: ProgressTracker | null;

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Create mock tracker
    mockTracker = {
      checkpoint: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProgressTracker;
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('AC-2: Heartbeat Mechanism', () => {
    it('should create heartbeat file on initialization', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
      });

      // Wait for async heartbeat write
      await new Promise((resolve) => setTimeout(resolve, 200));

      const heartbeatPath = watchdog.getHeartbeatPath();
      const exists = await fs
        .access(heartbeatPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);

      await watchdog.close();
    });

    it('should include task metadata in heartbeat', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const heartbeatPath = watchdog.getHeartbeatPath();
      const content = await fs.readFile(heartbeatPath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.taskId).toBe(TEST_TASK_ID);
      expect(data.status).toBe('active');
      expect(data.timestamp).toBeGreaterThan(0);
      expect(data.elapsed).toBeGreaterThanOrEqual(0);

      await watchdog.close();
    });

    it('should update heartbeat periodically', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
        heartbeatIntervalMs: 100, // Short interval for testing
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const heartbeatPath = watchdog.getHeartbeatPath();
      const content1 = await fs.readFile(heartbeatPath, 'utf-8');
      const data1 = JSON.parse(content1);

      // Wait for next heartbeat
      await new Promise((resolve) => setTimeout(resolve, 150));

      const content2 = await fs.readFile(heartbeatPath, 'utf-8');
      const data2 = JSON.parse(content2);

      // Timestamp should be updated
      expect(data2.timestamp).toBeGreaterThan(data1.timestamp);

      await watchdog.close();
    }, 10000);
  });

  describe('AC-1: Timeout Warning + Auto Checkpoint', () => {
    it('should trigger auto checkpoint on timeout', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
        timeoutWarningMs: 200, // Short timeout for testing
      });

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should trigger checkpoint
      expect(mockTracker!.checkpoint).toHaveBeenCalledWith(
        'timeout_warning',
        expect.objectContaining({
          reason: 'watchdog_timeout_prevention',
        })
      );

      // Should flush
      expect(mockTracker!.flush).toHaveBeenCalled();

      await watchdog.close();
    }, 10000);

    it('should update heartbeat status to timeout_warning', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
        timeoutWarningMs: 200,
      });

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 300));

      const heartbeatPath = watchdog.getHeartbeatPath();
      const content = await fs.readFile(heartbeatPath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.status).toBe('timeout_warning');

      await watchdog.close();
    }, 10000);

    it('should not checkpoint if disabled', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
        timeoutWarningMs: 200,
        enableAutoCheckpoint: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockTracker!.checkpoint).not.toHaveBeenCalled();

      await watchdog.close();
    }, 10000);
  });

  describe('Close and Cleanup', () => {
    it('should update status to closed on close', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Close watchdog
      await watchdog.close();

      const heartbeatPath = watchdog.getHeartbeatPath();
      const content = await fs.readFile(heartbeatPath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.status).toBe('closed');
    });

    it('should stop timers on close', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
        heartbeatIntervalMs: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const heartbeatPath = watchdog.getHeartbeatPath();
      const content1 = await fs.readFile(heartbeatPath, 'utf-8');
      const data1 = JSON.parse(content1);

      // Close watchdog
      await watchdog.close();

      // Wait - no more heartbeat updates should happen
      await new Promise((resolve) => setTimeout(resolve, 150));

      const content2 = await fs.readFile(heartbeatPath, 'utf-8');
      const data2 = JSON.parse(content2);

      // Status should be closed
      expect(data2.status).toBe('closed');
    });
  });

  describe('Activity Tracking', () => {
    it('should track elapsed time', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const elapsed = watchdog.getElapsedTime();
      expect(elapsed).toBeGreaterThanOrEqual(100);

      await watchdog.close();
    });

    it('should mark activity', async () => {
      const watchdog = new SlaverWatchdog(TEST_TASK_ID, mockTracker, {
        heartbeatDir: TEST_DIR,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const before = watchdog.getLastActivity();
      await new Promise((resolve) => setTimeout(resolve, 50));
      watchdog.markActivity();
      const after = watchdog.getLastActivity();

      expect(after).toBeGreaterThan(before);

      await watchdog.close();
    });
  });
});

