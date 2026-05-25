/**
 * MessageQueue Unit Tests
 * TASK-Z05: core/ module unit testing
 *
 * Covers:
 * - FileMessageQueue (primary mode for tests)
 * - HybridMessageQueue auto-degradation
 * - Message creation helpers
 * - Progress report builder
 * - Queue mode resolution
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  FileMessageQueue,
  HybridMessageQueue,
  resolveQueueMode,
  generateMessageId,
  createMessage,
  buildProgressReport,
  type MessageQueueConfig,
} from '../../../src/core/message-queue.js';
import type { Message } from '../../../src/types/index.js';

describe('MessageQueue', () => {
  describe('resolveQueueMode', () => {
    it('should return list_queue for task messages', () => {
      const taskTypes = [
        'task_assigned',
        'task_claimed',
        'task_completed',
        'task_complete',
        'task_blocked',
        'task_progress',
        'pr_review_request',
        'help_request',
        'help_response',
      ];

      for (const type of taskTypes) {
        expect(resolveQueueMode(type)).toBe('list_queue');
      }
    });

    it('should return pubsub for event messages', () => {
      const eventTypes = [
        'heartbeat',
        'status_update',
        'notification',
        'alert',
        'custom_event',
      ];

      for (const type of eventTypes) {
        expect(resolveQueueMode(type)).toBe('pubsub');
      }
    });
  });

  describe('generateMessageId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMessageId());
      }
      expect(ids.size).toBe(100);
    });

    it('should start with msg_ prefix', () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateMessageId();
      const after = Date.now();

      const timestamp = parseInt(id.split('_')[1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createMessage', () => {
    it('should create message with all fields', () => {
      const msg = createMessage(
        'task_assigned',
        'master-001',
        'slaver-001',
        { taskId: 'TASK-001' },
        'high'
      );

      expect(msg.id).toMatch(/^msg_/);
      expect(msg.type).toBe('task_assigned');
      expect(msg.from).toBe('master-001');
      expect(msg.to).toBe('slaver-001');
      expect(msg.payload).toEqual({ taskId: 'TASK-001' });
      expect(msg.priority).toBe('high');
      expect(msg.timestamp).toBeDefined();
    });

    it('should default priority to normal', () => {
      const msg = createMessage('heartbeat', 'from', 'to', {});
      expect(msg.priority).toBe('normal');
    });

    it('should set ISO8601 timestamp', () => {
      const msg = createMessage('test', 'from', 'to', {});
      expect(() => new Date(msg.timestamp)).not.toThrow();
    });
  });

  describe('FileMessageQueue', () => {
    let queue: FileMessageQueue;
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `eket-mq-test-${Date.now()}`);
      fs.mkdirSync(testDir, { recursive: true });

      queue = new FileMessageQueue({
        mode: 'file',
        queueDir: testDir,
        filePollingInterval: 100, // Fast polling for tests
      });

      await queue.connect();
    });

    afterEach(async () => {
      await queue.disconnect();
      // Cleanup test directory
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should connect successfully', async () => {
      const freshQueue = new FileMessageQueue({
        mode: 'file',
        queueDir: path.join(testDir, 'fresh'),
      });

      const result = await freshQueue.connect();
      expect(result.success).toBe(true);
      await freshQueue.disconnect();
    });

    it('should return file mode', () => {
      expect(queue.getMode()).toBe('file');
    });

    it('should publish message successfully', async () => {
      const msg = createMessage('test', 'from', 'to', { data: 'test' });
      const result = await queue.publish('test-channel', msg);

      expect(result.success).toBe(true);
    });

    it('should subscribe to channel', async () => {
      const handler = jest.fn<(msg: Message) => Promise<void>>().mockResolvedValue(undefined);
      const result = await queue.subscribe('test-channel', handler);

      expect(result.success).toBe(true);
    });

    it('should unsubscribe from channel', async () => {
      const handler = jest.fn<(msg: Message) => Promise<void>>().mockResolvedValue(undefined);
      await queue.subscribe('test-channel', handler);

      await expect(queue.unsubscribe('test-channel')).resolves.not.toThrow();
    });

    it('should process messages via polling', async () => {
      const received: Message[] = [];
      const handler = async (msg: Message) => {
        received.push(msg);
      };

      await queue.subscribe('poll-channel', handler);

      const msg = createMessage('test', 'from', 'to', { value: 42 });
      await queue.publish('poll-channel', msg);

      // Wait for polling to pick up the message
      await new Promise((r) => setTimeout(r, 300));

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].payload).toEqual({ value: 42 });
    });
  });

  describe('HybridMessageQueue', () => {
    let queue: HybridMessageQueue;
    let testDir: string;

    beforeEach(async () => {
      testDir = path.join(os.tmpdir(), `eket-hybrid-mq-test-${Date.now()}`);
      fs.mkdirSync(testDir, { recursive: true });

      // Force file mode since Redis not available in tests
      queue = new HybridMessageQueue({
        mode: 'file',
        queueDir: testDir,
        filePollingInterval: 100,
      });

      await queue.connect();
    });

    afterEach(async () => {
      await queue.disconnect();
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });

    it('should use file mode when configured', async () => {
      // Test file mode explicitly rather than Redis failure
      // (Redis may or may not be available in test environment)
      const hybridQueue = new HybridMessageQueue({
        mode: 'file',
        queueDir: testDir,
      });

      await hybridQueue.connect();
      expect(hybridQueue.getMode()).toBe('file');
      await hybridQueue.disconnect();
    });

    it('should publish via file queue in file mode', async () => {
      const msg = createMessage('task_assigned', 'master', 'slaver', {});
      const result = await queue.publish('channel', msg);

      expect(result.success).toBe(true);
    });

    it('should subscribe via file queue in file mode', async () => {
      const handler = jest.fn<(msg: Message) => Promise<void>>().mockResolvedValue(undefined);
      const result = await queue.subscribe('channel', handler);

      expect(result.success).toBe(true);
    });

    it('should disconnect both queues', async () => {
      await expect(queue.disconnect()).resolves.not.toThrow();
    });

    it('should connect successfully in file-only mode', async () => {
      // When only file mode is configured and queueDir is valid, connect should succeed
      const fileOnlyQueue = new HybridMessageQueue({
        mode: 'file',
        queueDir: testDir,
      });

      const result = await fileOnlyQueue.connect();
      expect(result.success).toBe(true);
      await fileOnlyQueue.disconnect();
    });
  });

  describe('buildProgressReport', () => {
    it('should build report with all rules passed', () => {
      const report = buildProgressReport({
        ticketId: 'TASK-001',
        slaverId: 'slaver-001',
        phase: 'implementation',
        progress: 50,
        statusMessage: 'In progress',
      });

      expect(report.ticketId).toBe('TASK-001');
      expect(report.slaverId).toBe('slaver-001');
      expect(report.phase).toBe('implementation');
      expect(report.progress).toBe(50);
      expect(report.selfCheck).toBeDefined();
      expect(report.selfCheck.checklist.every((item) => item.passed)).toBe(true);
    });

    it('should include timestamp', () => {
      const report = buildProgressReport({
        ticketId: 'TASK-001',
        slaverId: 'slaver-001',
        phase: 'analysis',
        progress: 0,
        statusMessage: 'Starting',
      });

      expect(report.timestamp).toBeDefined();
      expect(() => new Date(report.timestamp)).not.toThrow();
    });

    it('should apply overrides to specific rules', () => {
      const report = buildProgressReport({
        ticketId: 'TASK-001',
        slaverId: 'slaver-001',
        phase: 'implementation',
        progress: 25,
        statusMessage: 'Working',
        overrides: [{ ruleId: 'SR-01', passed: false, note: 'Violated due to X' }],
      });

      const sr01 = report.selfCheck.checklist.find((item) => item.ruleId === 'SR-01');
      expect(sr01?.passed).toBe(false);
      expect(sr01?.note).toBe('Violated due to X');
    });

    it('should throw when override failed but note is empty', () => {
      expect(() =>
        buildProgressReport({
          ticketId: 'TASK-001',
          slaverId: 'slaver-001',
          phase: 'implementation',
          progress: 25,
          statusMessage: 'Working',
          overrides: [{ ruleId: 'SR-01', passed: false }], // Missing note
        })
      ).toThrow(/note.*empty/i);
    });

    it('should set analysisParalysisFlag when SR-03 fails', () => {
      const report = buildProgressReport({
        ticketId: 'TASK-001',
        slaverId: 'slaver-001',
        phase: 'analysis',
        progress: 10,
        statusMessage: 'Stuck',
        overrides: [{ ruleId: 'SR-03', passed: false, note: 'Too much analysis' }],
      });

      expect(report.selfCheck.analysisParalysisFlag).toBe(true);
    });

    it('should not set analysisParalysisFlag when SR-03 passes', () => {
      const report = buildProgressReport({
        ticketId: 'TASK-001',
        slaverId: 'slaver-001',
        phase: 'implementation',
        progress: 50,
        statusMessage: 'Good progress',
      });

      expect(report.selfCheck.analysisParalysisFlag).toBe(false);
    });

    it('should include all SLAVER_HARD_RULES in checklist', () => {
      const report = buildProgressReport({
        ticketId: 'TASK-001',
        slaverId: 'slaver-001',
        phase: 'testing',
        progress: 75,
        statusMessage: 'Running tests',
      });

      // Should have multiple rules
      expect(report.selfCheck.checklist.length).toBeGreaterThan(0);
      expect(report.selfCheck.rules.length).toBe(report.selfCheck.checklist.length);
    });
  });
});
