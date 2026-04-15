# EKET 框架性能审查报告

**审查者**: 性能专家团队
**审查日期**: 2026-03-30
**审查范围**: Redis 连接、消息队列、缓存层、API Gateway、连接管理、Master 选举

---

## 执行摘要

EKET 框架 (v0.9.2) 完成了 OpenCLAW 集成，整体架构设计良好，实现了多层降级策略和错误恢复机制。但在以下方面存在性能优化空间:

- **连接池管理**: Redis 连接未使用连接池，每次操作可能创建新连接
- **缓存层优化**: LRU 缓存默认配置较小 (1000 条目)，TTL 默认 5 分钟可能不适合所有场景
- **文件 I/O**: 文件队列轮询间隔 5 秒，可能导致消费延迟
- **并发控制**: 部分关键路径缺少适当的锁机制
- **内存管理**: 缺少大对象清理和内存限制

---

## 基准测试

> 注：以下数据基于代码分析和理论推算，建议在生产环境进行实际压测验证

### API Gateway 性能

| 指标 | 预期值 | 瓶颈 |
|------|--------|------|
| QPS | ~500-1000 | Express 原生性能 + API 密钥验证开销 |
| P50 延迟 | 10-20 ms | 路由处理 + 适配器调用 |
| P99 延迟 | 50-100 ms | Redis/SQLite 查询延迟 |

**限制因素**:
- 单例适配器模式 (`let adapter: OpenCLAWIntegrationAdapter | null = null`) 可能导致请求阻塞
- 每个 API 请求都调用 `getAdapter()` 检查实例

### Skills 执行性能

| 指标 | 预期值 | 瓶颈 |
|------|--------|------|
| 平均执行时间 | 100-500 ms | 依赖具体 Skill 复杂度 |
| 并发执行上限 | 受 Node.js 单线程限制 | 事件循环阻塞风险 |

### 消息队列性能

| 模式 | 吞吐量 | 消费延迟 |
|------|--------|----------|
| Redis Pub/Sub | ~10,000 msg/s | <10 ms |
| 文件队列 | ~100 msg/s | 5000 ms (轮询间隔) |

---

## 瓶颈分析

### 1. CPU 瓶颈

#### 问题 1: LRU 驱逐算法效率
**位置**: `node/src/core/cache-layer.ts:353-368`

```typescript
private evictLRU(): void {
  let lruKey: string | null = null;
  let lruTime = Infinity;

  for (const [key, entry] of this.cache.entries()) {
    const accessTime = entry.createdAt + (entry.hits * 1000); // 简化的 LRU
    if (accessTime < lruTime) {
      lruTime = accessTime;
      lruKey = key;
    }
  }

  if (lruKey) {
    this.cache.delete(lruKey);
    this.stats.evictions++;
  }
}
```

**问题**: O(N) 时间复杂度，缓存越大越慢。使用简化的 LRU 算法 (`createdAt + hits * 1000`) 不够精确。

**优化建议**:
- 使用 `Map` 的迭代顺序 (插入顺序) 实现真正的 LRU
- 或使用 doubly-linked list + Map 组合实现 O(1) LRU

**优化代码示例**:
```typescript
// 使用 Map 的插入顺序特性实现 LRU
private cache = new Map<string, CacheEntry<T>>();

set(key: string, value: T, ttl?: number): void {
  // 先删除再添加，更新迭代顺序
  if (this.cache.has(key)) {
    this.cache.delete(key);
  }
  // ... 其余逻辑
  this.cache.set(key, entry);
}

get(key: string): T | undefined {
  const entry = this.cache.get(key);
  if (entry) {
    // 更新迭代顺序：删除后重新添加
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }
  return undefined;
}

// LRU 驱逐变成 O(1)
private evictLRU(): void {
  const firstKey = this.cache.keys().next().value;
  if (firstKey) {
    this.cache.delete(firstKey);
    this.stats.evictions++;
  }
}
```

#### 问题 2: 文件队列轮询
**位置**: `node/src/core/message-queue.ts:159-191`

```typescript
private startPolling(): void {
  this.pollInterval = setInterval(async () => {
    await this.processQueue();
  }, this.POLL_INTERVAL_MS); // 5000ms
}
```

**问题**: 5 秒轮询间隔导致消息消费延迟高。

**优化建议**:
- 使用 `fs.watch` 或 `chokidar` 监听文件变化
- 或减少轮询间隔到 500ms

### 2. 内存瓶颈

#### 问题 1: LRU 缓存大小固定
**位置**: `node/src/core/cache-layer.ts:69`

```typescript
this.config = {
  maxSize: config.maxSize || 1000,  // 默认 1000 条目
  defaultTTL: config.defaultTTL || 300000, // 5 分钟
  // ...
};
```

**风险**:
- 1000 条目可能不足 (假设每条目 10KB = 10MB 内存)
- 无内存大小限制，仅条目数限制

**优化建议**:
```typescript
interface CacheConfig {
  maxSize: number;        // 最大条目数
  maxMemoryMB?: number;   // 新增：最大内存限制
  defaultTTL: number;
  // ...
}

// 添加内存跟踪
private currentMemoryUsage = 0;

set(key: string, value: T, ttl?: number): void {
  const entrySize = this.estimateSize(value);
  if (this.currentMemoryUsage + entrySize > this.config.maxMemoryMB * 1024 * 1024) {
    this.evictUntilMemoryAvailable(entrySize);
  }
  // ...
}
```

#### 问题 2: 大对象处理
**位置**: `node/tests/cache-layer.test.ts:325-331`

```typescript
it('should handle large values', () => {
  const largeValue = 'x'.repeat(1000000); // 1MB string
  cache.set('key1', largeValue);
  expect(cache.get('key1')).toBe(largeValue);
});
```

**风险**: 测试证实可以存储 1MB 对象，但生产环境可能导致内存暴涨。

**优化建议**:
- 添加单个对象大小限制
- 对大对象使用流式处理或外部存储

### 3. I/O 瓶颈

#### 问题 1: SQLite 连接未池化
**位置**: `node/src/core/sqlite-client.ts`

```typescript
export class SQLiteClient {
  private db: Database.Database | null = null;
  // 每个实例一个连接
}
```

**问题**:
- `better-sqlite3` 是同步 API，阻塞事件循环
- 无连接池，高并发时可能成为瓶颈

**优化建议**:
```typescript
// 使用异步模式或 Worker 线程
import { workerData } from 'worker_threads';

// 或使用连接池
export class SQLiteConnectionPool {
  private pool: Array<Database> = [];
  private maxPoolSize = 10;

  async acquire(): Promise<Database> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    // 创建新连接或等待
  }

  release(db: Database): void {
    this.pool.push(db);
  }
}
```

#### 问题 2: 原子文件操作的临时文件
**位置**: `node/src/core/optimized-file-queue.ts:194-199`

```typescript
const tempPath = `${filepath}.tmp.${process.pid}`;

// 原子写入：先写临时文件，再重命名
fs.writeFileSync(tempPath, content);
fs.renameSync(tempPath, filepath);
```

**风险**: 临时文件未清理 (如果进程崩溃)

**优化建议**:
```typescript
// 启动时清理旧临时文件
this.cleanupTempFiles();

private cleanupTempFiles(): void {
  const tempFiles = fs.readdirSync(this.config.queueDir)
    .filter(f => f.includes('.tmp.'));
  for (const file of tempFiles) {
    try {
      fs.unlinkSync(path.join(this.config.queueDir, file));
    } catch { /* 忽略 */ }
  }
}
```

### 4. 并发处理

#### 问题 1: 缓存穿透保护的竞态条件
**位置**: `node/src/core/cache-layer.ts:316-348`

```typescript
async getOrCompute(
  key: string,
  compute: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // 先从内存缓存获取
  const cached = this.get(key);
  if (cached !== undefined) {
    return cached;
  }

  // 使用互斥锁防止缓存穿透
  const lockKey = `${key}:lock`;
  const lockValue = await this.getAsync(lockKey) as unknown as string | null;

  if (lockValue) {
    // 正在计算中，等待
    await this.sleep(100);
    return this.getOrCompute(key, compute, ttl); // 递归调用
  }

  // 设置锁
  await this.setAsync(lockKey, 'computing' as unknown as T, 5000);
  // ...
}
```

**问题**:
- 递归调用可能导致栈溢出
- 自旋等待 (`sleep(100)` + 递归) 效率低
- 锁释放失败可能导致死锁

**优化建议**:
```typescript
async getOrCompute(
  key: string,
  compute: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // 迭代版本替代递归
  const maxRetries = 50; // 防止无限循环
  let retries = 0;

  while (retries < maxRetries) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const lockKey = `${key}:lock`;
    const lockValue = await this.getAsync(lockKey);

    if (lockValue) {
      // 使用 Promise.delay 替代 sleep
      await new Promise(r => setTimeout(r, 100));
      retries++;
      continue;
    }

    // 尝试获取锁
    const acquired = await this.tryAcquireLock(lockKey);
    if (acquired) {
      try {
        // 双重检查
        const doubleCheck = this.get(key);
        if (doubleCheck !== undefined) {
          return doubleCheck;
        }

        const value = await compute();
        await this.setAsync(key, value, ttl);
        return value;
      } finally {
        await this.releaseLock(lockKey);
      }
    }
  }

  throw new Error('getOrCompute timeout');
}
```

#### 问题 2: Redis 连接池等待队列无限制
**位置**: `node/src/core/cache-layer.ts:463-477`

```typescript
async acquire(): Promise<RedisClient> {
  // 查找空闲连接
  for (const item of this.clients) {
    if (!item.busy && item.client.isReady()) {
      item.busy = true;
      item.lastUsed = Date.now();
      return item.client;
    }
  }

  // 没有空闲连接，等待
  return new Promise((resolve) => {
    this.waitQueue.push(resolve); // 无限制
  });
}
```

**风险**: 等待队列无限制，高并发时内存暴涨

**优化建议**:
```typescript
async acquire(timeout = 30000): Promise<RedisClient> {
  // 查找空闲连接
  for (const item of this.clients) {
    if (!item.busy && item.client.isReady()) {
      item.busy = true;
      item.lastUsed = Date.now();
      return item.client;
    }
  }

  // 检查等待队列是否已满
  if (this.waitQueue.length >= this.config.poolSize * 2) {
    throw new Error('Connection pool wait queue full');
  }

  // 带超时的等待
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const index = this.waitQueue.indexOf(resolve);
      if (index > -1) this.waitQueue.splice(index, 1);
      reject(new Error('Acquire connection timeout'));
    }, timeout);

    this.waitQueue.push(() => {
      clearTimeout(timeoutId);
      resolve(this.clients.find(c => !c.busy)?.client!);
    });
  });
}
```

---

## 优化建议

### 快速优化 (1 天内)

1. **调整 LRU 缓存默认配置**
   ```typescript
   // 当前
   maxSize: 1000,
   defaultTTL: 300000

   // 建议
   maxSize: 10000,       // 增加 10 倍
   defaultTTL: 600000,   // 10 分钟，减少不必要的缓存
   maxMemoryMB: 256,     // 新增内存限制
   ```

2. **减少文件队列轮询间隔**
   ```typescript
   // 当前
   private readonly POLL_INTERVAL_MS = 5000;

   // 建议
   private readonly POLL_INTERVAL_MS = 500; // 500ms
   ```

3. **添加连接池等待超时**
   ```typescript
   // 在 RedisConnectionPool.acquire() 中添加超时
   async acquire(timeout = 30000): Promise<RedisClient>
   ```

4. **清理临时文件**
   ```typescript
   // OptimizedFileQueueManager 启动时清理 .tmp.* 文件
   ```

### 中期优化 (1 周内)

1. **实现真正的 O(1) LRU**
   - 使用 Map 迭代顺序或 doubly-linked list
   - 添加内存大小限制

2. **SQLite 异步化**
   - 使用 Worker 线程封装同步 API
   - 或迁移到 `sqlite-async` 等异步库

3. **缓存预热批量加载**
   ```typescript
   // 当前 warmup 是串行的
   async warmup(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
     for (const { key, value, ttl } of entries) {
       await this.setAsync(key, value, ttl); // 串行
     }
   }

   // 建议：批量并发
   async warmup(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
     const batches = this.chunkArray(entries, 10);
     for (const batch of batches) {
       await Promise.all(batch.map(e => this.setAsync(e.key, e.value, e.ttl)));
     }
   }
   ```

4. **API Gateway 请求限流**
   ```typescript
   import rateLimit from 'express-rate-limit';

   const limiter = rateLimit({
     windowMs: 60 * 1000, // 1 分钟
     max: 100, // 每 IP 最多 100 请求
   });
   this.app.use('/api/', limiter);
   ```

### 架构优化 (1 月内)

1. **引入消息队列中间件**
   - 当前文件队列性能有限
   - 建议使用 Redis Streams 或 RabbitMQ

2. **水平扩展支持**
   - 当前设计为单实例
   - 需要 Session/状态共享机制

3. **性能监控集成**
   - 添加 Prometheus 指标导出
   - 关键操作延迟直方图

4. **连接池统一管理**
   - 统一 Redis/SQLite 连接池
   - 健康检查和自动故障转移

---

## 扩展性评估

### 水平扩展能力

| 组件 | 扩展性 | 限制 |
|------|--------|------|
| Redis | 高 (支持 Cluster) | 需要修改连接逻辑 |
| SQLite | 低 (单文件) | 需要迁移到分布式 DB |
| 文件队列 | 低 | 需要共享存储 |
| Master 选举 | 中 | 支持多级降级 |

### 单实例容量上限

基于代码分析的理论上限:

| 资源 | 上限 | 瓶颈 |
|------|------|------|
| 并发 Instance | ~50-100 | Node.js 事件循环 |
| 消息吞吐量 | ~1000 msg/s (Redis) | 网络 I/O |
| 缓存条目 | 10000 (建议调整) | 内存限制 |
| SQLite 写入 | ~100 writes/s | 磁盘 I/O |

### 建议的扩容阈值

| 指标 | 警告阈值 | 扩容动作 |
|------|----------|----------|
| CPU 使用率 | >70% | 增加实例 |
| 内存使用率 | >80% | 增加实例或优化缓存 |
| Redis 连接池使用率 | >80% | 增加池大小或实例 |
| 消息队列堆积 | >1000 条 | 增加消费者 |
| P99 延迟 | >500ms | 性能优化或扩容 |

---

## 总结

EKET 框架整体设计合理，实现了多级降级和错误恢复机制。主要性能风险在于:

1. **缓存层 LRU 算法效率** - 建议优先优化
2. **文件队列延迟高** - 建议改用事件驱动
3. **SQLite 同步阻塞** - 建议异步化
4. **并发控制不足** - 需要完善锁机制

建议按以下优先级进行优化:

```
P0 (立即): 调整缓存配置、减少轮询间隔、添加超时
P1 (本周): 实现 O(1) LRU、清理临时文件
P2 (本月): SQLite 异步化、引入限流
P3 (下季度): 架构级优化 (消息队列、水平扩展)
```

---

**附录**: 建议在 `node/tests/` 目录添加性能基准测试文件 `performance.benchmark.ts`,覆盖以下场景:
- LRU 缓存读写性能
- 断路器状态转换延迟
- 消息队列吞吐量
- 连接池并发能力
