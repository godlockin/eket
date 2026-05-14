/**
 * Tests for IOActivityMonitor
 */

import { IOActivityMonitor, HangReport } from '../../src/core/io-activity-monitor.js';

describe('IOActivityMonitor', () => {
  describe('basic functionality', () => {
    it('should start and stop monitoring', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      await monitor.start();
      expect(monitor.getIdleDurationSec()).toBeLessThan(2);

      await monitor.stop();
    });

    it('should record activity and reset idle time', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      await monitor.start();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Record activity
      monitor.recordActivity();

      // Idle duration should be near 0
      expect(monitor.getIdleDurationSec()).toBeLessThan(2);

      await monitor.stop();
    });
  });

  describe('hang detection', () => {
    it('should trigger hang callback after timeout', async () => {
      let hangReport: HangReport | null = null;
      const hangCallback = (report: HangReport) => {
        hangReport = report;
      };

      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 100, // 100ms for fast test
        onHang: hangCallback,
      });

      await monitor.start();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Callback should be called
      expect(hangReport).not.toBeNull();
      expect(hangReport?.type).toBe('hang_detected');
      expect(hangReport?.taskId).toBe('TASK-001');
      expect(hangReport?.slaverId).toBe('slaver-001');

      await monitor.stop();
    }, 10000); // Increase test timeout

    it('should not trigger hang if activity recorded before timeout', async () => {
      let hangCalled = false;
      const hangCallback = () => {
        hangCalled = true;
      };

      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 200, // 200ms
        onHang: hangCallback,
      });

      await monitor.start();

      // Record activity before timeout
      await new Promise((resolve) => setTimeout(resolve, 100));
      monitor.recordActivity();

      // Wait more time (total > timeout, but < timeout since last activity)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // No hang should be triggered
      expect(hangCalled).toBe(false);

      await monitor.stop();
    }, 10000);

    it('should emit hang event', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 100,
      });

      let hangEventFired = false;
      monitor.on('hang', () => {
        hangEventFired = true;
      });

      await monitor.start();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Event should be emitted
      expect(hangEventFired).toBe(true);

      await monitor.stop();
    }, 10000);
  });

  describe('activity events', () => {
    it('should emit activity event when recordActivity called', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      let activityEventFired = false;
      let activityTimestamp: Date | null = null;
      monitor.on('activity', (data: { timestamp: Date }) => {
        activityEventFired = true;
        activityTimestamp = data.timestamp;
      });

      await monitor.start();

      monitor.recordActivity();

      expect(activityEventFired).toBe(true);
      expect(activityTimestamp).toBeInstanceOf(Date);

      await monitor.stop();
    });
  });

  describe('idle duration tracking', () => {
    it('should correctly track idle duration', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      await monitor.start();

      // Initial idle duration should be ~0
      expect(monitor.getIdleDurationSec()).toBeLessThan(2);

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(monitor.getIdleDurationSec()).toBeGreaterThanOrEqual(1);
      expect(monitor.getIdleDurationSec()).toBeLessThan(3);

      await monitor.stop();
    }, 10000);
  });

  describe('edge cases', () => {
    it('should handle multiple start calls gracefully', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      await monitor.start();
      await monitor.start(); // Should warn, not crash

      await monitor.stop();
    });

    it('should handle stop before start gracefully', async () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      await monitor.stop(); // Should be no-op
    });

    it('should handle recordActivity before start gracefully', () => {
      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 180000,
      });

      monitor.recordActivity(); // Should be no-op
    });

    it('should handle onHang callback errors gracefully', async () => {
      let callbackCalled = false;
      const hangCallback = () => {
        callbackCalled = true;
        throw new Error('Callback error');
      };

      const monitor = new IOActivityMonitor({
        taskId: 'TASK-001',
        slaverId: 'slaver-001',
        timeoutMs: 100,
        onHang: hangCallback,
      });

      await monitor.start();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Callback should be called, error should be caught
      expect(callbackCalled).toBe(true);
      // Monitor should still be running (not crashed)

      await monitor.stop();
    }, 10000);
  });
});
