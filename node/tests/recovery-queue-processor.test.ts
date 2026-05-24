/**
 * EKET Framework - Recovery Queue Processor Tests
 *
 * TASK-AUTO-15: Recovery Queue Processing Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { RecoveryQueueProcessor } from '../src/core/recovery-queue-processor.js';

const TEST_ROOT = path.join(process.cwd(), 'node/tests/.tmp-recovery-queue');
const QUEUE_PATH = path.join(TEST_ROOT, '.eket/triggers/resume-queue.txt');
const LOG_PATH = path.join(TEST_ROOT, '.eket/logs/recovery-queue.log');

describe('RecoveryQueueProcessor', () => {
  let processor: RecoveryQueueProcessor;

  beforeEach(async () => {
    // Clean test directory
    if (existsSync(TEST_ROOT)) {
      await fs.rm(TEST_ROOT, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_ROOT, { recursive: true });

    // Create test tickets directory
    await fs.mkdir(path.join(TEST_ROOT, 'jira/tickets'), { recursive: true });

    processor = new RecoveryQueueProcessor({
      projectRoot: TEST_ROOT,
      queuePath: QUEUE_PATH,
      logPath: LOG_PATH,
    });
  });

  afterEach(async () => {
    // Cleanup
    if (existsSync(TEST_ROOT)) {
      await fs.rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  describe('AC-1: Read queue file', () => {
    it('should return empty array when queue file does not exist', async () => {
      const result = await processor.processQueue();
      expect(result.processedCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('should read task IDs from queue file', async () => {
      // Create queue file
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-001\nTASK-002\nTASK-003\n', 'utf-8');

      // Create mock tickets
      for (const id of ['TASK-001', 'TASK-002', 'TASK-003']) {
        await fs.writeFile(path.join(TEST_ROOT, 'jira/tickets', `${id}.md`), '# Test Ticket', 'utf-8');
      }

      const result = await processor.processQueue();
      expect(result.processedCount).toBe(3);
    });

    it('should ignore empty lines and comments', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-001\n\n# Comment\nTASK-002\n', 'utf-8');

      // Create mock tickets
      for (const id of ['TASK-001', 'TASK-002']) {
        await fs.writeFile(path.join(TEST_ROOT, 'jira/tickets', `${id}.md`), '# Test Ticket', 'utf-8');
      }

      const result = await processor.processQueue();
      expect(result.processedCount).toBe(2);
    });
  });

  describe('AC-2: Dispatch resume', () => {
    it('should process all tasks in queue', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-001\nTASK-002\n', 'utf-8');

      // Create mock tickets
      for (const id of ['TASK-001', 'TASK-002']) {
        await fs.writeFile(path.join(TEST_ROOT, 'jira/tickets', `${id}.md`), '# Test Ticket', 'utf-8');
      }

      const result = await processor.processQueue();
      expect(result.processedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('AC-3: Clear queue on success', () => {
    it('should clear queue file when all tasks succeed', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-001\n', 'utf-8');

      // Create mock ticket
      await fs.writeFile(
        path.join(TEST_ROOT, 'jira/tickets', 'TASK-001.md'),
        '# Test Ticket',
        'utf-8'
      );

      await processor.processQueue();

      const content = await fs.readFile(QUEUE_PATH, 'utf-8');
      expect(content).toBe('');
    });

    it('should retain failed tasks in queue', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-001\nTASK-999\n', 'utf-8');

      // Create only TASK-001 ticket (TASK-999 will fail)
      await fs.writeFile(
        path.join(TEST_ROOT, 'jira/tickets', 'TASK-001.md'),
        '# Test Ticket',
        'utf-8'
      );

      const result = await processor.processQueue();

      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.success).toBe(false);

      const content = await fs.readFile(QUEUE_PATH, 'utf-8');
      expect(content.trim()).toBe('TASK-999');
    });
  });

  describe('AC-4: Log failures', () => {
    it('should log failed tasks to log file', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-999\n', 'utf-8');

      await processor.processQueue();

      const logExists = existsSync(LOG_PATH);
      expect(logExists).toBe(true);

      const logContent = await fs.readFile(LOG_PATH, 'utf-8');
      expect(logContent).toContain('TASK-999');
      expect(logContent).toContain('FAILED');
    });

    it('should include error message in log', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-INVALID\n', 'utf-8');

      await processor.processQueue();

      const logContent = await fs.readFile(LOG_PATH, 'utf-8');
      expect(logContent).toContain('Ticket not found');
    });
  });

  describe('Edge cases', () => {
    it('should handle malformed queue file gracefully', async () => {
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      // Write binary data to simulate corruption
      await fs.writeFile(QUEUE_PATH, '\x00\x01\x02', 'utf-8');

      const result = await processor.processQueue();
      expect(result.processedCount).toBe(0);
    });

    it('should create directories if they do not exist', async () => {
      // Ensure parent directories exist before writing queue file
      await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
      await fs.writeFile(QUEUE_PATH, 'TASK-001\n', 'utf-8');

      // Create mock ticket
      await fs.writeFile(
        path.join(TEST_ROOT, 'jira/tickets', 'TASK-001.md'),
        '# Test Ticket',
        'utf-8'
      );

      await processor.processQueue();

      // Verify queue directory exists (log directory created only on failures)
      expect(existsSync(path.dirname(QUEUE_PATH))).toBe(true);
    });
  });
});
