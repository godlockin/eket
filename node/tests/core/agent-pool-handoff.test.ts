/**
 * Agent Pool Handoff Tests
 * Tests for notifyHandoffReady
 *
 * notifyHandoffReady只进行文件 I/O（写 inbox），不依赖 Redis。
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock InstanceRegistry to avoid Redis dependency
jest.unstable_mockModule('../../src/core/instance-registry.js', () => ({
  InstanceRegistry: jest.fn(() => ({
    connect: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getInstance: jest.fn<() => Promise<{ success: boolean; data: object }>>().mockResolvedValue({
      success: true,
      data: { status: 'busy', currentLoad: 1, agent_type: 'slaver', currentTaskId: 'TASK-001' },
    }),
    updateInstanceStatus: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    getInstancesByRole: jest.fn<() => Promise<{ success: boolean; data: unknown[] }>>().mockResolvedValue({ success: true, data: [] }),
    getActiveInstances: jest.fn<() => Promise<{ success: boolean; data: unknown[] }>>().mockResolvedValue({ success: true, data: [] }),
  })),
  createInstanceRegistry: jest.fn(() => ({
    connect: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getInstance: jest.fn<() => Promise<{ success: boolean; data: object }>>().mockResolvedValue({
      success: true,
      data: { status: 'busy', currentLoad: 1, agent_type: 'slaver', currentTaskId: 'TASK-001' },
    }),
    updateInstanceStatus: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    getInstancesByRole: jest.fn<() => Promise<{ success: boolean; data: unknown[] }>>().mockResolvedValue({ success: true, data: [] }),
    getActiveInstances: jest.fn<() => Promise<{ success: boolean; data: unknown[] }>>().mockResolvedValue({ success: true, data: [] }),
  })),
}));

// Dynamic import AFTER mock setup
const { AgentPoolManager } = await import('../../src/core/agent-pool.js');

describe('AgentPoolManager — Handoff', () => {
  let pool: InstanceType<typeof AgentPoolManager>;
  let tmpDir: string;

  beforeEach(() => {
    pool = new AgentPoolManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-handoff-test-'));
    fs.mkdirSync(path.join(tmpDir, 'inbox', 'human_feedback'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('notifyHandoffReady', () => {
    it('should write inbox file when ticket completed', async () => {
      const result = await pool.notifyHandoffReady('TASK-001', 'slaver_1', tmpDir);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Verify inbox file was created
      const feedbackDir = path.join(tmpDir, 'inbox', 'human_feedback');
      const files = fs.readdirSync(feedbackDir).filter((f: string) =>
        f.startsWith('handoff-TASK-001')
      );
      expect(files.length).toBeGreaterThan(0);
    });

    it('should include confirm command in inbox file', async () => {
      const result = await pool.notifyHandoffReady('TASK-002', 'slaver_2', tmpDir);

      expect(result.success).toBe(true);
      const filePath = result.data as string;
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('handoff:confirm TASK-002 slaver_2');
    });
  });
});
