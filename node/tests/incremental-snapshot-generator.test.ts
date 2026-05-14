/**
 * TASK-633: Incremental Snapshot Generator Tests
 */

import { mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IncrementalSnapshotGenerator } from '../src/core/incremental-snapshot-generator.js';

const TEST_DIR = 'test-snapshots-tmp';

describe('IncrementalSnapshotGenerator', () => {
  let generator: IncrementalSnapshotGenerator;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    generator = new IncrementalSnapshotGenerator({
      snapshotDir: TEST_DIR,
      maxSnapshots: 10,
      maxSizeBytes: 500 * 1024,
    });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('generate', () => {
    it('should create snapshot file with correct structure', () => {
      const result = generator.generate({
        taskId: 'TASK-633',
        turnCount: 5,
        estimatedTokens: 120000,
        criticalFiles: ['src/core/context-monitor.ts', 'jira/tickets/TASK-633.md'],
        lastMessages: ['Message 1', 'Message 2', 'Message 3'],
      });

      expect(result.success).toBe(true);
      expect(result.data?.filePath).toContain(TEST_DIR);
      expect(result.data?.sizeBytes).toBeLessThan(500 * 1024);
      expect(existsSync(result.data!.filePath)).toBe(true);
    });

    it('should reject snapshot exceeding 500KB', () => {
      const hugeMessages = Array(10000).fill('x'.repeat(100));

      const result = generator.generate({
        taskId: 'TASK-HUGE',
        turnCount: 1,
        estimatedTokens: 150000,
        criticalFiles: [],
        lastMessages: hugeMessages,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('exceeds size limit');
    });

    it('should create directory if not exists', () => {
      expect(existsSync(TEST_DIR)).toBe(false);

      const result = generator.generate({
        taskId: 'TASK-AUTO',
        turnCount: 1,
        estimatedTokens: 100000,
        criticalFiles: [],
        lastMessages: [],
      });

      expect(result.success).toBe(true);
      expect(existsSync(TEST_DIR)).toBe(true);
    });
  });

  describe('cleanup - LRU', () => {
    it('should keep only 10 most recent snapshots after explicit cleanup', () => {
      // Create 15 snapshots manually (without using generator's auto-cleanup)
      mkdirSync(TEST_DIR, { recursive: true });

      const baseTime = Date.now();
      for (let i = 0; i < 15; i++) {
        const timestamp = baseTime + i * 1000;
        const filePath = join(TEST_DIR, `${timestamp}.json`);
        writeFileSync(
          filePath,
          JSON.stringify({
            timestamp,
            taskId: `TASK-${i}`,
            turnCount: i,
            estimatedTokens: 100000,
            criticalFiles: [],
            lastMessages: [],
          })
        );
      }

      // Verify 15 files created
      let files = readdirSync(TEST_DIR).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(15);

      // Now trigger cleanup
      const cleanupResult = generator.cleanup();
      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.data?.deletedCount).toBe(5);

      // Verify 10 files remain
      files = readdirSync(TEST_DIR).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(10);
    });

    it('should delete oldest snapshots first', () => {
      // Create 12 snapshots with controlled timestamps
      mkdirSync(TEST_DIR, { recursive: true });

      const baseTime = Date.now() - 60000; // 1 minute ago
      for (let i = 0; i < 12; i++) {
        const timestamp = baseTime + i * 1000; // 1 second apart
        const filePath = join(TEST_DIR, `${timestamp}.json`);
        writeFileSync(
          filePath,
          JSON.stringify({
            timestamp,
            taskId: `TASK-${i}`,
            turnCount: i,
            estimatedTokens: 100000,
            criticalFiles: [],
            lastMessages: [],
          })
        );
      }

      // Trigger cleanup
      const cleanupResult = generator.cleanup();
      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.data?.deletedCount).toBe(2);

      const remaining = readdirSync(TEST_DIR).filter(f => f.endsWith('.json'));
      expect(remaining.length).toBe(10);

      // Verify oldest 2 are deleted
      const oldestFile1 = `${baseTime}.json`;
      const oldestFile2 = `${baseTime + 1000}.json`;
      expect(remaining).not.toContain(oldestFile1);
      expect(remaining).not.toContain(oldestFile2);
    });

    it('should handle cleanup when directory does not exist', () => {
      const result = generator.cleanup();
      expect(result.success).toBe(true);
      expect(result.data?.deletedCount).toBe(0);
    });
  });

  describe('list', () => {
    it('should return empty array when no snapshots exist', () => {
      const result = generator.list();
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should list snapshots newest first', async () => {
      // Generate 3 snapshots with delays to ensure different mtimes
      const ids = ['TASK-A', 'TASK-B', 'TASK-C'];
      for (const id of ids) {
        generator.generate({
          taskId: id,
          turnCount: 1,
          estimatedTokens: 100000,
          criticalFiles: [],
          lastMessages: [],
        });
        // Small delay to ensure different mtime
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const result = generator.list();
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);

      // Verify newest first
      const timestamps = result.data!.map(s => s.createdAt);
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });
  });
});
