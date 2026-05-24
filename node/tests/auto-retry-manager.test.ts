/**
 * EKET Framework - Auto Retry Manager Tests
 *
 * TASK-AUTO-06: Test suite for auto retry mechanism
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { AutoRetryManager } from '../src/core/auto-retry-manager.js';

const TEST_STATE_DIR = path.join(process.cwd(), '.eket-test/state/retry');
const TEST_TASK_ID = 'TASK-TEST-001';

describe('AutoRetryManager', () => {
  let retryMgr: AutoRetryManager;

  beforeEach(async () => {
    // Setup test environment
    retryMgr = new AutoRetryManager({
      maxRetries: 3,
      stateDir: TEST_STATE_DIR,
    });

    // Clean test directory
    if (existsSync(TEST_STATE_DIR)) {
      await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    if (existsSync(TEST_STATE_DIR)) {
      await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  describe('AC-1: Record failure', () => {
    it('should create retry state on first failure', async () => {
      const state = await retryMgr.recordFailure(TEST_TASK_ID, 'Timeout after 650s');

      expect(state.taskId).toBe(TEST_TASK_ID);
      expect(state.attempts).toBe(1);
      expect(state.maxRetries).toBe(3);
      expect(state.failureReasons).toEqual(['Timeout after 650s']);
    });

    it('should increment attempts on subsequent failures', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'First failure');
      const state = await retryMgr.recordFailure(TEST_TASK_ID, 'Second failure');

      expect(state.attempts).toBe(2);
      expect(state.failureReasons).toHaveLength(2);
    });

    it('should persist state to file', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'Test failure');

      const filePath = path.join(TEST_STATE_DIR, `retry-${TEST_TASK_ID}.json`);
      expect(existsSync(filePath)).toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.attempts).toBe(1);
    });
  });

  describe('AC-2: Check retry eligibility', () => {
    it('should allow retry on first failure', async () => {
      const result = await retryMgr.shouldRetry(TEST_TASK_ID);

      expect(result.canRetry).toBe(true);
      expect(result.attemptsRemaining).toBe(3);
    });

    it('should allow retry after 1 failure', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'First failure');
      const result = await retryMgr.shouldRetry(TEST_TASK_ID);

      expect(result.canRetry).toBe(true);
      expect(result.attemptsRemaining).toBe(2);
    });

    it('should allow retry after 2 failures', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'First failure');
      await retryMgr.recordFailure(TEST_TASK_ID, 'Second failure');
      const result = await retryMgr.shouldRetry(TEST_TASK_ID);

      expect(result.canRetry).toBe(true);
      expect(result.attemptsRemaining).toBe(1);
    });

    it('should block retry after 3 failures (max retries)', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 1');
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 2');
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 3');
      const result = await retryMgr.shouldRetry(TEST_TASK_ID);

      expect(result.canRetry).toBe(false);
      expect(result.attemptsRemaining).toBe(0);
      expect(result.reason).toContain('Max retries');
    });
  });

  describe('AC-3: Max retries detection', () => {
    it('should return true when max retries reached', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 1');
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 2');
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 3');

      const reached = await retryMgr.hasReachedMaxRetries(TEST_TASK_ID);
      expect(reached).toBe(true);
    });

    it('should return false before max retries', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'Failure 1');

      const reached = await retryMgr.hasReachedMaxRetries(TEST_TASK_ID);
      expect(reached).toBe(false);
    });

    it('should identify tasks needing intervention', async () => {
      const task1 = 'TASK-001';
      const task2 = 'TASK-002';

      // Task1: max retries
      await retryMgr.recordFailure(task1, 'F1');
      await retryMgr.recordFailure(task1, 'F2');
      await retryMgr.recordFailure(task1, 'F3');

      // Task2: only 1 failure
      await retryMgr.recordFailure(task2, 'F1');

      const tasks = await retryMgr.getTasksNeedingIntervention();
      expect(tasks).toContain(task1);
      expect(tasks).not.toContain(task2);
    });
  });

  describe('AC-4: Reset retry state', () => {
    it('should remove state file on reset', async () => {
      await retryMgr.recordFailure(TEST_TASK_ID, 'Test failure');

      const filePath = path.join(TEST_STATE_DIR, `retry-${TEST_TASK_ID}.json`);
      expect(existsSync(filePath)).toBe(true);

      await retryMgr.resetRetryState(TEST_TASK_ID);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should allow retry after reset', async () => {
      // Max out retries
      await retryMgr.recordFailure(TEST_TASK_ID, 'F1');
      await retryMgr.recordFailure(TEST_TASK_ID, 'F2');
      await retryMgr.recordFailure(TEST_TASK_ID, 'F3');

      let result = await retryMgr.shouldRetry(TEST_TASK_ID);
      expect(result.canRetry).toBe(false);

      // Reset
      await retryMgr.resetRetryState(TEST_TASK_ID);

      // Should allow retry again
      result = await retryMgr.shouldRetry(TEST_TASK_ID);
      expect(result.canRetry).toBe(true);
      expect(result.attemptsRemaining).toBe(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle non-existent task gracefully', async () => {
      const state = await retryMgr.getRetryState('NON-EXISTENT');
      expect(state).toBeNull();
    });

    it('should handle corrupted state file', async () => {
      const filePath = path.join(TEST_STATE_DIR, `retry-${TEST_TASK_ID}.json`);
      await fs.writeFile(filePath, 'invalid json{{{', 'utf-8');

      const state = await retryMgr.getRetryState(TEST_TASK_ID);
      expect(state).toBeNull();
    });

    it('should support custom max retries', async () => {
      const customMgr = new AutoRetryManager({
        maxRetries: 5,
        stateDir: TEST_STATE_DIR,
      });

      await customMgr.recordFailure(TEST_TASK_ID, 'F1');
      await customMgr.recordFailure(TEST_TASK_ID, 'F2');
      await customMgr.recordFailure(TEST_TASK_ID, 'F3');

      const result = await customMgr.shouldRetry(TEST_TASK_ID);
      expect(result.canRetry).toBe(true);
      expect(result.attemptsRemaining).toBe(2);
    });
  });

  describe('Integration: Full retry cycle', () => {
    it('should complete full retry cycle (first failure → retry → second failure → retry → third failure → alert)', async () => {
      // First failure
      let state = await retryMgr.recordFailure(TEST_TASK_ID, 'Timeout 650s');
      expect(state.attempts).toBe(1);

      let check = await retryMgr.shouldRetry(TEST_TASK_ID);
      expect(check.canRetry).toBe(true);
      expect(check.attemptsRemaining).toBe(2);

      // Second failure
      state = await retryMgr.recordFailure(TEST_TASK_ID, 'Timeout 650s again');
      expect(state.attempts).toBe(2);

      check = await retryMgr.shouldRetry(TEST_TASK_ID);
      expect(check.canRetry).toBe(true);
      expect(check.attemptsRemaining).toBe(1);

      // Third failure
      state = await retryMgr.recordFailure(TEST_TASK_ID, 'Timeout 650s third time');
      expect(state.attempts).toBe(3);

      check = await retryMgr.shouldRetry(TEST_TASK_ID);
      expect(check.canRetry).toBe(false);
      expect(check.attemptsRemaining).toBe(0);

      // Should need intervention
      const tasks = await retryMgr.getTasksNeedingIntervention();
      expect(tasks).toContain(TEST_TASK_ID);
    });
  });
});
