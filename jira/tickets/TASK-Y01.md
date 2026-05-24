# TASK-Y01: WAL/Raft 消息重放与多级状态对齐

**ID**: TASK-Y01  
**Epic**: EPIC-009  
**优先级**: P0  
**预估**: 6h  
**依赖**: None  
**Agent Type**: backend  
**Category**: 🔧 Core Logic / Reliability

---

## Goal

实现高级自愈机制。当 EKET 从降级模式（仅能写入文件队列）重新连线上升（恢复到 Redis + SQLite 状态）时，自动扫描本地待处理消息文件，将其按时间戳重新排序，进行一致性回放与对齐，防范状态机偏置。

---

## Acceptance Criteria

**AC-1**: 自动重连检测  
- Given: Redis / SQLite 重新上线且心跳恢复
- When: 检测到连接状态由 `file` 升级为 `sqlite`/`redis`
- Then: 自动触发 WAL 消息回放模块

**AC-2**: 严格时序消息回放  
- Given: 扫描到多个降级期间写入 `.eket/data/queue/*.msg` 消息文件
- When: 启动重放流
- Then: 将消息按 `timestamp` 属性由早到晚严格排序，依次写入 SQLite 和发布到 Redis Pub/Sub

**AC-3**: 幂等性去重校验  
- Given: 重放带有唯一消息 ID 的消息
- When: 写入 SQLite/Redis
- Then: 自动检查唯一键，如果该事件已被同步处理，则跳过，防范重复写入

**AC-4**: 归一化与清理自愈  
- Given: 消息重放且消费确认成功
- When: 完成最终对齐
- Then: 自动删除降级 `.msg` 消息文件，保持队列目录清爽

---

## Implementation Sketch

在 `node/src/core/connection-manager.ts` 或新建立的 `state-reconciler.ts` 中实现：

```typescript
export class StateReconciler {
  private queueDir: string;
  private dbClient: SQLiteClient;
  private redisClient: RedisClient;

  constructor(queueDir: string, db: SQLiteClient, redis: RedisClient) {
    this.queueDir = queueDir;
    this.dbClient = db;
    this.redisClient = redis;
  }

  async reconcile(): Promise<void> {
    // 1. 获取分布式重放排它锁 (ElectMaster/FileLock)
    const hasLock = await this.acquireReconcileLock();
    if (!hasLock) return;

    try {
      // 2. 扫描 .eket/data/queue/*.msg 文件
      const files = await this.scanMsgFiles();
      if (files.length === 0) return;

      // 3. 解析并排序
      const messages = await this.parseAndSort(files);

      // 4. 依次执行幂等回放
      for (const msg of messages) {
        const isDuplicate = await this.checkDuplicate(msg.id);
        if (!isDuplicate) {
          await this.replayToSQLite(msg);
          await this.replayToRedis(msg);
        }
        await this.deleteProcessedFile(msg.filePath);
      }
      console.log(`[Reconciler] 成功对齐并清理了 ${messages.length} 条降级消息。`);
    } finally {
      await this.releaseReconcileLock();
    }
  }
}
```

---

## Test Strategy

**Integration**: Mock 物理断网 -> 写入 5 条 file-queue 消息 -> 恢复网络环境 -> 启动 reconciler -> 校验 SQLite 库和 Redis channel 中是否收到正确时序且无重复的 5 条消息。

---

**Blocked By**: None  
**Blocks**: TASK-Y02  
**Created**: 2026-05-24
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/4
test_coverage: 0%
