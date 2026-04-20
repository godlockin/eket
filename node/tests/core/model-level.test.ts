/**
 * Model Level Upgrade/Downgrade Tests (TASK-104a)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Instance } from '../../src/types/index.js';

// Mock Redis with in-memory store
const store = new Map<string, string>();

const mockClient = {
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  set: jest.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
  sadd: jest.fn<() => Promise<number>>().mockResolvedValue(1),
  srem: jest.fn<() => Promise<number>>().mockResolvedValue(1),
  smembers: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
};

jest.unstable_mockModule('../../src/core/redis-client.js', () => ({
  RedisClient: jest.fn(),
  createRedisClient: jest.fn(() => ({
    connect: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isReady: jest.fn<() => boolean>().mockReturnValue(true),
    getClient: jest.fn(() => mockClient),
  })),
}));

jest.unstable_mockModule('../../src/core/sqlite-manager.js', () => ({
  createSQLiteManager: jest.fn(() => ({
    connect: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: false }),
  })),
}));

const { InstanceRegistry } = await import('../../src/core/instance-registry.js');

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: 'slaver-001',
    type: 'ai',
    agent_type: 'slaver',
    skills: [],
    status: 'idle',
    currentLoad: 0,
    currentLevel: 2,
    levelChanges: [],
    ...overrides,
  };
}

describe('InstanceRegistry — Model Level API', () => {
  let registry: InstanceType<typeof InstanceRegistry>;
  const PREFIX = 'eket:instance:';

  beforeEach(() => {
    store.clear();
    registry = new InstanceRegistry({ redisPrefix: PREFIX });
  });

  function seed(instance: Instance) {
    store.set(`${PREFIX}${instance.id}`, JSON.stringify(instance));
  }

  it('upgradeModel: normal upgrade from level 2 to 3', async () => {
    seed(makeInstance({ id: 'inst-1', currentLevel: 2 }));
    const result = await registry.upgradeModel('inst-1', 'complex task');
    expect(result.success).toBe(true);

    const levelResult = await registry.getCurrentLevel('inst-1');
    expect(levelResult.success).toBe(true);
    expect(levelResult.data).toBe(3);
  });

  it('upgradeModel: already at level 3 — no overflow', async () => {
    seed(makeInstance({ id: 'inst-2', currentLevel: 3 }));
    const result = await registry.upgradeModel('inst-2', 'already max');
    expect(result.success).toBe(true);

    const levelResult = await registry.getCurrentLevel('inst-2');
    expect(levelResult.data).toBe(3);

    // No change logged
    const raw = JSON.parse(store.get(`${PREFIX}inst-2`)!) as Instance;
    expect(raw.levelChanges).toHaveLength(0);
  });

  it('downgradeModel: already at level 1 — no underflow', async () => {
    seed(makeInstance({ id: 'inst-3', currentLevel: 1 }));
    const result = await registry.downgradeModel('inst-3', 'already min');
    expect(result.success).toBe(true);

    const levelResult = await registry.getCurrentLevel('inst-3');
    expect(levelResult.data).toBe(1);

    const raw = JSON.parse(store.get(`${PREFIX}inst-3`)!) as Instance;
    expect(raw.levelChanges).toHaveLength(0);
  });

  it('levelChanges records correct from/to/reason/at', async () => {
    seed(makeInstance({ id: 'inst-4', currentLevel: 1 }));
    await registry.upgradeModel('inst-4', 'reason-up');
    await registry.upgradeModel('inst-4', 'reason-up-2');
    await registry.downgradeModel('inst-4', 'reason-down');

    const raw = JSON.parse(store.get(`${PREFIX}inst-4`)!) as Instance;
    expect(raw.currentLevel).toBe(2);
    expect(raw.levelChanges).toHaveLength(3);

    expect(raw.levelChanges[0]).toMatchObject({ from: 1, to: 2, reason: 'reason-up' });
    expect(raw.levelChanges[1]).toMatchObject({ from: 2, to: 3, reason: 'reason-up-2' });
    expect(raw.levelChanges[2]).toMatchObject({ from: 3, to: 2, reason: 'reason-down' });

    // Check ISO timestamp format
    for (const change of raw.levelChanges) {
      expect(() => new Date(change.at).toISOString()).not.toThrow();
    }
  });
});
