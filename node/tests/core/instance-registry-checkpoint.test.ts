/**
 * Instance Registry Checkpoint Tests
 * Tests for saveExecutionState and clearExecutionState
 *
 * NOTE: These tests use unstable_mockModule for ESM compatibility.
 * Redis is unavailable in test env → SQLite degradation path is tested.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Must use unstable_mockModule before imports in ESM
const mockSaveCheckpoint = jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });
const mockDeleteCheckpoint = jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });
const mockConnect = jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../src/core/sqlite-manager.js', () => ({
  createSQLiteManager: jest.fn(() => ({
    connect: mockConnect,
    saveCheckpoint: mockSaveCheckpoint,
    deleteCheckpoint: mockDeleteCheckpoint,
  })),
}));

jest.unstable_mockModule('../../src/core/redis-client.js', () => ({
  RedisClient: jest.fn(),
  createRedisClient: jest.fn(() => ({
    connect: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: false }),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isReady: jest.fn<() => boolean>().mockReturnValue(false),
    getClient: jest.fn<() => null>().mockReturnValue(null),
  })),
}));

// Dynamic import AFTER mock setup
const { InstanceRegistry } = await import('../../src/core/instance-registry.js');

describe('InstanceRegistry — Execution Checkpoints', () => {
  let registry: InstanceType<typeof InstanceRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mockConnect to success for each test
    mockConnect.mockResolvedValue({ success: true });
    registry = new InstanceRegistry();
  });

  describe('saveExecutionState', () => {
    it('should call saveCheckpoint with correct params', async () => {
      const result = await registry.saveExecutionState('slaver_1', 'TASK-001', 'implement', {
        filesChanged: ['src/foo.ts'],
        lastAction: 'wrote function',
      });

      expect(result.success).toBe(true);
      expect(mockSaveCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'TASK-001',
          slaverId: 'slaver_1',
          phase: 'implement',
        })
      );
    });

    it('should include context in stateJson', async () => {
      await registry.saveExecutionState('slaver_2', 'TASK-002', 'test', {
        notes: 'all tests passing',
      });

      const call = mockSaveCheckpoint.mock.calls[0]?.[0] as { stateJson?: string } | undefined;
      expect(call).toBeDefined();
      const state = JSON.parse(call!.stateJson ?? '{}') as { notes?: string };
      expect(state.notes).toBe('all tests passing');
    });

    it('should degrade gracefully when SQLite unavailable', async () => {
      mockConnect.mockResolvedValue({ success: false });
      // Create fresh instance to clear lazy-init state
      const freshRegistry = new InstanceRegistry();

      const result = await freshRegistry.saveExecutionState('slaver_3', 'TASK-003', 'pr');

      // Should not fail even when SQLite is unavailable
      expect(result.success).toBe(true);
    });
  });

  describe('clearExecutionState', () => {
    it('should call deleteCheckpoint', async () => {
      // Init sqlite first
      await registry.saveExecutionState('slaver_3', 'TASK-003', 'pr');
      jest.clearAllMocks();

      const result = await registry.clearExecutionState('slaver_3', 'TASK-003');

      expect(result.success).toBe(true);
      expect(mockDeleteCheckpoint).toHaveBeenCalledWith('TASK-003', 'slaver_3');
    });
  });
});
