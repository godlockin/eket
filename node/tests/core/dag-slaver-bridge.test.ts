/**
 * DAG-Slaver Bridge Tests (TASK-642)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  DAGSlaverBridge,
  createDAGSlaverBridge,
  type DAGProgress,
} from '../../src/core/dag-slaver-bridge.js';
import { createEventBus, EventBus } from '../../src/core/event-bus.js';
import { DAGEvents } from '../../src/core/dag-executor.js';

describe('DAGSlaverBridge', () => {
  let eventBus: EventBus;
  let bridge: DAGSlaverBridge;

  beforeEach(() => {
    eventBus = createEventBus();
    eventBus.connect();
    bridge = createDAGSlaverBridge({
      projectRoot: '/tmp/test-eket',
      masterId: 'test-master',
      maxConcurrentPerSlaver: 2,
      eventBus,
    });
  });

  afterEach(() => {
    bridge.disconnect();
    eventBus.disconnect();
  });

  describe('initialization', () => {
    it('should create bridge with default config', () => {
      const defaultBridge = createDAGSlaverBridge({ eventBus });
      expect(defaultBridge).toBeDefined();
      expect(defaultBridge.getActiveRunProgress()).toEqual([]);
      defaultBridge.disconnect();
    });

    it('should have no active runs initially', () => {
      expect(bridge.getActiveRunProgress()).toEqual([]);
    });

    it('should have no pending dispatch initially', () => {
      expect(bridge.getPendingDispatchCount()).toBe(0);
    });
  });

  describe('DAG run lifecycle', () => {
    const testRunId = 'test-run-001';
    const testEpicId = 'EPIC-001';

    it('should track run when started event received', () => {
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: testEpicId,
        totalNodes: 5,
        dagPath: '/tmp/dag.yml',
      });

      const progress = bridge.getActiveRunProgress();
      expect(progress).toHaveLength(1);
      expect(progress[0].runId).toBe(testRunId);
      expect(progress[0].epicId).toBe(testEpicId);
      expect(progress[0].totalNodes).toBe(5);
      expect(progress[0].status).toBe('running');
    });

    it('should update progress when node pending', () => {
      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: testEpicId,
        totalNodes: 3,
        dagPath: '/tmp/dag.yml',
      });

      // Node becomes pending
      eventBus.emit(DAGEvents.NODE_PENDING, {
        runId: testRunId,
        nodeId: 'TASK-001',
      });

      const progress = bridge.getRunProgress(testRunId);
      expect(progress).toBeDefined();
      expect(progress!.pendingNodes).toBe(2); // 3 - 1 = 2
    });

    it('should update progress when node done', () => {
      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: testEpicId,
        totalNodes: 3,
        dagPath: '/tmp/dag.yml',
      });

      // Simulate node completion
      eventBus.emit(DAGEvents.NODE_DONE, {
        runId: testRunId,
        nodeId: 'TASK-001',
        duration: 1000,
      });

      const progress = bridge.getRunProgress(testRunId);
      expect(progress).toBeDefined();
      expect(progress!.completedNodes).toBe(1);
    });

    it('should update progress when node failed', () => {
      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: testEpicId,
        totalNodes: 3,
        dagPath: '/tmp/dag.yml',
      });

      // Simulate node failure
      eventBus.emit(DAGEvents.NODE_FAILED, {
        runId: testRunId,
        nodeId: 'TASK-001',
        error: 'Test error',
      });

      const progress = bridge.getRunProgress(testRunId);
      expect(progress).toBeDefined();
      expect(progress!.failedNodes).toBe(1);
    });

    it('should update progress when node skipped', () => {
      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: testEpicId,
        totalNodes: 3,
        dagPath: '/tmp/dag.yml',
      });

      // Simulate node skip
      eventBus.emit(DAGEvents.NODE_SKIPPED, {
        runId: testRunId,
        nodeId: 'TASK-001',
      });

      const progress = bridge.getRunProgress(testRunId);
      expect(progress).toBeDefined();
      expect(progress!.skippedNodes).toBe(1);
    });

    it('should mark run as completed when completed event received', () => {
      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: testEpicId,
        totalNodes: 1,
        dagPath: '/tmp/dag.yml',
      });

      // Complete run
      eventBus.emit(DAGEvents.RUN_COMPLETED, {
        runId: testRunId,
        epicId: testEpicId,
        status: 'completed',
        duration: 5000,
        completedNodes: 1,
        failedNodes: 0,
      });

      const progress = bridge.getRunProgress(testRunId);
      expect(progress).toBeDefined();
      expect(progress!.status).toBe('completed');
    });
  });

  describe('pending dispatch management', () => {
    it('should queue nodes for dispatch when pending', () => {
      const testRunId = 'test-run-002';

      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: 'EPIC-002',
        totalNodes: 2,
        dagPath: '/tmp/dag.yml',
      });

      // Queue two nodes
      eventBus.emit(DAGEvents.NODE_PENDING, {
        runId: testRunId,
        nodeId: 'TASK-001',
      });
      eventBus.emit(DAGEvents.NODE_PENDING, {
        runId: testRunId,
        nodeId: 'TASK-002',
      });

      expect(bridge.getPendingDispatchCount()).toBe(2);
    });

    it('should remove from pending when done', () => {
      const testRunId = 'test-run-003';

      // Start run
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: testRunId,
        epicId: 'EPIC-003',
        totalNodes: 1,
        dagPath: '/tmp/dag.yml',
      });

      // Queue node
      eventBus.emit(DAGEvents.NODE_PENDING, {
        runId: testRunId,
        nodeId: 'TASK-001',
      });

      expect(bridge.getPendingDispatchCount()).toBe(1);

      // Complete node
      eventBus.emit(DAGEvents.NODE_DONE, {
        runId: testRunId,
        nodeId: 'TASK-001',
        duration: 1000,
      });

      expect(bridge.getPendingDispatchCount()).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all state on disconnect', () => {
      // Setup some state
      eventBus.emit(DAGEvents.RUN_STARTED, {
        runId: 'test-run-cleanup',
        epicId: 'EPIC-CLEANUP',
        totalNodes: 2,
        dagPath: '/tmp/dag.yml',
      });

      expect(bridge.getActiveRunProgress()).toHaveLength(1);

      // Disconnect
      bridge.disconnect();

      expect(bridge.getActiveRunProgress()).toHaveLength(0);
      expect(bridge.getPendingDispatchCount()).toBe(0);
    });
  });
});
