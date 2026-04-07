/**
 * SQLite 测试辅助工具测试
 *
 * 演示如何使用 SQLite 测试工具
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  createInMemoryDb,
  createTempDb,
  createTestDb,
  initEketSchema,
  insertTestData,
  clearTables,
  getAllTables,
  tableExists,
  getTableRowCount,
  createSqliteTestEnv,
  createIsolatedDbFactory,
  snapshotDb,
  compareSnapshots,
} from './sqlite-test.js';
import * as fs from 'fs';

describe('SQLite Test Helpers', () => {
  describe('createInMemoryDb', () => {
    it('should create in-memory database', () => {
      const db = createInMemoryDb();

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice');

      const result = db.prepare('SELECT * FROM users').get() as any;

      expect(result.name).toBe('Alice');

      db.close();
    });

    it('should be fast (no disk I/O)', () => {
      const db = createInMemoryDb();

      const startTime = Date.now();

      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)');

      for (let i = 0; i < 1000; i++) {
        db.prepare('INSERT INTO test (data) VALUES (?)').run(`data-${i}`);
      }

      const duration = Date.now() - startTime;

      // 1000 条插入应该很快（< 100ms）
      expect(duration).toBeLessThan(100);

      const count = db.prepare('SELECT COUNT(*) as count FROM test').get() as { count: number };
      expect(count.count).toBe(1000);

      db.close();
    });
  });

  describe('createTempDb', () => {
    it('should create temporary file database', () => {
      const { db, filePath } = createTempDb('test');

      expect(fs.existsSync(filePath)).toBe(true);

      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');

      db.close();

      // 清理
      fs.unlinkSync(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('createTestDb', () => {
    it('should create database with EKET schema', () => {
      const db = createTestDb();

      // 验证所有表是否存在
      expect(tableExists(db, 'retrospectives')).toBe(true);
      expect(tableExists(db, 'knowledge_base')).toBe(true);
      expect(tableExists(db, 'tasks')).toBe(true);
      expect(tableExists(db, 'agents')).toBe(true);

      db.close();
    });
  });

  describe('insertTestData', () => {
    it('should insert test data', () => {
      const db = createTestDb();

      const testData = [
        {
          id: 'retro-1',
          timestamp: Date.now(),
          category: 'success',
          summary: 'Test passed',
          details: null,
          agent_id: 'agent-1',
          session_id: 'session-1',
          metadata: null,
        },
        {
          id: 'retro-2',
          timestamp: Date.now(),
          category: 'failure',
          summary: 'Test failed',
          details: 'Error details',
          agent_id: 'agent-1',
          session_id: 'session-1',
          metadata: null,
        },
      ];

      insertTestData(db, 'retrospectives', testData);

      const count = getTableRowCount(db, 'retrospectives');
      expect(count).toBe(2);

      db.close();
    });

    it('should auto-serialize JSON objects', () => {
      const db = createTestDb();

      const testData = [
        {
          id: 'kb-1',
          type: 'artifact',
          title: 'Test Artifact',
          content: 'Content',
          tags: JSON.stringify(['tag1', 'tag2']),
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: { author: 'Test User' }, // 会被自动序列化
        },
      ];

      insertTestData(db, 'knowledge_base', testData);

      const result = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get('kb-1') as any;

      // metadata 应该是 JSON 字符串
      expect(typeof result.metadata).toBe('string');
      const parsed = JSON.parse(result.metadata);
      expect(parsed.author).toBe('Test User');

      db.close();
    });
  });

  describe('clearTables', () => {
    it('should clear all tables', () => {
      const db = createTestDb();

      insertTestData(db, 'tasks', [
        {
          id: 'task-1',
          title: 'Test Task',
          description: 'Description',
          status: 'pending',
          priority: 'high',
          assignee: 'agent-1',
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      expect(getTableRowCount(db, 'tasks')).toBe(1);

      clearTables(db);

      expect(getTableRowCount(db, 'tasks')).toBe(0);

      db.close();
    });

    it('should clear specific tables', () => {
      const db = createTestDb();

      insertTestData(db, 'tasks', [{ id: 'task-1', title: 'Task', description: null, status: 'pending', priority: null, assignee: null, created_at: Date.now(), updated_at: Date.now(), metadata: null }]);
      insertTestData(db, 'agents', [{ id: 'agent-1', role: 'developer', status: 'active', last_heartbeat: Date.now(), metadata: null }]);

      clearTables(db, ['tasks']);

      expect(getTableRowCount(db, 'tasks')).toBe(0);
      expect(getTableRowCount(db, 'agents')).toBe(1);

      db.close();
    });
  });

  describe('createSqliteTestEnv', () => {
    const testEnv = createSqliteTestEnv(true); // 使用内存数据库

    beforeEach(() => {
      testEnv.setup();
    });

    afterEach(() => {
      testEnv.teardown();
    });

    it('should provide isolated test environment', () => {
      insertTestData(testEnv.db, 'tasks', [
        {
          id: 'task-1',
          title: 'Test',
          description: null,
          status: 'pending',
          priority: null,
          assignee: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      expect(getTableRowCount(testEnv.db, 'tasks')).toBe(1);
    });

    it('should support reset', () => {
      insertTestData(testEnv.db, 'tasks', [
        {
          id: 'task-1',
          title: 'Test',
          description: null,
          status: 'pending',
          priority: null,
          assignee: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      testEnv.reset();

      expect(getTableRowCount(testEnv.db, 'tasks')).toBe(0);
    });

    it('should handle concurrent operations', () => {
      const stmt = testEnv.db.prepare('INSERT INTO tasks (id, title, description, status, priority, assignee, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        stmt.run(`task-${i}`, `Task ${i}`, null, 'pending', null, null, now, now, null);
      }

      expect(getTableRowCount(testEnv.db, 'tasks')).toBe(100);
    });
  });

  describe('createIsolatedDbFactory', () => {
    it('should create isolated databases', () => {
      const createDb = createIsolatedDbFactory();

      const db1 = createDb();
      const db2 = createDb();

      insertTestData(db1, 'tasks', [
        {
          id: 'task-1',
          title: 'DB1 Task',
          description: null,
          status: 'pending',
          priority: null,
          assignee: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      insertTestData(db2, 'tasks', [
        {
          id: 'task-2',
          title: 'DB2 Task',
          description: null,
          status: 'pending',
          priority: null,
          assignee: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      // 两个数据库应该完全隔离
      expect(getTableRowCount(db1, 'tasks')).toBe(1);
      expect(getTableRowCount(db2, 'tasks')).toBe(1);

      const task1 = db1.prepare('SELECT * FROM tasks').get() as any;
      const task2 = db2.prepare('SELECT * FROM tasks').get() as any;

      expect(task1.title).toBe('DB1 Task');
      expect(task2.title).toBe('DB2 Task');

      db1.close();
      db2.close();
    });
  });

  describe('snapshotDb and compareSnapshots', () => {
    it('should snapshot database state', () => {
      const db = createTestDb();

      insertTestData(db, 'tasks', [
        {
          id: 'task-1',
          title: 'Task 1',
          description: null,
          status: 'pending',
          priority: null,
          assignee: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      const snapshot = snapshotDb(db);

      expect(snapshot).toHaveProperty('tasks');
      expect(snapshot.tasks).toHaveLength(1);

      db.close();
    });

    it('should compare snapshots', () => {
      const db = createTestDb();

      const snapshot1 = snapshotDb(db);

      insertTestData(db, 'tasks', [
        {
          id: 'task-1',
          title: 'Task 1',
          description: null,
          status: 'pending',
          priority: null,
          assignee: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        },
      ]);

      const snapshot2 = snapshotDb(db);

      // 快照应该不同
      expect(compareSnapshots(snapshot1, snapshot2)).toBe(false);

      // 相同快照应该相等
      expect(compareSnapshots(snapshot1, snapshot1)).toBe(true);

      db.close();
    });
  });

  describe('Performance Test', () => {
    it('should handle large datasets efficiently', () => {
      const db = createInMemoryDb();

      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, data TEXT)');

      const startTime = Date.now();

      const stmt = db.prepare('INSERT INTO test (data) VALUES (?)');
      for (let i = 0; i < 10000; i++) {
        stmt.run(`data-${i}`);
      }

      const duration = Date.now() - startTime;

      // 10000 条插入应该在 1 秒内完成
      expect(duration).toBeLessThan(1000);

      const count = db.prepare('SELECT COUNT(*) as count FROM test').get() as { count: number };
      expect(count.count).toBe(10000);

      db.close();
    });
  });
});
