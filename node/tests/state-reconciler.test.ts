/**
 * StateReconciler (TASK-Y01) 单元与集成测试
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { StateReconciler } from '../core/state-reconciler';
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

  it('should return 0 when there are no messages to reconcile', async () => {
    const reconciler = new StateReconciler(tempQueueDir, db, null);
    const result = await reconciler.reconcile();

    expect(result.success).toBe(true);
    expect(result.data).toBe(0);
  });

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

    // 4. 执行数据对齐与重放
    const reconciler = new StateReconciler(tempQueueDir, db, null);
    const result = await reconciler.reconcile();

    expect(result.success).toBe(true);
    expect(result.data).toBe(3); // 成功重放 3 个消息

    // 5. 校验 SQLite 中数据已被幂等插入且对齐
    const rowA = await db.get('SELECT title, status FROM tickets WHERE id = ?', ['TASK-Y01-A']);
    expect(rowA.success).toBe(true);
    expect((rowA.data as any).title).toBe('Task A Title');

    const rowB = await db.get('SELECT title, status FROM tickets WHERE id = ?', ['TASK-Y01-B']);
    expect(rowB.success).toBe(true);
    expect((rowB.data as any).title).toBe('Task B Title');

    const rowC = await db.all('SELECT message_id FROM message_history WHERE type = ?', ['shell_command']);
    expect(rowC.success).toBe(true);
    expect((rowC.data as any).length).toBe(1);

    // 6. 校验队列目录中的临时消息文件已被清除
    const filesAfter = fs.readdirSync(tempQueueDir).filter((f) => f !== 'reconcile.lock' && f !== 'processed.json');
    expect(filesAfter.length).toBe(0);
  });

  it('should skip replaying duplicate processed messages (idempotency)', async () => {
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

    // 3. 运行重放
    const reconciler = new StateReconciler(tempQueueDir, db, null);
    const result = await reconciler.reconcile();

    expect(result.success).toBe(true);
    expect(result.data).toBe(0); // 应该跳过重发，返回 0

    // 4. 确认文件已被清理
    expect(fs.existsSync(file)).toBe(false);
  });
});
