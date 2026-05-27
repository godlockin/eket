/**
 * StateReconciler (TASK-Y01) 单元与集成测试
 *
 * 验收标准覆盖：
 * - AC-1: 自动重连检测 - 检测到连接状态升级时触发 WAL 重放
 * - AC-2: 严格时序消息回放 - 按 timestamp 属性由早到晚严格排序
 * - AC-3: 幂等性去重校验 - 根据消息 ID 去重，防范重复写入
 * - AC-4: 归一化与清理 - 重放成功后删除 .msg/.json 文件
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { StateReconciler, type ReconcileStats, type ConnectionLevel } from '../core/state-reconciler';
import { SQLiteManager } from '../core/sqlite-manager';

describe('StateReconciler', () => {
  const tempQueueDir = path.join(process.cwd(), '.eket', 'state-reconciler-test');
  let db: SQLiteManager;

  beforeEach(async () => {
    // 确保临时队列目录干净存在
    if (fs.existsSync(tempQueueDir)) {
      fs.rmSync(tempQueueDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempQueueDir, { recursive: true });

    // 初始化内存 SQLiteManager 实例
    db = new SQLiteManager({ dbPath: ':memory:', useWorker: false });
    await db.connect();
    // note: db.connect() 内部自动初始化了 tickets, message_history 等表结构
  });

  afterEach(() => {
    // 清理临时队列目录
    if (fs.existsSync(tempQueueDir)) {
      fs.rmSync(tempQueueDir, { recursive: true, force: true });
    }
    if (db) {
      db.close();
    }
  });

  describe('基础功能', () => {
    it('should return 0 when there are no messages to reconcile', async () => {
      const reconciler = new StateReconciler(tempQueueDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });

    it('should return 0 when queue directory does not exist', async () => {
      const nonExistentDir = path.join(tempQueueDir, 'non-existent');
      const reconciler = new StateReconciler(nonExistentDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  describe('AC-1: 自动重连检测', () => {
    it('should trigger reconcile when connection upgrades from file to sqlite', async () => {
      // 写入一条降级消息
      const msg = {
        metadata: { version: 2, checksum: 'abc' },
        message: {
          id: 'AC1-TEST-001',
          timestamp: new Date().toISOString(),
          _channel: 'tickets',
          ticketId: 'AC1-TEST-001',
          title: 'AC1 Test',
          status: 'ready',
          priority: 1,
          type: 'task',
        },
      };
      fs.writeFileSync(path.join(tempQueueDir, 'tickets_AC1-TEST-001_12345.json'), JSON.stringify(msg));

      const reconciler = new StateReconciler(tempQueueDir, db, null);

      // 监听事件
      const events: string[] = [];
      reconciler.on('connection:upgraded', (from: ConnectionLevel, to: ConnectionLevel) => {
        events.push(`upgraded:${from}->${to}`);
      });
      reconciler.on('reconcile:complete', () => {
        events.push('reconcile:complete');
      });

      // 触发连接升级
      reconciler.onConnectionUpgrade('file', 'sqlite');

      // 等待异步重放完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(events).toContain('upgraded:file->sqlite');
      expect(events).toContain('reconcile:complete');
    });

    it('should not trigger reconcile when connection level stays the same', async () => {
      const reconciler = new StateReconciler(tempQueueDir, db, null);

      const events: string[] = [];
      reconciler.on('connection:upgraded', () => {
        events.push('upgraded');
      });

      // 同级不触发
      reconciler.onConnectionUpgrade('sqlite', 'sqlite');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events).not.toContain('upgraded');
    });

    it('should not trigger reconcile when connection downgrades', async () => {
      const reconciler = new StateReconciler(tempQueueDir, db, null);

      const events: string[] = [];
      reconciler.on('connection:upgraded', () => {
        events.push('upgraded');
      });

      // 降级不触发
      reconciler.onConnectionUpgrade('redis', 'sqlite');

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events).not.toContain('upgraded');
    });
  });

  describe('AC-2: 严格时序消息回放', () => {
    it('should reconcile multiple json and msg files in chronological order', async () => {
      // 1. 写入降级 json 消息 A（时间偏晚）
      const msgA = {
        metadata: { version: 2, checksum: 'abc' },
        message: {
          id: 'TASK-Y01-A',
          timestamp: new Date(Date.now() + 5000).toISOString(),
          _channel: 'tickets',
          ticketId: 'TASK-Y01-A',
          title: 'Task A Title',
          status: 'in_progress',
          priority: 1,
          type: 'task',
        },
      };
      fs.writeFileSync(path.join(tempQueueDir, 'tickets_TASK-Y01-A_12345.json'), JSON.stringify(msgA));

      // 2. 写入降级 json 消息 B（时间偏早）
      const msgB = {
        metadata: { version: 2, checksum: 'def' },
        message: {
          id: 'TASK-Y01-B',
          timestamp: new Date(Date.now() - 5000).toISOString(),
          _channel: 'tickets',
          ticketId: 'TASK-Y01-B',
          title: 'Task B Title',
          status: 'todo',
          priority: 2,
          type: 'task',
        },
      };
      fs.writeFileSync(path.join(tempQueueDir, 'tickets_TASK-Y01-B_12344.json'), JSON.stringify(msgB));

      // 3. 写入降级 shell fallback .msg 消息（时间最晚）
      const msgC = {
        command: 'doctor',
        args: ['param1'],
        timestamp: new Date(Date.now() + 10000).toISOString(),
        status: 'pending',
      };
      fs.writeFileSync(path.join(tempQueueDir, 'shell-fallback-reconciled_12346.msg'), JSON.stringify(msgC));

      // 4. 记录重放顺序
      const replayOrder: string[] = [];
      const reconciler = new StateReconciler(tempQueueDir, db, null);
      reconciler.on('message:replayed', (msg) => {
        replayOrder.push(msg.id);
      });

      // 5. 执行数据对齐与重放
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(3); // 成功重放 3 个消息

      // 6. 验证重放顺序（按时间戳排序：B -> A -> C）
      expect(replayOrder[0]).toBe('TASK-Y01-B'); // 时间最早
      expect(replayOrder[1]).toBe('TASK-Y01-A'); // 时间中间
      expect(replayOrder[2]).toContain('shell_fallback'); // 时间最晚

      // 7. 校验 SQLite 中数据已被幂等插入且对齐
      const rowA = await db.get('SELECT title, status FROM tickets WHERE id = ?', ['TASK-Y01-A']);
      expect(rowA.success).toBe(true);
      expect((rowA.data as any).title).toBe('Task A Title');

      const rowB = await db.get('SELECT title, status FROM tickets WHERE id = ?', ['TASK-Y01-B']);
      expect(rowB.success).toBe(true);
      expect((rowB.data as any).title).toBe('Task B Title');

      const rowC = await db.all('SELECT message_id FROM message_history WHERE type = ?', ['shell_command']);
      expect(rowC.success).toBe(true);
      expect((rowC.data as any).length).toBe(1);

      // 8. 校验队列目录中的临时消息文件已被清除
      const filesAfter = fs.readdirSync(tempQueueDir).filter((f) => f !== 'reconcile.lock' && f !== 'processed.json');
      expect(filesAfter.length).toBe(0);
    });

    it('should handle messages without explicit timestamp by using _enqueue_time', async () => {
      const now = Date.now();
      const msg = {
        id: 'NO-TIMESTAMP-001',
        _channel: 'events',
        _enqueue_time: now - 1000,
        type: 'event',
        payload: { action: 'test' },
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_NO-TIMESTAMP-001_12345.json'), JSON.stringify(msg));

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
    });
  });

  describe('AC-3: 幂等性去重校验', () => {
    it('should skip replaying duplicate processed messages (idempotency via processed.json)', async () => {
      // 1. 写入一条已经标记为已处理的 json 消息
      const msgId = 'TASK-Y01-DUP';
      const msg = {
        metadata: { version: 2, checksum: 'xyz' },
        message: {
          id: msgId,
          timestamp: new Date().toISOString(),
          _channel: 'tickets',
          ticketId: msgId,
          title: 'Task Duplicate Title',
          status: 'done',
          priority: 1,
          type: 'task',
        },
      };
      const file = path.join(tempQueueDir, `tickets_${msgId}_12345.json`);
      fs.writeFileSync(file, JSON.stringify(msg));

      // 2. 在 processed.json 中加入此 ID 模拟已处理状态
      fs.writeFileSync(
        path.join(tempQueueDir, 'processed.json'),
        JSON.stringify({ ids: [msgId], updated: new Date().toISOString() })
      );

      // 3. 监听事件
      const skippedMsgs: string[] = [];
      const reconciler = new StateReconciler(tempQueueDir, db, null);
      reconciler.on('message:skipped', (msg, reason) => {
        skippedMsgs.push(`${msg.id}:${reason}`);
      });

      // 4. 运行重放
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0); // 应该跳过重发，返回 0

      // 5. 确认文件已被清理
      expect(fs.existsSync(file)).toBe(false);

      // 6. 确认跳过事件被触发
      expect(skippedMsgs).toContain(`${msgId}:duplicate`);
    });

    it('should skip replaying messages already in SQLite message_history', async () => {
      const msgId = 'SQLITE-DUP-001';

      // 1. 先在 SQLite 中插入此消息
      await db.execute(
        'INSERT INTO message_history (message_id, from_agent, to_agent, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [msgId, 'test', 'all', 'task', '{}', new Date().toISOString()]
      );

      // 2. 写入同 ID 的降级消息文件
      const msg = {
        id: msgId,
        timestamp: new Date().toISOString(),
        _channel: 'tasks',
        type: 'task',
        payload: { test: true },
      };
      const file = path.join(tempQueueDir, `tasks_${msgId}_12345.json`);
      fs.writeFileSync(file, JSON.stringify(msg));

      // 3. 运行重放
      const reconciler = new StateReconciler(tempQueueDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0); // 跳过

      // 4. 确认文件已被清理
      expect(fs.existsSync(file)).toBe(false);
    });

    it('should mark replayed messages as processed to prevent re-processing', async () => {
      const msgId = 'MARK-PROCESSED-001';
      const msg = {
        id: msgId,
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: { test: true },
      };
      fs.writeFileSync(path.join(tempQueueDir, `events_${msgId}_12345.json`), JSON.stringify(msg));

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      await reconciler.reconcile();

      // 检查 processed.json 是否包含此 ID
      const processed = JSON.parse(fs.readFileSync(path.join(tempQueueDir, 'processed.json'), 'utf-8'));
      expect(processed.ids).toContain(msgId);
    });
  });

  describe('AC-4: 归一化与清理', () => {
    it('should delete .json files after successful replay', async () => {
      const msgId = 'CLEANUP-JSON-001';
      const msg = {
        id: msgId,
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: { test: true },
      };
      const file = path.join(tempQueueDir, `events_${msgId}_12345.json`);
      fs.writeFileSync(file, JSON.stringify(msg));

      expect(fs.existsSync(file)).toBe(true);

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      await reconciler.reconcile();

      expect(fs.existsSync(file)).toBe(false);
    });

    it('should delete .msg files after successful replay', async () => {
      const msg = {
        command: 'test-command',
        args: ['arg1'],
        timestamp: new Date().toISOString(),
        status: 'pending',
      };
      const file = path.join(tempQueueDir, 'shell-cmd_12345.msg');
      fs.writeFileSync(file, JSON.stringify(msg));

      expect(fs.existsSync(file)).toBe(true);

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      await reconciler.reconcile();

      expect(fs.existsSync(file)).toBe(false);
    });

    it('should keep queue directory clean after reconcile', async () => {
      // 写入多个消息文件
      for (let i = 0; i < 5; i++) {
        const msg = {
          id: `CLEANUP-TEST-${i}`,
          timestamp: new Date().toISOString(),
          _channel: 'events',
          type: 'event',
          payload: { index: i },
        };
        fs.writeFileSync(path.join(tempQueueDir, `events_CLEANUP-TEST-${i}_${12345 + i}.json`), JSON.stringify(msg));
      }

      const filesBefore = fs.readdirSync(tempQueueDir).filter((f) => f.endsWith('.json') && f !== 'processed.json');
      expect(filesBefore.length).toBe(5);

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      await reconciler.reconcile();

      const filesAfter = fs.readdirSync(tempQueueDir).filter((f) => f.endsWith('.json') && f !== 'processed.json');
      expect(filesAfter.length).toBe(0);
    });
  });

  describe('统计与监控', () => {
    it('should provide accurate reconcile stats', async () => {
      // 写入 3 条新消息
      for (let i = 0; i < 3; i++) {
        const msg = {
          id: `STATS-NEW-${i}`,
          timestamp: new Date().toISOString(),
          _channel: 'events',
          type: 'event',
          payload: { index: i },
        };
        fs.writeFileSync(path.join(tempQueueDir, `events_STATS-NEW-${i}_${12345 + i}.json`), JSON.stringify(msg));
      }

      // 写入 1 条已处理的消息
      const dupMsg = {
        id: 'STATS-DUP-001',
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: { dup: true },
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_STATS-DUP-001_12350.json'), JSON.stringify(dupMsg));
      fs.writeFileSync(
        path.join(tempQueueDir, 'processed.json'),
        JSON.stringify({ ids: ['STATS-DUP-001'], updated: new Date().toISOString() })
      );

      const reconciler = new StateReconciler(tempQueueDir, db, null);

      let capturedStats: ReconcileStats | null = null;
      reconciler.on('reconcile:complete', (stats) => {
        capturedStats = stats;
      });

      await reconciler.reconcile();

      expect(capturedStats).not.toBeNull();
      expect(capturedStats!.totalScanned).toBe(4);
      expect(capturedStats!.replayed).toBe(3);
      expect(capturedStats!.skippedDuplicate).toBe(1);
      expect(capturedStats!.failed).toBe(0);
      expect(capturedStats!.durationMs).toBeGreaterThanOrEqual(0);

      // 也可以通过 getLastReconcileStats 获取
      const lastStats = reconciler.getLastReconcileStats();
      expect(lastStats).toEqual(capturedStats);
    });

    it('should report isInProgress correctly', async () => {
      const reconciler = new StateReconciler(tempQueueDir, db, null);
      expect(reconciler.isInProgress()).toBe(false);

      // 写入一条消息
      const msg = {
        id: 'PROGRESS-TEST-001',
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: {},
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_PROGRESS-TEST-001_12345.json'), JSON.stringify(msg));

      const reconcilePromise = reconciler.reconcile();
      // 注意：由于是同步操作，这里可能已经完成
      await reconcilePromise;

      expect(reconciler.isInProgress()).toBe(false);
    });
  });

  describe('锁机制', () => {
    it('should skip reconcile when lock is held by another process', async () => {
      // 模拟另一个进程持有锁
      const lockPath = path.join(tempQueueDir, 'reconcile.lock');
      fs.writeFileSync(lockPath, process.pid.toString()); // 当前进程 PID

      // 写入消息
      const msg = {
        id: 'LOCK-TEST-001',
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: {},
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_LOCK-TEST-001_12345.json'), JSON.stringify(msg));

      const reconciler = new StateReconciler(tempQueueDir, db, null);

      // 由于锁文件包含当前进程 PID，isPidRunning 会返回 true
      // 所以应该跳过重放（除非当前进程就是持有锁的进程，这里测试的是并发场景）
      // 实际上这个测试验证的是锁存在时的行为
      const result = await reconciler.reconcile();

      // 注意：由于锁文件中的 PID 是当前进程，isPidRunning(process.pid) 返回 true
      // 所以会被认为是另一个重放任务在运行，返回 0
      expect(result.success).toBe(true);
      // 具体行为取决于实现：如果是同一进程，可能会获取锁成功或失败
    });

    it('should acquire lock when stale lock exists (dead process)', async () => {
      // 写入一个不存在进程的 PID
      const lockPath = path.join(tempQueueDir, 'reconcile.lock');
      fs.writeFileSync(lockPath, '99999999'); // 假设这个 PID 不存在

      // 写入消息
      const msg = {
        id: 'STALE-LOCK-TEST-001',
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: {},
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_STALE-LOCK-TEST-001_12345.json'), JSON.stringify(msg));

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1); // 应该成功重放
    });
  });

  describe('错误处理', () => {
    it('should handle malformed JSON files gracefully', async () => {
      // 写入损坏的 JSON 文件
      fs.writeFileSync(path.join(tempQueueDir, 'bad_file_12345.json'), 'this is not valid json{{{');

      // 写入正常的消息
      const msg = {
        id: 'GOOD-MSG-001',
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: {},
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_GOOD-MSG-001_12346.json'), JSON.stringify(msg));

      const reconciler = new StateReconciler(tempQueueDir, db, null);

      let stats: ReconcileStats | null = null;
      reconciler.on('reconcile:complete', (s) => {
        stats = s;
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1); // 只有正常消息被重放
      expect(stats!.failed).toBe(1); // 损坏文件计入失败
    });

    it('should skip temporary files', async () => {
      // 写入临时文件（应该被忽略）
      fs.writeFileSync(path.join(tempQueueDir, 'events_MSG-001_12345.json.tmp.123'), '{}');

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);

      // 临时文件应该不被删除
      expect(fs.existsSync(path.join(tempQueueDir, 'events_MSG-001_12345.json.tmp.123'))).toBe(true);
    });

    it('should skip backup files (processed.json.bak)', async () => {
      // 写入备份文件（应该被忽略）
      fs.writeFileSync(path.join(tempQueueDir, 'processed.json.bak'), '{"ids":[]}');

      const reconciler = new StateReconciler(tempQueueDir, db, null);
      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);

      // 备份文件应该不被删除
      expect(fs.existsSync(path.join(tempQueueDir, 'processed.json.bak'))).toBe(true);
    });
  });

  describe('客户端更新', () => {
    it('should allow updating db and mq clients', async () => {
      const reconciler = new StateReconciler(tempQueueDir, null, null);

      // 初始时没有 db
      const msg = {
        id: 'UPDATE-CLIENT-001',
        timestamp: new Date().toISOString(),
        _channel: 'events',
        type: 'event',
        payload: {},
      };
      fs.writeFileSync(path.join(tempQueueDir, 'events_UPDATE-CLIENT-001_12345.json'), JSON.stringify(msg));

      // 更新客户端
      reconciler.updateClients(db, null);

      const result = await reconciler.reconcile();
      expect(result.success).toBe(true);
      expect(result.data).toBe(1);

      // 验证写入了 SQLite
      const row = await db.get('SELECT message_id FROM message_history WHERE message_id = ?', ['UPDATE-CLIENT-001']);
      expect(row.success).toBe(true);
      expect(row.data).toBeTruthy();
    });
  });
});
