/**
 * Tests for AlertManager (TASK-607)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { AlertManager } from '../../src/core/alert-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AlertManager', () => {
  const testRoot = path.join(__dirname, '..', '..', '.test-temp', 'alert-manager');
  const alertDir = path.join(testRoot, 'inbox', 'human_feedback');

  let alertManager: AlertManager;

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testRoot, { recursive: true, force: true });
    await fs.mkdir(alertDir, { recursive: true });

    // Create fresh instance
    alertManager = new AlertManager({
      projectRoot: testRoot,
      taskAlertThreshold: 3,
      systemAlertThreshold: 5,
    });
  });

  afterEach(async () => {
    // Clean up after tests
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  describe('Task-level alerts', () => {
    it('creates alert after 3 errors for the same task', async () => {
      const taskId = 'TASK-607';

      // Record 3 errors
      await alertManager.recordError(taskId, 150000);
      await alertManager.recordError(taskId, 160000);
      await alertManager.recordError(taskId, 170000);

      // Verify alert file created
      const alertPath = path.join(alertDir, `[ALERT] context-overflow-${taskId}.md`);
      const exists = await fs.access(alertPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Verify content
      const content = await fs.readFile(alertPath, 'utf-8');
      expect(content).toContain(`# 🚨 Context Overflow Alert: ${taskId}`);
      expect(content).toContain('**错误次数**: 3');
      expect(content).toContain('150,000, 160,000, 170,000');
    });

    it('does not create alert before threshold is met', async () => {
      const taskId = 'TASK-607';

      // Record only 2 errors
      await alertManager.recordError(taskId, 150000);
      await alertManager.recordError(taskId, 160000);

      // Verify NO alert file created
      const alertPath = path.join(alertDir, `[ALERT] context-overflow-${taskId}.md`);
      const exists = await fs.access(alertPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('updates existing alert instead of creating duplicates', async () => {
      const taskId = 'TASK-607';

      // Trigger initial alert (3 errors)
      await alertManager.recordError(taskId, 150000);
      await alertManager.recordError(taskId, 160000);
      await alertManager.recordError(taskId, 170000);

      // Trigger 4th error
      await alertManager.recordError(taskId, 180000);

      // Verify only ONE alert file exists
      const files = await fs.readdir(alertDir);
      const alertFiles = files.filter(f => f.includes(taskId));
      expect(alertFiles.length).toBe(1);

      // Verify count updated to 4
      const alertPath = path.join(alertDir, `[ALERT] context-overflow-${taskId}.md`);
      const content = await fs.readFile(alertPath, 'utf-8');
      expect(content).toContain('**错误次数**: 4');
    });

    it('tracks errors for multiple tasks independently', async () => {
      await alertManager.recordError('TASK-101', 150000);
      await alertManager.recordError('TASK-102', 160000);
      await alertManager.recordError('TASK-101', 155000);

      expect(alertManager.getErrorCount('TASK-101')).toBe(2);
      expect(alertManager.getErrorCount('TASK-102')).toBe(1);
    });

    it('clears task alert when task completes', async () => {
      const taskId = 'TASK-607';

      // Trigger alert
      await alertManager.recordError(taskId, 150000);
      await alertManager.recordError(taskId, 160000);
      await alertManager.recordError(taskId, 170000);

      // Verify alert exists
      const alertPath = path.join(alertDir, `[ALERT] context-overflow-${taskId}.md`);
      let exists = await fs.access(alertPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Clear alert
      await alertManager.clearTaskAlert(taskId);

      // Verify alert removed
      exists = await fs.access(alertPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);

      // Verify internal state cleaned
      expect(alertManager.getErrorCount(taskId)).toBe(0);
    });

    it('does not throw when clearing non-existent alert', async () => {
      // Should not throw
      await expect(alertManager.clearTaskAlert('TASK-NONEXISTENT')).resolves.toBeUndefined();
    });
  });

  describe('System-level alerts', () => {
    it('creates system alert after 5 global errors', async () => {
      // Trigger 5 errors across different tasks
      await alertManager.recordError('TASK-101', 150000);
      await alertManager.recordError('TASK-102', 160000);
      await alertManager.recordError('TASK-103', 170000);
      await alertManager.recordError('TASK-104', 180000);
      await alertManager.recordError('TASK-105', 190000);

      // Verify system alert created
      const systemAlertPath = path.join(alertDir, '[ALERT] context-system-critical.md');
      const exists = await fs.access(systemAlertPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Verify content
      const content = await fs.readFile(systemAlertPath, 'utf-8');
      expect(content).toContain('# 🚨 System Critical: Context Overflow Epidemic');
      expect(content).toContain('**全局错误数**: 5');
    });

    it('does not create system alert before threshold', async () => {
      // Only 4 errors
      await alertManager.recordError('TASK-101', 150000);
      await alertManager.recordError('TASK-102', 160000);
      await alertManager.recordError('TASK-103', 170000);
      await alertManager.recordError('TASK-104', 180000);

      const systemAlertPath = path.join(alertDir, '[ALERT] context-system-critical.md');
      const exists = await fs.access(systemAlertPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('tracks global count correctly across tasks', async () => {
      await alertManager.recordError('TASK-101', 150000);
      expect(alertManager.getGlobalErrorCount()).toBe(1);

      await alertManager.recordError('TASK-102', 160000);
      expect(alertManager.getGlobalErrorCount()).toBe(2);

      await alertManager.recordError('TASK-101', 155000); // Same task, 2nd error
      expect(alertManager.getGlobalErrorCount()).toBe(3);
    });
  });

  describe('Combined scenarios', () => {
    it('creates both task and system alerts when applicable', async () => {
      // TASK-101: 3 errors (triggers task alert)
      await alertManager.recordError('TASK-101', 150000);
      await alertManager.recordError('TASK-101', 160000);
      await alertManager.recordError('TASK-101', 170000);

      // Other tasks: 2 more errors (triggers system alert at 5 total)
      await alertManager.recordError('TASK-102', 180000);
      await alertManager.recordError('TASK-103', 190000);

      // Verify both alerts exist
      const taskAlertPath = path.join(alertDir, '[ALERT] context-overflow-TASK-101.md');
      const systemAlertPath = path.join(alertDir, '[ALERT] context-system-critical.md');

      const taskExists = await fs.access(taskAlertPath).then(() => true).catch(() => false);
      const systemExists = await fs.access(systemAlertPath).then(() => true).catch(() => false);

      expect(taskExists).toBe(true);
      expect(systemExists).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles 0 token estimates', async () => {
      await expect(alertManager.recordError('TASK-607', 0)).resolves.toBeUndefined();
      expect(alertManager.getErrorCount('TASK-607')).toBe(1);
    });

    it('handles very large token estimates', async () => {
      const largeTokens = 999_999_999;
      await alertManager.recordError('TASK-607', largeTokens);
      await alertManager.recordError('TASK-607', largeTokens);
      await alertManager.recordError('TASK-607', largeTokens);

      const alertPath = path.join(alertDir, '[ALERT] context-overflow-TASK-607.md');
      const content = await fs.readFile(alertPath, 'utf-8');
      expect(content).toContain('999,999,999');
    });

    it('handles empty task ID', async () => {
      await expect(alertManager.recordError('', 150000)).resolves.toBeUndefined();
      expect(alertManager.getErrorCount('')).toBe(1);
    });
  });

  describe('Reset functionality', () => {
    it('clears all state when reset', async () => {
      // Record some errors
      await alertManager.recordError('TASK-101', 150000);
      await alertManager.recordError('TASK-102', 160000);

      expect(alertManager.getErrorCount('TASK-101')).toBe(1);
      expect(alertManager.getGlobalErrorCount()).toBe(2);

      // Reset
      alertManager.reset();

      expect(alertManager.getErrorCount('TASK-101')).toBe(0);
      expect(alertManager.getGlobalErrorCount()).toBe(0);
    });
  });

  describe('Custom thresholds', () => {
    it('respects custom task alert threshold', async () => {
      const customManager = new AlertManager({
        projectRoot: testRoot,
        taskAlertThreshold: 2, // Lower threshold
        systemAlertThreshold: 10,
      });

      await customManager.recordError('TASK-607', 150000);
      await customManager.recordError('TASK-607', 160000);

      // Should trigger at 2 instead of 3
      const alertPath = path.join(alertDir, '[ALERT] context-overflow-TASK-607.md');
      const exists = await fs.access(alertPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('respects custom system alert threshold', async () => {
      const customManager = new AlertManager({
        projectRoot: testRoot,
        taskAlertThreshold: 3,
        systemAlertThreshold: 2, // Lower threshold
      });

      await customManager.recordError('TASK-101', 150000);
      await customManager.recordError('TASK-102', 160000);

      // Should trigger at 2 instead of 5
      const systemAlertPath = path.join(alertDir, '[ALERT] context-system-critical.md');
      const exists = await fs.access(systemAlertPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
});
