/**
 * SQLite Async Client Module
 * 使用 Worker 线程封装 better-sqlite3 同步 API，避免阻塞事件循环
 *
 * Phase 7: 性能优化 - 解决 SQLite 同步阻塞问题
 */

import * as fs from 'fs';
import * as path from 'path';
import { Worker, isMainThread, parentPort, MessagePort } from 'worker_threads';

import Database from 'better-sqlite3';

import type { ISQLiteClient, Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

interface WorkerRequest {
  id: number;
  type: WorkerOperationType;
  payload: unknown;
}

interface WorkerInitMessage {
  type: 'init';
  dbPath: string;
}

interface WorkerResponse {
  id: number;
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

type WorkerOperationType =
  | 'connect'
  | 'close'
  | 'execute'
  | 'get'
  | 'all'
  | 'insertRetrospective'
  | 'getRetrospective'
  | 'listRetrospectives'
  | 'insertRetroContent'
  | 'getRetroContentByCategory'
  | 'searchRetrospectives'
  | 'generateReport';

function runWorker() {
  let db: Database.Database | null = null;
  let dbPath: string | null = null;

  function sendResponse(port: MessagePort, requestId: number, response: Omit<WorkerResponse, 'id'>) {
    port.postMessage({ id: requestId, ...response });
  }

  if (!parentPort) return;
  const port = parentPort;

  port.on('message', (message: WorkerRequest | WorkerInitMessage) => {
      // Handle initialization message
      if ('type' in message && message.type === 'init') {
        dbPath = (message as WorkerInitMessage).dbPath;
        port.postMessage({ type: 'init_ack' });
        return;
      }

      const request = message as WorkerRequest;
      try {
        switch (request.type) {
          case 'connect': {
            try {
              if (!dbPath) {
                sendResponse(port, request.id, {
                  success: false,
                  error: { code: EketErrorCode.SQLITE_DBPATH_NOT_SET, message: 'Database path not initialized' },
                });
                break;
              }
              const dir = path.dirname(dbPath);
              fs.mkdirSync(dir, { recursive: true });
              db = new Database(dbPath);
              db.pragma('foreign_keys = ON');
              initializeTables(db);
              sendResponse(port, request.id, { success: true, data: undefined });
            } catch {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_CONNECTION_FAILED', message: 'Failed to connect SQLite' },
              });
            }
            break;
          }

          case 'close': {
            if (db) { db.close(); db = null; }
            sendResponse(port, request.id, { success: true, data: undefined });
            break;
          }

          case 'execute': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { sql, params } = request.payload as { sql: string; params: unknown[] };
            db.prepare(sql).run(...params);
            sendResponse(port, request.id, { success: true, data: undefined });
            break;
          }

          case 'get': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { sql, params } = request.payload as { sql: string; params: unknown[] };
            const row = db.prepare(sql).get(...params);
            sendResponse(port, request.id, { success: true, data: row || null });
            break;
          }

          case 'all': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { sql, params } = request.payload as { sql: string; params: unknown[] };
            const rows = db.prepare(sql).all(...params);
            sendResponse(port, request.id, { success: true, data: rows || [] });
            break;
          }

          case 'insertRetrospective': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { sprintId, fileName, title, date } = request.payload as {
              sprintId: string; fileName: string; title: string; date: string;
            };
            const stmt = db.prepare('INSERT OR REPLACE INTO retrospectives (sprint_id, file_name, title, date) VALUES (?, ?, ?, ?)');
            const result = stmt.run(sprintId, fileName, title, date);
            sendResponse(port, request.id, { success: true, data: result.lastInsertRowid });
            break;
          }

          case 'getRetrospective': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { sprintId } = request.payload as { sprintId: string };
            const stmt = db.prepare('SELECT * FROM retrospectives WHERE sprint_id = ?');
            const retro = stmt.get(sprintId);
            sendResponse(port, request.id, { success: true, data: retro || null });
            break;
          }

          case 'listRetrospectives': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const stmt = db.prepare('SELECT * FROM retrospectives ORDER BY date DESC');
            const retros = stmt.all();
            sendResponse(port, request.id, { success: true, data: retros });
            break;
          }

          case 'insertRetroContent': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { retroId, category, content, createdBy } = request.payload as {
              retroId: number; category: string; content: string; createdBy?: string;
            };
            const stmt = db.prepare('INSERT INTO retro_content (retro_id, category, content, created_by) VALUES (?, ?, ?, ?)');
            const result = stmt.run(retroId, category, content, createdBy);
            sendResponse(port, request.id, { success: true, data: result.lastInsertRowid });
            break;
          }

          case 'getRetroContentByCategory': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { retroId, category } = request.payload as { retroId: number; category: string };
            const stmt = db.prepare('SELECT * FROM retro_content WHERE retro_id = ? AND category = ?');
            const contents = stmt.all(retroId, category);
            sendResponse(port, request.id, { success: true, data: contents });
            break;
          }

          case 'searchRetrospectives': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const { keyword } = request.payload as { keyword: string };
            const escaped = escapeLikePattern(keyword);
            const pattern = `%${escaped}%`;
            const stmt = db.prepare('SELECT DISTINCT r.* FROM retrospectives r JOIN retro_content rc ON r.id = rc.retro_id WHERE r.title LIKE ? OR rc.content LIKE ? ORDER BY r.date DESC LIMIT 10');
            const retros = stmt.all(pattern, pattern);
            sendResponse(port, request.id, { success: true, data: retros });
            break;
          }

          case 'generateReport': {
            if (!db) {
              sendResponse(port, request.id, {
                success: false,
                error: { code: 'SQLITE_NOT_CONNECTED', message: 'Database not connected' },
              });
              break;
            }
            const statsStmt = db.prepare('SELECT COUNT(DISTINCT r.id) as totalRetrospectives, COUNT(DISTINCT r.sprint_id) as totalSprints, COUNT(rc.id) as totalItems FROM retrospectives r LEFT JOIN retro_content rc ON r.id = rc.retro_id');
            const stats = statsStmt.get() as { totalRetrospectives: number; totalSprints: number; totalItems: number };
            const categoryStmt = db.prepare('SELECT category, COUNT(*) as count FROM retro_content GROUP BY category ORDER BY count DESC');
            const byCategory = categoryStmt.all() as Array<{ category: string; count: number }>;
            sendResponse(port, request.id, { success: true, data: { ...stats, byCategory } });
            break;
          }

          default:
            sendResponse(port, request.id, {
              success: false,
              error: { code: 'UNKNOWN_OPERATION', message: `Unknown operation: ${request.type}` },
            });
        }
      } catch {
        sendResponse(port, request.id, {
          success: false,
          error: { code: 'SQLITE_OPERATION_FAILED', message: 'Operation failed' },
        });
      }
    });
    port.postMessage({ type: 'ready' });
}

function initializeTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS retrospectives (id INTEGER PRIMARY KEY AUTOINCREMENT, sprint_id TEXT NOT NULL, file_name TEXT UNIQUE, title TEXT NOT NULL, date TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS retro_content (id INTEGER PRIMARY KEY AUTOINCREMENT, retro_id INTEGER NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, vote_count INTEGER DEFAULT 0, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (retro_id) REFERENCES retrospectives(id));
    CREATE TABLE IF NOT EXISTS retro_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, retro_id INTEGER NOT NULL, tag TEXT NOT NULL, FOREIGN KEY (retro_id) REFERENCES retrospectives(id));
    CREATE INDEX IF NOT EXISTS idx_retro_sprint ON retrospectives(sprint_id);
    CREATE INDEX IF NOT EXISTS idx_retro_date ON retrospectives(date);
    CREATE INDEX IF NOT EXISTS idx_retro_content_category ON retro_content(category);
    CREATE INDEX IF NOT EXISTS idx_retro_tags_tag ON retro_tags(tag);
    CREATE TABLE IF NOT EXISTS task_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, title TEXT, status TEXT, assigned_to TEXT, started_at TIMESTAMP, completed_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS message_history (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE, from_agent TEXT, to_agent TEXT, type TEXT, payload TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_task_status ON task_history(status);
    CREATE INDEX IF NOT EXISTS idx_message_type ON message_history(type);
  `);
}

function escapeLikePattern(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class AsyncSQLiteClient implements ISQLiteClient {
  private worker: Worker | null = null;
  private dbPath: string;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (data: unknown) => void; reject: (error: Error) => void }> = new Map();
  private ready = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.eket', 'data', 'sqlite', 'eket.db');
  }

  async connect(): Promise<Result<void>> {
    return new Promise((resolve) => {
      const workerUrl = new URL(import.meta.url);
      this.worker = new Worker(workerUrl.toString());

      let initAcknowledged = false;

      this.worker.on('message', (response: WorkerResponse & { type?: string }) => {
        // Handle init acknowledgment
        if (response.type === 'init_ack') {
          initAcknowledged = true;
          // After init is acknowledged, send connect request
          this.sendRequest('connect', undefined).then(() => {
            this.ready = true;
            console.log(`[AsyncSQLite] Connected to ${this.dbPath}`);
            resolve({ success: true, data: undefined });
          }).catch((err: Error) => {
            resolve({ success: false, error: new EketError(EketErrorCode.SQLITE_CONNECTION_FAILED, err.message) });
          });
          return;
        }

        if (response.type === 'ready') {
          // Worker is ready; send init message with dbPath
          if (!initAcknowledged) {
            this.worker!.postMessage({ type: 'init', dbPath: this.dbPath } as WorkerInitMessage);
          }
          return;
        }

        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.success) { pending.resolve(response.data); }
          else { pending.reject(new Error(`${response.error?.code}: ${response.error?.message}`)); }
        }
      });

      this.worker.on('error', (err) => {
        console.error('[AsyncSQLite] Worker error:', err);
        resolve({ success: false, error: new EketError(EketErrorCode.SQLITE_CONNECTION_FAILED, err.message) });
      });

      this.worker.on('exit', (code) => {
        console.log(`[AsyncSQLite] Worker exited with code: ${code}`);
        this.ready = false;
      });
    });
  }

  private sendRequest(type: WorkerOperationType, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) { reject(new Error('Worker not initialized')); return; }
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (!this.worker) { return; }
    await this.sendRequest('close', undefined);
    this.worker.terminate();
    this.worker = null;
    this.ready = false;
  }

  isReady(): boolean { return this.ready && this.worker !== null; }

  async execute(sql: string, params: unknown[] = []): Promise<Result<void>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      await this.sendRequest('execute', { sql, params });
      return { success: true, data: undefined };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async get(sql: string, params: unknown[] = []): Promise<Result<unknown>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const row = await this.sendRequest('get', { sql, params });
      return { success: true, data: row };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async all(sql: string, params: unknown[] = []): Promise<Result<unknown[]>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const rows = await this.sendRequest('all', { sql, params });
      return { success: true, data: rows as unknown[] };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async insertRetrospective(retro: { sprintId: string; fileName: string; title: string; date: string }): Promise<Result<number>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const id = (await this.sendRequest('insertRetrospective', retro)) as number;
      return { success: true, data: id };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async getRetrospective(sprintId: string): Promise<Result<unknown>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const retro = await this.sendRequest('getRetrospective', { sprintId });
      return { success: true, data: retro };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async listRetrospectives(): Promise<Result<unknown[]>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const retros = (await this.sendRequest('listRetrospectives', undefined)) as unknown[];
      return { success: true, data: retros };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async insertRetroContent(content: { retroId: number; category: string; content: string; createdBy?: string }): Promise<Result<number>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const id = (await this.sendRequest('insertRetroContent', content)) as number;
      return { success: true, data: id };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async getRetroContentByCategory(retroId: number, category: string): Promise<Result<unknown[]>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const contents = (await this.sendRequest('getRetroContentByCategory', { retroId, category })) as unknown[];
      return { success: true, data: contents };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async searchRetrospectives(keyword: string): Promise<Result<unknown[]>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const retros = (await this.sendRequest('searchRetrospectives', { keyword })) as unknown[];
      return { success: true, data: retros };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }

  async generateReport(): Promise<Result<{ totalRetrospectives: number; totalSprints: number; totalItems: number; byCategory: Array<{ category: string; count: number }> }>> {
    if (!this.isReady()) { return { success: false, error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected') }; }
    try {
      const report = (await this.sendRequest('generateReport', undefined)) as { totalRetrospectives: number; totalSprints: number; totalItems: number; byCategory: Array<{ category: string; count: number }> };
      return { success: true, data: report };
    } catch { return { success: false, error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Operation failed') }; }
  }
}

export function createAsyncSQLiteClient(dbPath?: string): AsyncSQLiteClient {
  return new AsyncSQLiteClient(dbPath);
}

// 如果不是主线程，运行 Worker
if (!isMainThread) {
  runWorker();
}
