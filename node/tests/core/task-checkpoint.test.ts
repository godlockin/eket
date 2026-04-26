/**
 * TASK-199: TaskCheckpoint unit tests
 * Covers: save/load roundtrip, CAS conflict rejection, idempotent tool skip
 */

import Database from 'better-sqlite3';
import {
  TaskCheckpointStore,
  CheckpointCASError,
  createEmptyCheckpoint,
} from '../../src/core/task-checkpoint.js';
import type { TaskCheckpoint } from '../../src/types/index.js';

function makeInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_checkpoints (
      task_id    TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      version    INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe('TaskCheckpointStore', () => {
  let db: Database.Database;
  let store: TaskCheckpointStore;

  beforeEach(() => {
    db = makeInMemoryDb();
    store = new TaskCheckpointStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save/load roundtrip', () => {
    it('saves and loads a checkpoint', () => {
      const cp = createEmptyCheckpoint('TASK-199');
      cp.stepIndex = 3;
      cp.agentFacingItems = [{ role: 'user', content: 'hello' }];
      cp.fullHistoryItems = [{ role: 'assistant', content: 'world' }];
      cp.executedToolCalls = ['tool_abc'];

      store.saveCheckpoint(cp);

      const result = store.loadCheckpoint('TASK-199');
      expect(result.success).toBe(true);
      const loaded = result.data!;
      expect(loaded.taskId).toBe('TASK-199');
      expect(loaded.stepIndex).toBe(3);
      expect(loaded.agentFacingItems).toHaveLength(1);
      expect(loaded.fullHistoryItems).toHaveLength(1);
      expect(loaded.executedToolCalls).toContain('tool_abc');
    });

    it('returns null for unknown taskId', () => {
      const result = store.loadCheckpoint('TASK-NONEXISTENT');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('persists version=1 after first save', () => {
      const cp = createEmptyCheckpoint('TASK-1');
      store.saveCheckpoint(cp);
      const loaded = store.loadCheckpoint('TASK-1').data!;
      expect(loaded.version).toBe(1);
    });

    it('increments version on each save', () => {
      const cp = createEmptyCheckpoint('TASK-2');
      store.saveCheckpoint(cp);
      const v1 = store.loadCheckpoint('TASK-2').data!;
      expect(v1.version).toBe(1);

      store.saveCheckpoint(v1);
      const v2 = store.loadCheckpoint('TASK-2').data!;
      expect(v2.version).toBe(2);
    });
  });

  describe('CAS conflict rejection', () => {
    it('returns casConflict result when version mismatch on update (TASK-220)', () => {
      const cp = createEmptyCheckpoint('TASK-3');
      store.saveCheckpoint(cp);

      const staleCp: TaskCheckpoint = { ...cp, version: 0, stepIndex: 99 };
      const result = store.saveCheckpoint(staleCp);
      expect(result.success).toBe(false);
      expect((result as { casConflict?: boolean }).casConflict).toBe(true);
    });

    it('casConflict result contains error message with taskId (TASK-220)', () => {
      const cp = createEmptyCheckpoint('TASK-4');
      store.saveCheckpoint(cp);

      const result = store.saveCheckpoint({ ...cp, version: 0 });
      expect(result.success).toBe(false);
      const r = result as { casConflict?: boolean; error?: string };
      expect(r.casConflict).toBe(true);
      expect(r.error).toMatch(/TASK-4/);
    });

    it('allows sequential updates if versions match', () => {
      const cp = createEmptyCheckpoint('TASK-5');
      store.saveCheckpoint(cp);
      const v1 = store.loadCheckpoint('TASK-5').data!;

      v1.stepIndex = 1;
      store.saveCheckpoint(v1);

      const v2 = store.loadCheckpoint('TASK-5').data!;
      v2.stepIndex = 2;
      store.saveCheckpoint(v2);

      expect(store.loadCheckpoint('TASK-5').data!.stepIndex).toBe(2);
    });
  });

  describe('idempotent tool call skip', () => {
    it('isToolCallAlreadyExecuted returns false for new tool', () => {
      const cp = createEmptyCheckpoint('TASK-6');
      store.saveCheckpoint(cp);

      const result = store.isToolCallAlreadyExecuted('TASK-6', 'tool_xyz');
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('isToolCallAlreadyExecuted returns false when no checkpoint', () => {
      const result = store.isToolCallAlreadyExecuted('TASK-NONE', 'tool_xyz');
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('recordToolCallExecuted marks tool as executed', () => {
      const cp = createEmptyCheckpoint('TASK-7');
      store.saveCheckpoint(cp);

      store.recordToolCallExecuted('TASK-7', 'tool_abc');
      const result = store.isToolCallAlreadyExecuted('TASK-7', 'tool_abc');
      expect(result.data).toBe(true);
    });

    it('recordToolCallExecuted is idempotent — no duplicate entries', () => {
      const cp = createEmptyCheckpoint('TASK-8');
      store.saveCheckpoint(cp);

      store.recordToolCallExecuted('TASK-8', 'tool_dup');
      store.recordToolCallExecuted('TASK-8', 'tool_dup');

      const loaded = store.loadCheckpoint('TASK-8').data!;
      const count = loaded.executedToolCalls.filter((id) => id === 'tool_dup').length;
      expect(count).toBe(1);
    });

    it('multiple distinct tools are all recorded', () => {
      const cp = createEmptyCheckpoint('TASK-9');
      store.saveCheckpoint(cp);

      store.recordToolCallExecuted('TASK-9', 'tool_a');
      store.recordToolCallExecuted('TASK-9', 'tool_b');
      store.recordToolCallExecuted('TASK-9', 'tool_c');

      const loaded = store.loadCheckpoint('TASK-9').data!;
      expect(loaded.executedToolCalls).toEqual(['tool_a', 'tool_b', 'tool_c']);
    });
  });

  describe('deleteCheckpoint', () => {
    it('deletes a checkpoint', () => {
      const cp = createEmptyCheckpoint('TASK-10');
      store.saveCheckpoint(cp);
      store.deleteCheckpoint('TASK-10');
      expect(store.loadCheckpoint('TASK-10').data).toBeNull();
    });

    it('delete of non-existent is a no-op', () => {
      const result = store.deleteCheckpoint('TASK-NONE');
      expect(result.success).toBe(true);
    });
  });
});
