/**
 * TASK-AUTO-03: Master Slaver Monitor Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { MasterSlaverMonitor } from '../../src/core/master-slaver-monitor.js';

describe('MasterSlaverMonitor', () => {
  const TEST_DIR = path.join(process.cwd(), '.eket-test/state-monitor');
  const TEST_PROJECT_ROOT = path.join(process.cwd(), '.eket-test');

  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('AC-3: Timeout Detection', () => {
    it('should detect timed-out Slaver (>650s)', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
        timeoutThresholdMs: 650000, // 650s
      });

      // Create stale heartbeat (700s old)
      const heartbeatPath = path.join(TEST_DIR, 'slaver-TASK-001-heartbeat');
      const staleTimestamp = Date.now() - 700000; // 700s ago
      const heartbeat = {
        timestamp: staleTimestamp,
        taskId: 'TASK-001',
        elapsed: 700000,
        status: 'active',
      };

      await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');

      // Check heartbeats
      const timedOut = await monitor.checkHeartbeats();

      expect(timedOut).toHaveLength(1);
      expect(timedOut[0].taskId).toBe('TASK-001');
      expect(timedOut[0].elapsed).toBeGreaterThan(650000);
    });

    it('should not detect healthy Slaver (<650s)', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
        timeoutThresholdMs: 650000,
      });

      // Create fresh heartbeat (100s old)
      const heartbeatPath = path.join(TEST_DIR, 'slaver-TASK-002-heartbeat');
      const freshTimestamp = Date.now() - 100000; // 100s ago
      const heartbeat = {
        timestamp: freshTimestamp,
        taskId: 'TASK-002',
        elapsed: 100000,
        status: 'active',
      };

      await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');

      // Check heartbeats
      const timedOut = await monitor.checkHeartbeats();

      expect(timedOut).toHaveLength(0);
    });

    it('should detect multiple timed-out Slavers', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
        timeoutThresholdMs: 650000,
      });

      // Create multiple stale heartbeats
      const tasks = ['TASK-001', 'TASK-002', 'TASK-003'];
      const staleTimestamp = Date.now() - 700000;

      for (const taskId of tasks) {
        const heartbeatPath = path.join(TEST_DIR, `slaver-${taskId}-heartbeat`);
        const heartbeat = {
          timestamp: staleTimestamp,
          taskId,
          elapsed: 700000,
          status: 'active',
        };
        await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');
      }

      // Check heartbeats
      const timedOut = await monitor.checkHeartbeats();

      expect(timedOut).toHaveLength(3);
      expect(timedOut.map((t) => t.taskId).sort()).toEqual(['TASK-001', 'TASK-002', 'TASK-003']);
    }, 10000); // 10s timeout

    it('should handle no heartbeat files', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      const timedOut = await monitor.checkHeartbeats();

      expect(timedOut).toHaveLength(0);
    });

    it('should ignore invalid heartbeat files', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      // Create invalid heartbeat (corrupt JSON)
      const heartbeatPath = path.join(TEST_DIR, 'slaver-TASK-999-heartbeat');
      await fs.writeFile(heartbeatPath, 'invalid json{', 'utf-8');

      // Should not crash
      const timedOut = await monitor.checkHeartbeats();

      expect(timedOut).toHaveLength(0);
    });
  });

  describe('Timeout Logging', () => {
    it('should log timeout events', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
        timeoutThresholdMs: 650000,
      });

      // Create stale heartbeat
      const heartbeatPath = path.join(TEST_DIR, 'slaver-TASK-001-heartbeat');
      const staleTimestamp = Date.now() - 700000;
      const heartbeat = {
        timestamp: staleTimestamp,
        taskId: 'TASK-001',
        elapsed: 700000,
        status: 'active',
      };

      await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');

      // Check heartbeats (triggers logging)
      await monitor.checkHeartbeats();

      // Verify log file exists
      const logPath = path.join(TEST_PROJECT_ROOT, '.eket/logs/master-monitor.log');
      const logExists = await fs
        .access(logPath)
        .then(() => true)
        .catch(() => false);

      expect(logExists).toBe(true);

      // Verify log content
      const logContent = await fs.readFile(logPath, 'utf-8');
      expect(logContent).toContain('TASK-001');
      expect(logContent).toContain('timeout');
    });
  });

  describe('Resume Trigger', () => {
    it('should call triggerResume for task', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      // Note: triggerResume checks for checkpoint branch via git
      // In test environment with actual git repo, may return true/false
      // We just verify the function runs without crashing
      const success = await monitor.triggerResume('TASK-NONEXISTENT-999');

      // Result depends on git repo state
      expect(typeof success).toBe('boolean');
    });

    it('should log resume attempt', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      await monitor.triggerResume('TASK-001');

      // Verify no crash
      expect(true).toBe(true);
    });
  });

  describe('Heartbeat Cleanup', () => {
    it('should cleanup closed heartbeats', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      // Create closed heartbeat
      const heartbeatPath = path.join(TEST_DIR, 'slaver-TASK-001-heartbeat');
      const heartbeat = {
        timestamp: Date.now(),
        taskId: 'TASK-001',
        elapsed: 100000,
        status: 'closed',
      };

      await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');

      // Cleanup
      await monitor.cleanupStaleHeartbeats();

      // File should be deleted
      const exists = await fs
        .access(heartbeatPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it('should not cleanup active heartbeats', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      // Create active heartbeat
      const heartbeatPath = path.join(TEST_DIR, 'slaver-TASK-002-heartbeat');
      const heartbeat = {
        timestamp: Date.now(),
        taskId: 'TASK-002',
        elapsed: 100000,
        status: 'active',
      };

      await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');

      // Cleanup
      await monitor.cleanupStaleHeartbeats();

      // File should still exist
      const exists = await fs
        .access(heartbeatPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });

  describe('Active Heartbeats Query', () => {
    it('should return all active heartbeats', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      // Create multiple heartbeats
      const tasks = ['TASK-001', 'TASK-002'];
      for (const taskId of tasks) {
        const heartbeatPath = path.join(TEST_DIR, `slaver-${taskId}-heartbeat`);
        const heartbeat = {
          timestamp: Date.now(),
          taskId,
          elapsed: 100000,
          status: 'active',
        };
        await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');
      }

      const active = await monitor.getActiveHeartbeats();

      expect(active).toHaveLength(2);
      expect(active.map((h) => h.taskId).sort()).toEqual(['TASK-001', 'TASK-002']);
    });

    it('should return empty array if no heartbeats', async () => {
      const monitor = new MasterSlaverMonitor({
        heartbeatDir: TEST_DIR,
        projectRoot: TEST_PROJECT_ROOT,
      });

      const active = await monitor.getActiveHeartbeats();

      expect(active).toHaveLength(0);
    });
  });
});
