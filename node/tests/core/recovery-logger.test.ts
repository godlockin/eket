/**
 * recovery-logger.test.ts
 *
 * Tests for context overflow logging and recovery (AC-5, AC-6)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logContextOverflow, saveTaskContext, saveSessionSnapshot } from '../../src/core/recovery-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PROJECT_ROOT = path.join(__dirname, '../__fixtures__/test-recovery');

describe('recovery-logger', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_PROJECT_ROOT, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_PROJECT_ROOT, { recursive: true, force: true });
  });

  describe('logContextOverflow', () => {
    it('should create log file if not exists (AC-6)', async () => {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'detected',
        result: 'initiating',
        projectRoot: TEST_PROJECT_ROOT,
      });

      const logPath = path.join(TEST_PROJECT_ROOT, '.eket', 'logs', 'context-overflow.log');
      const exists = await fs
        .access(logPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it('should write log entry with all required fields (AC-6)', async () => {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'compact_retry',
        result: 'recovered',
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'test-session-123',
        taskId: 'TASK-601',
      });

      const logPath = path.join(TEST_PROJECT_ROOT, '.eket', 'logs', 'context-overflow.log');
      const content = await fs.readFile(logPath, 'utf-8');

      expect(content).toContain('sessionId=test-session-123');
      expect(content).toContain('taskId=TASK-601');
      expect(content).toContain('error_type=context_length_exceeded');
      expect(content).toContain('recovery=compact_retry');
      expect(content).toContain('result=recovered');
    });

    it('should append multiple log entries (AC-6)', async () => {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'detected',
        result: 'initiating',
        projectRoot: TEST_PROJECT_ROOT,
      });

      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'compact_retry',
        result: 'recovered',
        projectRoot: TEST_PROJECT_ROOT,
      });

      const logPath = path.join(TEST_PROJECT_ROOT, '.eket', 'logs', 'context-overflow.log');
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('recovery=detected');
      expect(lines[1]).toContain('recovery=compact_retry');
    });

    it('should log non-recoverable errors with recovery=none (AC-2)', async () => {
      await logContextOverflow({
        errorType: 'invalid_request_error',
        recoveryStrategy: 'none',
        result: 'rejected',
        projectRoot: TEST_PROJECT_ROOT,
      });

      const logPath = path.join(TEST_PROJECT_ROOT, '.eket', 'logs', 'context-overflow.log');
      const content = await fs.readFile(logPath, 'utf-8');

      expect(content).toContain('error_type=invalid_request_error');
      expect(content).toContain('recovery=none');
      expect(content).toContain('result=rejected');
    });

    it('should include ISO 8601 timestamp in log entries', async () => {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'detected',
        result: 'initiating',
        projectRoot: TEST_PROJECT_ROOT,
      });

      const logPath = path.join(TEST_PROJECT_ROOT, '.eket', 'logs', 'context-overflow.log');
      const content = await fs.readFile(logPath, 'utf-8');

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('saveTaskContext', () => {
    it('should create recovery directory if not exists (AC-5)', async () => {
      await saveTaskContext({
        projectRoot: TEST_PROJECT_ROOT,
        taskId: 'TASK-601',
        prompt: 'Test prompt',
      });

      const recoveryPath = path.join(TEST_PROJECT_ROOT, '.eket/recovery');
      const exists = await fs
        .access(recoveryPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it('should save task context with correct filename (AC-5)', async () => {
      await saveTaskContext({
        projectRoot: TEST_PROJECT_ROOT,
        taskId: 'TASK-601',
        prompt: 'Implement recovery mechanism',
      });

      const contextPath = path.join(TEST_PROJECT_ROOT, '.eket/recovery/task-TASK-601-context.md');
      const exists = await fs
        .access(contextPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it('should include all required fields in context file (AC-5)', async () => {
      await saveTaskContext({
        projectRoot: TEST_PROJECT_ROOT,
        taskId: 'TASK-601',
        prompt: 'Implement 400 auto-recovery',
      });

      const contextPath = path.join(TEST_PROJECT_ROOT, '.eket/recovery/task-TASK-601-context.md');
      const content = await fs.readFile(contextPath, 'utf-8');

      expect(content).toContain('**Task ID**: TASK-601');
      expect(content).toContain('**Timestamp**:');
      expect(content).toContain('Implement 400 auto-recovery');
      expect(content).toContain('jira/tickets/EPIC-006/TASK-601/');
    });

    it('should format prompt in code block (AC-5)', async () => {
      await saveTaskContext({
        projectRoot: TEST_PROJECT_ROOT,
        taskId: 'TASK-601',
        prompt: 'Multi-line\nprompt\ntext',
      });

      const contextPath = path.join(TEST_PROJECT_ROOT, '.eket/recovery/task-TASK-601-context.md');
      const content = await fs.readFile(contextPath, 'utf-8');

      expect(content).toContain('```\nMulti-line\nprompt\ntext\n```');
    });
  });

  describe('saveSessionSnapshot', () => {
    it('should create session-snapshots directory if not exists (TASK-603)', async () => {
      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'test-session-123',
        messages: [
          { role: 'user', timestamp: '2026-05-10T10:00:00Z', tokenEstimate: 150 },
          { role: 'assistant', timestamp: '2026-05-10T10:00:05Z', toolCalls: 2, tokenEstimate: 500 },
        ],
      });

      const snapshotDir = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots');
      const exists = await fs
        .access(snapshotDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it('should save snapshot with correct filename (TASK-603)', async () => {
      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'abc123',
        messages: [{ role: 'user', timestamp: '2026-05-10T10:00:00Z' }],
      });

      const snapshotPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots/abc123.json');
      const exists = await fs
        .access(snapshotPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it('should include all required fields in snapshot (TASK-603)', async () => {
      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'test-session',
        messages: [
          { role: 'user', timestamp: '2026-05-10T10:00:00Z', tokenEstimate: 150 },
          { role: 'assistant', timestamp: '2026-05-10T10:00:05Z', toolCalls: 2, tokenEstimate: 500 },
        ],
      });

      const snapshotPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots/test-session.json');
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);

      expect(snapshot.sessionId).toBe('test-session');
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.messageCount).toBe(2);
      expect(snapshot.messages).toHaveLength(2);
      expect(snapshot.messages[0].role).toBe('user');
      expect(snapshot.messages[1].toolCalls).toBe(2);
    });

    it('should limit to last 20 messages (TASK-603)', async () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        timestamp: `2026-05-10T10:${String(i).padStart(2, '0')}:00Z`,
        tokenEstimate: 100,
      }));

      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'large-session',
        messages,
      });

      const snapshotPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots/large-session.json');
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);

      expect(snapshot.messageCount).toBe(20);
      expect(snapshot.messages).toHaveLength(20);
      // Should be the last 20 messages (index 10-29)
      expect(snapshot.messages[0].timestamp).toBe('2026-05-10T10:10:00Z');
      expect(snapshot.messages[19].timestamp).toBe('2026-05-10T10:29:00Z');
    });

    it('should handle empty messages array (TASK-603)', async () => {
      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'empty-session',
        messages: [],
      });

      const snapshotPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots/empty-session.json');
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);

      expect(snapshot.messageCount).toBe(0);
      expect(snapshot.messages).toHaveLength(0);
    });

    it('should truncate snapshot if exceeds 10MB (TASK-603)', async () => {
      // Create messages that will exceed 10MB
      const largeMessages = Array.from({ length: 20 }, (_, i) => ({
        role: 'assistant' as const,
        timestamp: `2026-05-10T10:${String(i).padStart(2, '0')}:00Z`,
        // Each message ~600KB content (20 messages * 600KB > 10MB)
        tokenEstimate: 100000,
        content: 'x'.repeat(600 * 1024),
      }));

      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'huge-session',
        messages: largeMessages,
      });

      const snapshotPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots/huge-session.json');
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);

      // Should be truncated to last 10 messages or minimal metadata
      expect(snapshot.messageCount).toBeLessThanOrEqual(20);

      // File size should be under 10MB
      const stats = await fs.stat(snapshotPath);
      expect(stats.size).toBeLessThan(10 * 1024 * 1024);
    });

    it('should save minimal metadata if still too large after truncation (TASK-603)', async () => {
      // Create messages with extremely large content (>10MB even for 10 messages)
      const extremeMessages = Array.from({ length: 20 }, (_, i) => ({
        role: 'assistant' as const,
        timestamp: `2026-05-10T10:${String(i).padStart(2, '0')}:00Z`,
        tokenEstimate: 200000,
        content: 'y'.repeat(2 * 1024 * 1024), // 2MB per message
      }));

      await saveSessionSnapshot({
        projectRoot: TEST_PROJECT_ROOT,
        sessionId: 'extreme-session',
        messages: extremeMessages,
      });

      const snapshotPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/session-snapshots/extreme-session.json');
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);

      // Should contain minimal metadata only
      expect(snapshot.sessionId).toBe('extreme-session');
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.messageCount).toBe(20);
      expect(snapshot.error).toContain('Snapshot too large');

      // File size should be minimal (< 1KB)
      const stats = await fs.stat(snapshotPath);
      expect(stats.size).toBeLessThan(1024);
    });
  });
});
