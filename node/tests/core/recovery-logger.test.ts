/**
 * recovery-logger.test.ts
 *
 * Tests for context overflow logging and recovery (AC-5, AC-6)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logContextOverflow, saveTaskContext } from '../../src/core/recovery-logger.js';

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
});
