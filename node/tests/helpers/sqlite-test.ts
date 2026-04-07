/**
 * SQLite 测试辅助工具
 *
 * 提供内存数据库和测试数据管理
 *
 * @module tests/helpers/sqlite-test
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 创建内存 SQLite 数据库
 *
 * 内存数据库特点：
 * - 速度快：无磁盘 I/O
 * - 隔离性好：每个测试独立
 * - 自动清理：进程结束自动销毁
 *
 * @returns SQLite 数据库实例
 *
 * @example
 * ```typescript
 * const db = createInMemoryDb();
 * db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
 * db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice');
 * ```
 */
export function createInMemoryDb(): Database.Database {
  return new Database(':memory:');
}

/**
 * 创建临时文件 SQLite 数据库
 *
 * 用于需要持久化的测试场景
 *
 * @param prefix - 文件名前缀
 * @returns 数据库实例和文件路径
 *
 * @example
 * ```typescript
 * const { db, filePath } = createTempDb('test');
 * try {
 *   // 使用数据库
 *   db.exec('CREATE TABLE...');
 * } finally {
 *   db.close();
 *   fs.unlinkSync(filePath); // 清理
 * }
 * ```
 */
export function createTempDb(prefix: string = 'eket-test'): {
  db: Database.Database;
  filePath: string;
} {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

  const db = new Database(filePath);

  return { db, filePath };
}

/**
 * 初始化 EKET 数据库结构
 *
 * 创建所有必需的表
 *
 * @param db - 数据库实例
 */
export function initEketSchema(db: Database.Database): void {
  // Retrospective 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS retrospectives (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT,
      agent_id TEXT,
      session_id TEXT,
      metadata TEXT
    );
  `);

  // Knowledge Base 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT
    );
  `);

  // Task 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT,
      assignee TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT
    );
  `);

  // Agent Registry 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      last_heartbeat INTEGER NOT NULL,
      metadata TEXT
    );
  `);
}

/**
 * 创建完整的测试数据库
 *
 * 内存数据库 + EKET schema
 *
 * @returns 数据库实例
 */
export function createTestDb(): Database.Database {
  const db = createInMemoryDb();
  initEketSchema(db);
  return db;
}

/**
 * 插入测试数据
 *
 * @param db - 数据库实例
 * @param table - 表名
 * @param data - 数据对象数组
 */
export function insertTestData(
  db: Database.Database,
  table: string,
  data: Record<string, any>[]
): void {
  if (data.length === 0) return;

  const columns = Object.keys(data[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  const stmt = db.prepare(sql);

  for (const row of data) {
    const values = columns.map(col => {
      const value = row[col];
      // 自动序列化对象为 JSON
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
      }
      return value;
    });
    stmt.run(...values);
  }
}

/**
 * 清空表数据
 *
 * @param db - 数据库实例
 * @param tables - 表名数组，不提供则清空所有表
 */
export function clearTables(db: Database.Database, tables?: string[]): void {
  const tablesToClear = tables || getAllTables(db);

  for (const table of tablesToClear) {
    db.exec(`DELETE FROM ${table}`);
  }
}

/**
 * 获取所有表名
 *
 * @param db - 数据库实例
 * @returns 表名数组
 */
export function getAllTables(db: Database.Database): string[] {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all() as Array<{ name: string }>;

  return rows.map(row => row.name);
}

/**
 * 验证表是否存在
 *
 * @param db - 数据库实例
 * @param tableName - 表名
 * @returns 是否存在
 */
export function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName) as { count: number } | undefined;

  return row ? row.count > 0 : false;
}

/**
 * 获取表行数
 *
 * @param db - 数据库实例
 * @param tableName - 表名
 * @returns 行数
 */
export function getTableRowCount(db: Database.Database, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
  return row.count;
}

/**
 * SQLite 测试环境
 *
 * 提供 setup/teardown 辅助
 *
 * @example
 * ```typescript
 * const testEnv = createSqliteTestEnv();
 *
 * beforeEach(() => {
 *   testEnv.setup();
 * });
 *
 * afterEach(() => {
 *   testEnv.teardown();
 * });
 *
 * it('should work', () => {
 *   testEnv.db.exec('INSERT INTO...');
 *   expect(getTableRowCount(testEnv.db, 'users')).toBe(1);
 * });
 * ```
 */
export function createSqliteTestEnv(useMemory: boolean = true) {
  let db: Database.Database | null = null;
  let filePath: string | null = null;

  return {
    get db(): Database.Database {
      if (!db) {
        throw new Error('Database not initialized. Call setup() first.');
      }
      return db;
    },

    setup(): void {
      if (useMemory) {
        db = createTestDb();
      } else {
        const temp = createTempDb();
        db = temp.db;
        filePath = temp.filePath;
        initEketSchema(db);
      }
    },

    teardown(): void {
      if (db) {
        db.close();
        db = null;
      }
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        filePath = null;
      }
    },

    reset(): void {
      if (db) {
        clearTables(db);
      }
    },
  };
}

/**
 * 并行测试隔离器
 *
 * 为每个测试创建独立的数据库实例
 *
 * @returns 数据库工厂函数
 *
 * @example
 * ```typescript
 * const createDb = createIsolatedDbFactory();
 *
 * test.concurrent('test 1', () => {
 *   const db = createDb();
 *   // 测试逻辑
 *   db.close();
 * });
 *
 * test.concurrent('test 2', () => {
 *   const db = createDb();
 *   // 测试逻辑
 *   db.close();
 * });
 * ```
 */
export function createIsolatedDbFactory(): () => Database.Database {
  return () => createTestDb();
}

/**
 * 快照数据库状态
 *
 * 用于测试前后对比
 *
 * @param db - 数据库实例
 * @returns 数据库快照
 */
export function snapshotDb(db: Database.Database): Record<string, any[]> {
  const tables = getAllTables(db);
  const snapshot: Record<string, any[]> = {};

  for (const table of tables) {
    snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }

  return snapshot;
}

/**
 * 比较数据库快照
 *
 * @param snapshot1 - 快照1
 * @param snapshot2 - 快照2
 * @returns 是否相同
 */
export function compareSnapshots(
  snapshot1: Record<string, any[]>,
  snapshot2: Record<string, any[]>
): boolean {
  const tables1 = Object.keys(snapshot1).sort();
  const tables2 = Object.keys(snapshot2).sort();

  if (JSON.stringify(tables1) !== JSON.stringify(tables2)) {
    return false;
  }

  for (const table of tables1) {
    if (JSON.stringify(snapshot1[table]) !== JSON.stringify(snapshot2[table])) {
      return false;
    }
  }

  return true;
}
