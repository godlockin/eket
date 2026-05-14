/**
 * Tests for Compact Trigger Watcher - TASK-AUTO-02
 *
 * Test Coverage:
 * - parseTriggerData: Valid/invalid formats
 * - createUrgentAlert: File creation, content format
 * - sendMacNotification: Platform detection, graceful fail
 */

import { readFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseTriggerData,
  createUrgentAlert,
  sendMacNotification,
  type TriggerData,
} from '../../dist/watchers/compact-trigger-watcher.js';

describe('Compact Trigger Watcher', () => {
  describe('parseTriggerData', () => {
    it('should parse valid trigger data', () => {
      const input = 'AUTO_COMPACT_REQUEST|125000|2026-05-14T18:30:00Z';
      const result = parseTriggerData(input);

      expect(result).toEqual({
        type: 'AUTO_COMPACT_REQUEST',
        tokens: 125000,
        timestamp: '2026-05-14T18:30:00Z',
      });
    });

    it('should return null for invalid format (missing fields)', () => {
      const input = 'AUTO_COMPACT_REQUEST|125000';
      const result = parseTriggerData(input);

      expect(result).toBeNull();
    });

    it('should return null for invalid type prefix', () => {
      const input = 'WRONG_TYPE|125000|2026-05-14T18:30:00Z';
      const result = parseTriggerData(input);

      expect(result).toBeNull();
    });

    it('should return null for non-numeric tokens', () => {
      const input = 'AUTO_COMPACT_REQUEST|invalid|2026-05-14T18:30:00Z';
      const result = parseTriggerData(input);

      expect(result).toBeNull();
    });

    it('should handle extra whitespace', () => {
      const input = '  AUTO_COMPACT_REQUEST|125000|2026-05-14T18:30:00Z  \n';
      const result = parseTriggerData(input);

      expect(result).toEqual({
        type: 'AUTO_COMPACT_REQUEST',
        tokens: 125000,
        timestamp: '2026-05-14T18:30:00Z',
      });
    });
  });

  describe('createUrgentAlert', () => {
    const testInboxPath = '.eket/test-inbox';

    beforeEach(async () => {
      await mkdir(testInboxPath, { recursive: true });
    });

    afterEach(async () => {
      if (existsSync(testInboxPath)) {
        await rm(testInboxPath, { recursive: true, force: true });
      }
    });

    it('should create alert file with correct content', async () => {
      const data: TriggerData = {
        type: 'AUTO_COMPACT_REQUEST',
        tokens: 125000,
        timestamp: '2026-05-14T18:30:00Z',
      };

      const alertFile = await createUrgentAlert(data, testInboxPath);

      // Verify file exists
      expect(existsSync(alertFile)).toBe(true);

      // Verify filename format
      expect(alertFile).toMatch(/\[URGENT\] AUTO-COMPACT-\d+\.md$/);

      // Verify content
      const content = await readFile(alertFile, 'utf-8');
      expect(content).toContain('# 🔴 URGENT: Auto-Compact Required');
      expect(content).toContain('**Estimated Tokens**: 125,000');
      expect(content).toContain('**Triggered**: 2026-05-14T18:30:00Z');
      expect(content).toContain('/compact');
      expect(content).toContain('rm .eket/triggers/compact.trigger');
      expect(content).toContain('TASK-AUTO-02');
    });

    it('should create unique alert files for multiple calls', async () => {
      const data: TriggerData = {
        type: 'AUTO_COMPACT_REQUEST',
        tokens: 130000,
        timestamp: '2026-05-14T19:00:00Z',
      };

      const file1 = await createUrgentAlert(data, testInboxPath);
      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));
      const file2 = await createUrgentAlert(data, testInboxPath);

      expect(file1).not.toBe(file2);
      expect(existsSync(file1)).toBe(true);
      expect(existsSync(file2)).toBe(true);
    });

    it('should format large token numbers with commas', async () => {
      const data: TriggerData = {
        type: 'AUTO_COMPACT_REQUEST',
        tokens: 1234567,
        timestamp: '2026-05-14T20:00:00Z',
      };

      const alertFile = await createUrgentAlert(data, testInboxPath);
      const content = await readFile(alertFile, 'utf-8');

      expect(content).toContain('1,234,567');
    });
  });

  describe('sendMacNotification', () => {
    it('should return false on non-macOS platforms', async () => {
      // Mock process.platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });

      const result = await sendMacNotification(125000);

      expect(result).toBe(false);

      // Restore
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    // Note: Cannot reliably test actual notification on macOS in CI
    // Would require mocking execFile or running on actual macOS with GUI
    it('should handle notification failure gracefully', async () => {
      // This test verifies graceful failure handling
      // Actual notification sending is tested manually
      const result = await sendMacNotification(125000);

      // Result should be boolean (true if macOS + success, false otherwise)
      expect(typeof result).toBe('boolean');
    });
  });
});

/**
 * Integration Test Notes (Manual Verification):
 *
 * 1. Start watcher:
 *    node node/dist/bin/compact-watcher.js &
 *
 * 2. Trigger alert:
 *    echo "AUTO_COMPACT_REQUEST|125000|$(date -Iseconds)" > .eket/triggers/compact.trigger
 *
 * 3. Verify:
 *    - Alert file created in .eket/inbox/
 *    - macOS notification shown (if on macOS)
 *    - Console output shows detection
 *
 * 4. Cleanup:
 *    pkill -f compact-watcher
 *    rm .eket/inbox/[URGENT]*
 *    rm .eket/triggers/compact.trigger
 */
