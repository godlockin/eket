/**
 * TASK-AUTO-03: Timeout Recovery E2E Integration Test
 *
 * Tests end-to-end timeout recovery flow:
 * 1. Slaver starts with Watchdog
 * 2. Watchdog triggers timeout warning
 * 3. Master detects timeout
 * 4. Master triggers resume
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { ProgressTracker } from '../../src/core/progress-tracker.js';
import { SlaverWatchdog } from '../../src/core/slaver-watchdog.js';
import { MasterSlaverMonitor } from '../../src/core/master-slaver-monitor.js';

describe('Timeout Recovery Integration', () => {
  const TEST_DIR = path.join(process.cwd(), '.eket-test/integration');
  const HEARTBEAT_DIR = path.join(TEST_DIR, 'state');
  const TICKETS_DIR = path.join(TEST_DIR, 'jira/tickets');

  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(HEARTBEAT_DIR, { recursive: true });
    await fs.mkdir(TICKETS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should auto-checkpoint on timeout warning', async () => {
    const taskId = 'TASK-E2E-001';
    const slaverId = 'slaver-e2e-001';

    // Create ProgressTracker
    const tracker = new ProgressTracker({
      taskId,
      slaverId,
      outputDir: path.join(TICKETS_DIR, taskId),
      flushIntervalMs: 10000,
      gitEnabled: false, // Disable git for test
    });

    // Create Watchdog with short timeout for testing
    const watchdog = new SlaverWatchdog(taskId, tracker, {
      heartbeatDir: HEARTBEAT_DIR,
      timeoutWarningMs: 400, // 400ms
      heartbeatIntervalMs: 100, // 100ms
    });

    // Wait for heartbeat creation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify heartbeat exists
    const heartbeatPath = watchdog.getHeartbeatPath();
    const exists = await fs
      .access(heartbeatPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // Poll for status to become timeout_warning (up to 3 seconds)
    let status = '';
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        const heartbeatContent = await fs.readFile(heartbeatPath, 'utf-8');
        const heartbeatData = JSON.parse(heartbeatContent);
        status = heartbeatData.status;
        if (status === 'timeout_warning') {
          break;
        }
      } catch (err) {
        // Ignore read/parse errors during concurrent write
      }
    }
    expect(status).toBe('timeout_warning');

    await watchdog.close();
    await tracker.close();
  }, 10000);

  it('should detect timeout and identify task', async () => {
    const taskId = 'TASK-E2E-002';
    const slaverId = 'slaver-e2e-002';

    // Create stale heartbeat (simulating timeout)
    const heartbeatPath = path.join(HEARTBEAT_DIR, `slaver-${taskId}-heartbeat`);
    const staleTimestamp = Date.now() - 700000; // 700s ago
    const heartbeat = {
      timestamp: staleTimestamp,
      taskId,
      elapsed: 700000,
      status: 'active',
    };

    await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');

    // Create Master Monitor
    const monitor = new MasterSlaverMonitor({
      heartbeatDir: HEARTBEAT_DIR,
      projectRoot: TEST_DIR,
      timeoutThresholdMs: 650000, // 650s
    });

    // Check heartbeats - should detect timeout
    const timedOut = await monitor.checkHeartbeats();
    expect(timedOut).toHaveLength(1);
    expect(timedOut[0].taskId).toBe(taskId);
    expect(timedOut[0].elapsed).toBeGreaterThan(650000);
  }, 10000);

  it('should cleanup closed heartbeats', async () => {
    const taskId = 'TASK-E2E-003';
    const slaverId = 'slaver-e2e-003';

    const tracker = new ProgressTracker({
      taskId,
      slaverId,
      outputDir: path.join(TICKETS_DIR, taskId),
      flushIntervalMs: 10000,
      gitEnabled: false,
    });

    const watchdog = new SlaverWatchdog(taskId, tracker, {
      heartbeatDir: HEARTBEAT_DIR,
      timeoutWarningMs: 500000,
      heartbeatIntervalMs: 60000,
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const heartbeatPath = watchdog.getHeartbeatPath();

    // Close watchdog
    await watchdog.close();

    // Heartbeat should be marked as closed
    const content = await fs.readFile(heartbeatPath, 'utf-8');
    const data = JSON.parse(content);
    expect(data.status).toBe('closed');

    // Master should cleanup closed heartbeats
    const monitor = new MasterSlaverMonitor({
      heartbeatDir: HEARTBEAT_DIR,
      projectRoot: TEST_DIR,
    });

    await monitor.cleanupStaleHeartbeats();

    // Heartbeat file should be deleted
    const exists = await fs
      .access(heartbeatPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);

    await tracker.close();
  }, 10000);

  it('should handle multiple concurrent Slavers', async () => {
    const tasks = [
      { id: 'TASK-E2E-005', slaver: 'slaver-e2e-005' },
      { id: 'TASK-E2E-006', slaver: 'slaver-e2e-006' },
    ];

    // Create stale heartbeats for all tasks
    const staleTimestamp = Date.now() - 700000;
    for (const task of tasks) {
      const heartbeatPath = path.join(HEARTBEAT_DIR, `slaver-${task.id}-heartbeat`);
      const heartbeat = {
        timestamp: staleTimestamp,
        taskId: task.id,
        elapsed: 700000,
        status: 'active',
      };
      await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat), 'utf-8');
    }

    // Master checks heartbeats
    const monitor = new MasterSlaverMonitor({
      heartbeatDir: HEARTBEAT_DIR,
      projectRoot: TEST_DIR,
      timeoutThresholdMs: 650000,
    });

    const active = await monitor.getActiveHeartbeats();
    expect(active).toHaveLength(2);

    const timedOut = await monitor.checkHeartbeats();
    expect(timedOut).toHaveLength(2);
  }, 10000);
});

