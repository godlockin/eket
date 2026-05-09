/**
 * Tests for recovery-logger.ts (TASK-601)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logContextOverflow, saveTaskContext } from '../../src/core/recovery-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('recovery-logger', () => {
  const testRoot = path.join(__dirname, '../fixtures/test-project');

  beforeEach(async () => {
    // Clean up test directories
    await fs.rm(testRoot, { recursive: true, force: true });
    await fs.mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  describe('logContextOverflow', () => {
    test('should create log file and append entry', async () => {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'compact_retry',
        result: 'recovered',
        projectRoot: testRoot,
        sessionId: 'test-session-1',
        taskId: 'TASK-601',
      });

      const logPath = path.join(testRoot, '.eket/logs/context-overflow.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      expect(logContent).toContain('sessionId=test-session-1');
      expect(logContent).toContain('taskId=TASK-601');
      expect(logContent).toContain('error_type=context_length_exceeded');
      expect(logContent).toContain('recovery=compact_retry');
      expect(logContent).toContain('result=recovered');
    });

    test('should append multiple entries', async () => {
      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'detected',
        result: 'initiating',
        projectRoot: testRoot,
        taskId: 'TASK-601',
      });

      await logContextOverflow({
        errorType: 'context_length_exceeded',
        recoveryStrategy: 'nuclear_restart',
        result: 'recovered',
        projectRoot: testRoot,
        taskId: 'TASK-601',
      });

      const logPath = path.join(testRoot, '.eket/logs/context-overflow.log');
      const logContent = await fs.readFile(logPath, 'utf-8');
      const lines = logContent.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('recovery=detected');
      expect(lines[1]).toContain('recovery=nuclear_restart');
    });

    test('should include timestamp in ISO format', async () => {
      await logContextOverflow({
        errorType: 'invalid_request_error',
        recoveryStrategy: 'none',
        result: 'rejected',
        projectRoot: testRoot,
      });

      const logPath = path.join(testRoot, '.eket/logs/context-overflow.log');
      const logContent = await fs.readFile(logPath, 'utf-8');

      // Check ISO 8601 timestamp format
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('saveTaskContext', () => {
    test('should create recovery context file', async () => {
      await saveTaskContext({
        projectRoot: testRoot,
        taskId: 'TASK-601',
        prompt: 'Implement context overflow recovery',
      });

      const recoveryPath = path.join(testRoot, '.eket/recovery/task-TASK-601-context.md');
      const content = await fs.readFile(recoveryPath, 'utf-8');

      expect(content).toContain('**Task ID**: TASK-601');
      expect(content).toContain('Implement context overflow recovery');
      expect(content).toContain('Context overflow (200k tokens exceeded)');
      expect(content).toContain('jira/tickets/EPIC-006/TASK-601');
    });

    test('should include timestamp', async () => {
      await saveTaskContext({
        projectRoot: testRoot,
        taskId: 'TASK-601',
        prompt: 'Test prompt',
      });

      const recoveryPath = path.join(testRoot, '.eket/recovery/task-TASK-601-context.md');
      const content = await fs.readFile(recoveryPath, 'utf-8');

      expect(content).toMatch(/\*\*Timestamp\*\*: \d{4}-\d{2}-\d{2}T/);
    });

    test('should handle unknown task ID', async () => {
      await saveTaskContext({
        projectRoot: testRoot,
        taskId: 'unknown',
        prompt: 'Some task',
      });

      const recoveryPath = path.join(testRoot, '.eket/recovery/task-unknown-context.md');
      const exists = await fs
        .access(recoveryPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });
});
