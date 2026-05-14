/**
 * Tests for ContextAlert system
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContextAlert, AlertContext } from '../src/core/context-alert';
import { existsSync, readFileSync, unlinkSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_INBOX_DIR = '.eket/inbox';
const TEST_STATE_FILE = '.eket/state/alerted-tasks.json';

describe('ContextAlert', () => {
  let alert: ContextAlert;

  beforeEach(() => {
    alert = new ContextAlert();
    // Clean up any existing test artifacts
    cleanupTestFiles();
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  describe('alertMaster', () => {
    it('should skip alert when tokens below threshold', async () => {
      const context: AlertContext = {
        taskId: 'TASK-001',
        tokens: 100000, // Below 150K
        turnCount: 10,
        timestamp: new Date().toISOString()
      };

      const result = await alert.alertMaster(context);

      expect(result).toBe(false);
      expect(existsSync(join(TEST_INBOX_DIR, 'context-risk-TASK-001.md'))).toBe(false);
    });

    it('should create alert when tokens above threshold', async () => {
      const context: AlertContext = {
        taskId: 'TASK-002',
        tokens: 152000, // Above 150K
        turnCount: 25,
        timestamp: '2026-05-13T10:30:00Z'
      };

      const result = await alert.alertMaster(context);

      expect(result).toBe(true);

      const alertFile = join(TEST_INBOX_DIR, 'context-risk-TASK-002.md');
      expect(existsSync(alertFile)).toBe(true);

      const content = readFileSync(alertFile, 'utf-8');
      expect(content).toContain('# Context Risk Alert: TASK-002');
      expect(content).toContain('**Tokens**: 152,000');
      expect(content).toContain('**Turn Count**: 25');
      expect(content).toContain('**Timestamp**: 2026-05-13T10:30:00Z');
      expect(content).toContain('## Recommendation');
    });

    it('should deduplicate alerts for same task', async () => {
      const context: AlertContext = {
        taskId: 'TASK-003',
        tokens: 155000,
        turnCount: 30,
        timestamp: new Date().toISOString()
      };

      // First alert - should succeed
      const firstResult = await alert.alertMaster(context);
      expect(firstResult).toBe(true);

      // Second alert - should be skipped (duplicate)
      const secondResult = await alert.alertMaster(context);
      expect(secondResult).toBe(false);

      // Only one alert file should exist
      const alertFile = join(TEST_INBOX_DIR, 'context-risk-TASK-003.md');
      expect(existsSync(alertFile)).toBe(true);
    });

    it('should record alert in state file', async () => {
      const context: AlertContext = {
        taskId: 'TASK-004',
        tokens: 160000,
        timestamp: new Date().toISOString()
      };

      await alert.alertMaster(context);

      expect(existsSync(TEST_STATE_FILE)).toBe(true);

      const stateContent = readFileSync(TEST_STATE_FILE, 'utf-8');
      const records = JSON.parse(stateContent);

      expect(records).toHaveLength(1);
      expect(records[0].taskId).toBe('TASK-004');
      expect(records[0].alertedAt).toBeDefined();
    });

    it('should handle missing turnCount gracefully', async () => {
      const context: AlertContext = {
        taskId: 'TASK-005',
        tokens: 151000,
        timestamp: new Date().toISOString()
        // turnCount omitted
      };

      const result = await alert.alertMaster(context);

      expect(result).toBe(true);

      const alertFile = join(TEST_INBOX_DIR, 'context-risk-TASK-005.md');
      const content = readFileSync(alertFile, 'utf-8');
      expect(content).toContain('**Turn Count**: N/A');
    });

    it('should create inbox directory if missing', async () => {
      // Ensure inbox doesn't exist
      if (existsSync(TEST_INBOX_DIR)) {
        rmSync(TEST_INBOX_DIR, { recursive: true });
      }

      const context: AlertContext = {
        taskId: 'TASK-006',
        tokens: 153000,
        timestamp: new Date().toISOString()
      };

      await alert.alertMaster(context);

      expect(existsSync(TEST_INBOX_DIR)).toBe(true);
      expect(existsSync(join(TEST_INBOX_DIR, 'context-risk-TASK-006.md'))).toBe(true);
    });

    it('should create state directory if missing', async () => {
      // Ensure state dir doesn't exist
      const stateDir = '.eket/state';
      if (existsSync(stateDir)) {
        rmSync(stateDir, { recursive: true, force: true });
      }

      const context: AlertContext = {
        taskId: 'TASK-007',
        tokens: 154000,
        timestamp: new Date().toISOString()
      };

      await alert.alertMaster(context);

      expect(existsSync(TEST_STATE_FILE)).toBe(true);
    });
  });

  describe('clearAlertHistory', () => {
    it('should clear all alerts when no taskId specified', async () => {
      // Create multiple alerts
      await alert.alertMaster({
        taskId: 'TASK-010',
        tokens: 155000,
        timestamp: new Date().toISOString()
      });
      await alert.alertMaster({
        taskId: 'TASK-011',
        tokens: 156000,
        timestamp: new Date().toISOString()
      });

      // Clear all
      alert.clearAlertHistory();

      const stateContent = readFileSync(TEST_STATE_FILE, 'utf-8');
      const records = JSON.parse(stateContent);
      expect(records).toHaveLength(0);
    });

    it('should clear specific task alert', async () => {
      // Create multiple alerts
      await alert.alertMaster({
        taskId: 'TASK-020',
        tokens: 155000,
        timestamp: new Date().toISOString()
      });
      await alert.alertMaster({
        taskId: 'TASK-021',
        tokens: 156000,
        timestamp: new Date().toISOString()
      });

      // Clear only TASK-020
      alert.clearAlertHistory('TASK-020');

      const stateContent = readFileSync(TEST_STATE_FILE, 'utf-8');
      const records = JSON.parse(stateContent);
      expect(records).toHaveLength(1);
      expect(records[0].taskId).toBe('TASK-021');
    });

    it('should handle missing state file gracefully', () => {
      // Should not throw even if state file doesn't exist
      expect(() => alert.clearAlertHistory()).not.toThrow();
      expect(() => alert.clearAlertHistory('TASK-999')).not.toThrow();
    });
  });
});

/**
 * Clean up test artifacts
 */
function cleanupTestFiles(): void {
  // Clean inbox alert files
  if (existsSync(TEST_INBOX_DIR)) {
    const files = [
      'context-risk-TASK-001.md',
      'context-risk-TASK-002.md',
      'context-risk-TASK-003.md',
      'context-risk-TASK-004.md',
      'context-risk-TASK-005.md',
      'context-risk-TASK-006.md',
      'context-risk-TASK-007.md',
      'context-risk-TASK-010.md',
      'context-risk-TASK-011.md',
      'context-risk-TASK-020.md',
      'context-risk-TASK-021.md'
    ];

    for (const file of files) {
      const path = join(TEST_INBOX_DIR, file);
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  }

  // Clean state file
  if (existsSync(TEST_STATE_FILE)) {
    unlinkSync(TEST_STATE_FILE);
  }
}
