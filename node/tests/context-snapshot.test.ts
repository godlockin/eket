/**
 * ContextSnapshotManager 单元测试
 *
 * 测试覆盖：
 * - saveSnapshot 保存并可读回
 * - getSnapshotsByTicket 按 ticketId 过滤
 * - searchSnapshots 关键词搜索
 * - getRecentSnapshots 按时间倒序
 * - querySnapshots 通用查询接口
 * - 错误处理（未连接时的行为）
 *
 * 所有测试使用 SQLite in-memory（':memory:'），彼此完全隔离。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ContextSnapshotManager,
  createContextSnapshotManager,
} from '../src/core/context-snapshot.js';
import type { ContextSnapshot } from '../src/types/index.js';

// ============================================================================
// Helper: 构造最小合法快照输入
// ============================================================================

function makeInput(
  overrides: Partial<Omit<ContextSnapshot, 'id' | 'createdAt'>> = {}
): Omit<ContextSnapshot, 'id' | 'createdAt'> {
  return {
    ticketId: 'TICKET-001',
    agentId: 'agent-frontend-01',
    agentType: 'frontend_dev',
    whatSurprisedMe: ['The API returns snake_case but docs said camelCase'],
    whatIWouldDoDifferently: ['Write integration tests first'],
    whatNextPersonNeedsToKnow: ['The legacy util must not be removed — used by iOS team'],
    implicitDependencies: ['auth-service must be running locally for login tests'],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ContextSnapshotManager', () => {
  let manager: ContextSnapshotManager;

  beforeEach(async () => {
    manager = createContextSnapshotManager(':memory:');
    const result = await manager.connect();
    expect(result.success).toBe(true);
  });

  afterEach(() => {
    manager.disconnect();
  });

  // --------------------------------------------------------------------------
  // connect / factory
  // --------------------------------------------------------------------------

  describe('createContextSnapshotManager factory', () => {
    it('should return a ContextSnapshotManager instance', () => {
      const m = createContextSnapshotManager(':memory:');
      expect(m).toBeInstanceOf(ContextSnapshotManager);
      m.disconnect(); // clean up (safe to call even before connect)
    });
  });

  // --------------------------------------------------------------------------
  // saveSnapshot
  // --------------------------------------------------------------------------

  describe('saveSnapshot', () => {
    it('should save a snapshot and return a complete object with id and createdAt', () => {
      const input = makeInput();
      const result = manager.saveSnapshot(input);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const saved = result.data;
      expect(typeof saved.id).toBe('string');
      expect(saved.id).toMatch(/^cs_/);
      expect(typeof saved.createdAt).toBe('number');
      expect(saved.createdAt).toBeGreaterThan(0);

      // All input fields preserved
      expect(saved.ticketId).toBe(input.ticketId);
      expect(saved.agentId).toBe(input.agentId);
      expect(saved.agentType).toBe(input.agentType);
      expect(saved.whatSurprisedMe).toEqual(input.whatSurprisedMe);
      expect(saved.whatIWouldDoDifferently).toEqual(input.whatIWouldDoDifferently);
      expect(saved.whatNextPersonNeedsToKnow).toEqual(input.whatNextPersonNeedsToKnow);
      expect(saved.implicitDependencies).toEqual(input.implicitDependencies);
    });

    it('should persist optional fields when provided', () => {
      const input = makeInput({
        technicalPitfalls: ['Do not use lodash.merge on circular refs'],
        keyDecisions: ['Chose React Query over SWR for better devtools support'],
        openQuestions: ['Is the rate limit 100/min or 1000/min for prod?'],
      });

      const result = manager.saveSnapshot(input);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.technicalPitfalls).toEqual(input.technicalPitfalls);
      expect(result.data.keyDecisions).toEqual(input.keyDecisions);
      expect(result.data.openQuestions).toEqual(input.openQuestions);
    });

    it('should leave optional fields as undefined when not provided', () => {
      const result = manager.saveSnapshot(makeInput());
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.technicalPitfalls).toBeUndefined();
      expect(result.data.keyDecisions).toBeUndefined();
      expect(result.data.openQuestions).toBeUndefined();
    });

    it('should assign unique ids to different snapshots', () => {
      const r1 = manager.saveSnapshot(makeInput());
      const r2 = manager.saveSnapshot(makeInput());

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      if (!r1.success || !r2.success) return;

      expect(r1.data.id).not.toBe(r2.data.id);
    });

    it('should be readable back via getSnapshotsByTicket', () => {
      const input = makeInput({ ticketId: 'TICKET-ROUNDTRIP' });
      const saveResult = manager.saveSnapshot(input);
      expect(saveResult.success).toBe(true);
      if (!saveResult.success) return;
      const savedId = saveResult.data.id;

      const fetchResult = manager.getSnapshotsByTicket('TICKET-ROUNDTRIP');
      expect(fetchResult.success).toBe(true);
      if (!fetchResult.success) return;

      expect(fetchResult.data).toHaveLength(1);
      expect(fetchResult.data[0].id).toBe(savedId);
      expect(fetchResult.data[0].whatSurprisedMe).toEqual(input.whatSurprisedMe);
    });

    it('should return error when not connected', () => {
      const disconnectedManager = createContextSnapshotManager(':memory:');
      // NOT calling connect()
      const result = disconnectedManager.saveSnapshot(makeInput());

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('DB_NOT_CONNECTED');
    });
  });

  // --------------------------------------------------------------------------
  // getSnapshotsByTicket
  // --------------------------------------------------------------------------

  describe('getSnapshotsByTicket', () => {
    it('should return empty array when no snapshots exist for ticket', () => {
      const result = manager.getSnapshotsByTicket('TICKET-NONEXISTENT');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(0);
    });

    it('should return only snapshots belonging to the given ticketId', () => {
      manager.saveSnapshot(makeInput({ ticketId: 'TICKET-A' }));
      manager.saveSnapshot(makeInput({ ticketId: 'TICKET-A' }));
      manager.saveSnapshot(makeInput({ ticketId: 'TICKET-B' }));

      const resultA = manager.getSnapshotsByTicket('TICKET-A');
      expect(resultA.success).toBe(true);
      if (!resultA.success) return;
      expect(resultA.data).toHaveLength(2);
      for (const s of resultA.data) {
        expect(s.ticketId).toBe('TICKET-A');
      }

      const resultB = manager.getSnapshotsByTicket('TICKET-B');
      expect(resultB.success).toBe(true);
      if (!resultB.success) return;
      expect(resultB.data).toHaveLength(1);
      expect(resultB.data[0].ticketId).toBe('TICKET-B');
    });

    it('should return snapshots in ascending createdAt order', () => {
      // Save multiple snapshots — they should come back oldest-first
      for (let i = 0; i < 3; i++) {
        manager.saveSnapshot(makeInput({ ticketId: 'TICKET-ORDER' }));
      }

      const result = manager.getSnapshotsByTicket('TICKET-ORDER');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const timestamps = result.data.map((s) => s.createdAt);
      const sorted = [...timestamps].sort((a, b) => a - b);
      expect(timestamps).toEqual(sorted);
    });

    it('should return error when not connected', () => {
      const disconnectedManager = createContextSnapshotManager(':memory:');
      const result = disconnectedManager.getSnapshotsByTicket('TICKET-X');

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('DB_NOT_CONNECTED');
    });
  });

  // --------------------------------------------------------------------------
  // searchSnapshots
  // --------------------------------------------------------------------------

  describe('searchSnapshots', () => {
    beforeEach(() => {
      // Snapshot A — contains 'Redis' in technical pitfalls
      manager.saveSnapshot(
        makeInput({
          ticketId: 'TICKET-SEARCH-1',
          technicalPitfalls: ['Redis connection pool size defaults to 10, not unlimited'],
          whatSurprisedMe: ['Cache invalidation is harder than expected'],
        })
      );

      // Snapshot B — contains 'React' in key decisions
      manager.saveSnapshot(
        makeInput({
          ticketId: 'TICKET-SEARCH-2',
          keyDecisions: ['Chose React Query over SWR'],
          whatSurprisedMe: ['State management got complex quickly'],
        })
      );

      // Snapshot C — contains 'auth' in implicitDependencies
      manager.saveSnapshot(
        makeInput({
          ticketId: 'TICKET-SEARCH-3',
          implicitDependencies: ['auth-service must be running on port 8080'],
          whatSurprisedMe: ['No staging environment for auth'],
        })
      );
    });

    it('should find snapshots matching keyword in technicalPitfalls', () => {
      const result = manager.searchSnapshots('Redis');
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      const ids = result.data.map((s) => s.ticketId);
      expect(ids).toContain('TICKET-SEARCH-1');
    });

    it('should find snapshots matching keyword in keyDecisions', () => {
      const result = manager.searchSnapshots('React Query');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const ids = result.data.map((s) => s.ticketId);
      expect(ids).toContain('TICKET-SEARCH-2');
    });

    it('should find snapshots matching keyword in implicitDependencies', () => {
      const result = manager.searchSnapshots('auth-service');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const ids = result.data.map((s) => s.ticketId);
      expect(ids).toContain('TICKET-SEARCH-3');
    });

    it('should find snapshots matching keyword in whatSurprisedMe', () => {
      const result = manager.searchSnapshots('Cache invalidation');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const ids = result.data.map((s) => s.ticketId);
      expect(ids).toContain('TICKET-SEARCH-1');
    });

    it('should return empty array when no snapshot matches', () => {
      const result = manager.searchSnapshots('XYZZY_NONEXISTENT_KEYWORD_42');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(0);
    });

    it('should respect limit option', () => {
      // Add a 4th snapshot also matching 'expected'
      manager.saveSnapshot(
        makeInput({
          ticketId: 'TICKET-SEARCH-4',
          whatSurprisedMe: ['Performance was better than expected'],
        })
      );

      // 'expected' appears in snapshot 2 (State management), 3 (no), and 4
      // Use a broad keyword that likely matches many
      const resultAll = manager.searchSnapshots('expected');
      const resultLimited = manager.searchSnapshots('expected', { limit: 1 });

      expect(resultAll.success).toBe(true);
      expect(resultLimited.success).toBe(true);
      if (!resultAll.success || !resultLimited.success) return;

      expect(resultLimited.data.length).toBeLessThanOrEqual(1);
      expect(resultAll.data.length).toBeGreaterThanOrEqual(resultLimited.data.length);
    });

    it('should return error when not connected', () => {
      const disconnectedManager = createContextSnapshotManager(':memory:');
      const result = disconnectedManager.searchSnapshots('anything');

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('DB_NOT_CONNECTED');
    });
  });

  // --------------------------------------------------------------------------
  // getRecentSnapshots
  // --------------------------------------------------------------------------

  describe('getRecentSnapshots', () => {
    it('should return empty array when no snapshots exist', () => {
      const result = manager.getRecentSnapshots();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(0);
    });

    it('should return at most `limit` snapshots (default 20)', () => {
      for (let i = 0; i < 5; i++) {
        manager.saveSnapshot(makeInput({ ticketId: `TICKET-RECENT-${i}` }));
      }

      const result = manager.getRecentSnapshots();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.length).toBeLessThanOrEqual(20);
      expect(result.data.length).toBe(5);
    });

    it('should honour custom limit', () => {
      for (let i = 0; i < 5; i++) {
        manager.saveSnapshot(makeInput({ ticketId: `TICKET-LIM-${i}` }));
      }

      const result = manager.getRecentSnapshots(3);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(3);
    });

    it('should return snapshots in descending createdAt order', () => {
      for (let i = 0; i < 3; i++) {
        manager.saveSnapshot(makeInput({ ticketId: `TICKET-DESC-${i}` }));
      }

      const result = manager.getRecentSnapshots();
      expect(result.success).toBe(true);
      if (!result.success) return;

      const timestamps = result.data.map((s) => s.createdAt);
      const sorted = [...timestamps].sort((a, b) => b - a);
      expect(timestamps).toEqual(sorted);
    });

    it('should return error when not connected', () => {
      const disconnectedManager = createContextSnapshotManager(':memory:');
      const result = disconnectedManager.getRecentSnapshots();

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('DB_NOT_CONNECTED');
    });
  });

  // --------------------------------------------------------------------------
  // querySnapshots (general query)
  // --------------------------------------------------------------------------

  describe('querySnapshots', () => {
    beforeEach(() => {
      manager.saveSnapshot(makeInput({ ticketId: 'T-1', agentId: 'agent-A', agentType: 'frontend_dev' }));
      manager.saveSnapshot(makeInput({ ticketId: 'T-1', agentId: 'agent-B', agentType: 'backend_dev' }));
      manager.saveSnapshot(makeInput({ ticketId: 'T-2', agentId: 'agent-A', agentType: 'frontend_dev' }));
    });

    it('should filter by ticketId', () => {
      const result = manager.querySnapshots({ ticketId: 'T-1' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(2);
      for (const s of result.data) expect(s.ticketId).toBe('T-1');
    });

    it('should filter by agentId', () => {
      const result = manager.querySnapshots({ agentId: 'agent-A' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(2);
      for (const s of result.data) expect(s.agentId).toBe('agent-A');
    });

    it('should filter by both ticketId and agentId', () => {
      const result = manager.querySnapshots({ ticketId: 'T-1', agentId: 'agent-A' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].ticketId).toBe('T-1');
      expect(result.data[0].agentId).toBe('agent-A');
    });

    it('should return all snapshots when no filter is given', () => {
      const result = manager.querySnapshots();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.length).toBe(3);
    });

    it('should respect offset for pagination', () => {
      const page1 = manager.querySnapshots({ limit: 2, offset: 0 });
      const page2 = manager.querySnapshots({ limit: 2, offset: 2 });

      expect(page1.success && page2.success).toBe(true);
      if (!page1.success || !page2.success) return;

      const allIds = [...page1.data.map((s) => s.id), ...page2.data.map((s) => s.id)];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length); // no duplicates across pages
    });
  });

  // --------------------------------------------------------------------------
  // Data integrity: arrays with special characters
  // --------------------------------------------------------------------------

  describe('data integrity', () => {
    it('should preserve strings with special characters unchanged', () => {
      const tricky = [
        'Uses "double quotes" and \'single quotes\'',
        'Path: C:\\Users\\agent\\file.txt',
        'JSON snippet: {"key":"value","arr":[1,2]}',
        '日本語テキスト',
        'Emoji 🚀🔥',
      ];

      const input = makeInput({ whatSurprisedMe: tricky });
      const saveResult = manager.saveSnapshot(input);
      expect(saveResult.success).toBe(true);
      if (!saveResult.success) return;

      const fetchResult = manager.getSnapshotsByTicket(input.ticketId);
      expect(fetchResult.success).toBe(true);
      if (!fetchResult.success) return;

      expect(fetchResult.data[0].whatSurprisedMe).toEqual(tricky);
    });

    it('should store and restore empty arrays correctly', () => {
      const input = makeInput({
        whatSurprisedMe: [],
        whatIWouldDoDifferently: [],
        whatNextPersonNeedsToKnow: [],
        implicitDependencies: [],
      });

      const saveResult = manager.saveSnapshot(input);
      expect(saveResult.success).toBe(true);
      if (!saveResult.success) return;

      const fetchResult = manager.getSnapshotsByTicket(input.ticketId);
      expect(fetchResult.success).toBe(true);
      if (!fetchResult.success) return;

      const s = fetchResult.data[0];
      expect(s.whatSurprisedMe).toEqual([]);
      expect(s.whatIWouldDoDifferently).toEqual([]);
      expect(s.whatNextPersonNeedsToKnow).toEqual([]);
      expect(s.implicitDependencies).toEqual([]);
    });
  });
});
