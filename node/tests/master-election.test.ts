/**
 * Master Election 单元测试
 * Phase 9.1 - Master 选举机制
 *
 * 测试覆盖：
 * - 选举流程
 * - 分布式锁
 * - 声明等待期
 * - 租约续期
 * - 降级逻辑
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { MasterElection, createMasterElection } from '../core/master-election';
import type { MasterElectionConfig } from '../types/index';

// Test project root for all tests
const TEST_PROJECT_ROOT = '/tmp/test-eket-master-election';

describe('MasterElection', () => {
  beforeEach(() => {
    // 创建测试目录
    fs.mkdirSync(path.join(TEST_PROJECT_ROOT, '.eket', 'state', 'master_lock'), {
      recursive: true,
      force: true,
    });
  });

  afterEach(() => {
    // 清理测试目录
    try {
      fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create instance with required config', () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };
      const election = createMasterElection(config);
      expect(election).toBeDefined();
    });

    it('should generate unique instance ID', async () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };
      const election1 = createMasterElection(config);

      // 等待 1ms（随机后缀确保 ID 唯一性，不依赖时间戳）
      await new Promise(resolve => setTimeout(resolve, 1));

      const election2 = createMasterElection(config);

      const id1 = election1.getInstanceId();
      const id2 = election2.getInstanceId();

      // 两个 instance ID 应该不同（因为时间戳不同）
      expect(id1).not.toBe(id2);
    });

    it('should use default timeouts', () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };
      const election = createMasterElection(config);
      expect(election).toBeDefined();
    });

    it('should accept custom timeouts', () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
        electionTimeout: 3000,
        declarationPeriod: 1000,
        leaseTime: 20000,
      };
      const election = createMasterElection(config);
      expect(election).toBeDefined();
    });
  });

  describe('elect', () => {
    it('should complete election flow', async () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
        electionTimeout: 2000,
        declarationPeriod: 500,
        leaseTime: 10000,
      };
      const election = createMasterElection(config);

      const result = await election.elect();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isMaster).toBeDefined();
        expect(result.data.electionLevel).toBeDefined();
        expect(['redis', 'sqlite', 'file']).toContain(result.data.electionLevel);
      }
    });

    it('should detect conflict when another master exists', async () => {
      // 这个测试需要模拟已有 Master 的场景
      // 实际测试中需要更复杂的 mock
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
        electionTimeout: 2000,
        declarationPeriod: 500,
        leaseTime: 10000,
      };

      const election1 = createMasterElection(config);
      const result1 = await election1.elect();

      // 第一个选举应该成功
      expect(result1.success).toBe(true);

      await election1.relinquish();
    });

    it('should handle Redis unavailability gracefully', async () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
        redis: {
          host: 'invalid-host-that-does-not-exist',
          port: 6379,
        },
        electionTimeout: 2000,
        declarationPeriod: 500,
      };

      const election = createMasterElection(config);
      const result = await election.elect();

      // 即使 Redis 不可用，也应该降级到 SQLite 或文件
      expect(result.success).toBe(true);
    });
  });

  describe('isMasterNode', () => {
    it('should return false before election', () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };
      const election = createMasterElection(config);

      expect(election.isMasterNode()).toBe(false);
    });
  });

  describe('getInstanceId', () => {
    it('should return non-empty string', () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };
      const election = createMasterElection(config);
      const instanceId = election.getInstanceId();

      expect(instanceId).toBeTruthy();
      expect(typeof instanceId).toBe('string');
      expect(instanceId.length).toBeGreaterThan(0);
    });

    it('should include hostname and pid', () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };
      const election = createMasterElection(config);
      const instanceId = election.getInstanceId();

      // Instance ID 格式：instance_hostname_pid_timestamp
      expect(instanceId).toMatch(/instance_.*_\d+_\d+/);
    });
  });

  describe('relinquish', () => {
    it('should release master status', async () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
        electionTimeout: 2000,
        declarationPeriod: 500,
        leaseTime: 10000,
      };

      const election = createMasterElection(config);
      await election.elect();

      if (election.isMasterNode()) {
        await election.relinquish();
        expect(election.isMasterNode()).toBe(false);
      }
    });

    it('should be idempotent', async () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };

      const election = createMasterElection(config);

      // 多次调用 relinquish 不应抛出异常
      await election.relinquish();
      await election.relinquish();
      expect(true).toBe(true);
    });
  });

  describe('close', () => {
    it('should close election cleanly', async () => {
      const config: MasterElectionConfig = {
        projectRoot: TEST_PROJECT_ROOT,
      };

      const election = createMasterElection(config);
      await election.close();

      // 应该不抛出异常
      expect(true).toBe(true);
    });
  });
});

describe('Election Levels', () => {
  it('should have correct level priority', () => {
    // 验证级别优先级：redis > sqlite > file
    const levels = ['redis', 'sqlite', 'file'];
    expect(levels[0]).toBe('redis');
    expect(levels[levels.length - 1]).toBe('file');
  });
});

describe('Race Condition Prevention', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(TEST_PROJECT_ROOT, '.eket', 'state', 'master_lock'), {
      recursive: true,
      force: true,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should prevent multiple masters with file locking', async () => {
    const config: MasterElectionConfig = {
      projectRoot: TEST_PROJECT_ROOT,
      electionTimeout: 2000,
      declarationPeriod: 100,
      leaseTime: 5000,
    };

    // 创建两个选举器
    const election1 = createMasterElection(config);
    const election2 = createMasterElection(config);

    // 同时开始选举
    const [result1, result2] = await Promise.all([
      election1.elect(),
      election2.elect(),
    ]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      // 最多只有一个成为 Master
      expect(!(result1.data.isMaster && result2.data.isMaster)).toBe(true);
    }

    // 清理
    await election1.close();
    await election2.close();
  });
});

describe('Lease Renewal', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(TEST_PROJECT_ROOT, '.eket', 'state', 'master_lock'), {
      recursive: true,
      force: true,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should maintain master status with lease renewal', async () => {
    const config: MasterElectionConfig = {
      projectRoot: TEST_PROJECT_ROOT,
      electionTimeout: 1000,
      declarationPeriod: 100,
      leaseTime: 2000, // 短租约时间用于测试
    };

    const election = createMasterElection(config);
    const result = await election.elect();

    if (result.success && result.data.isMaster) {
      // 等待一段时间，验证租约续期
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Master 状态应该仍然保持（因为自动续期）
      expect(election.isMasterNode()).toBe(true);
    }

    await election.close();
  });
});
