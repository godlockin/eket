/**
 * 综合性能基准测试 - TASK-004
 *
 * 测试范围：
 * 1. Redis 读写性能
 * 2. SQLite 查询性能
 * 3. 文件队列性能
 * 4. 消息发布/订阅性能
 * 5. 缓存层性能
 * 6. 并发场景测试
 *
 * 基准目标：
 * - Redis 读写: <5ms
 * - SQLite 查询: <10ms
 * - 文件队列: <20ms
 * - 消息传递: <50ms
 */

import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import { RedisClient } from '../src/core/redis-client.js';
import { SQLiteClient } from '../src/core/sqlite-client.js';
import { FileMessageQueue } from '../src/core/message-queue.js';
import { LRUCache } from '../src/core/cache-layer.js';
import type { Message } from '../src/types/index.js';

// ============================================================================
// 测试配置
// ============================================================================

interface BenchmarkConfig {
  iterations: number;
  warmupRounds: number;
  concurrencyLevels: number[];
}

const CONFIG: BenchmarkConfig = {
  iterations: 1000,
  warmupRounds: 100,
  concurrencyLevels: [1, 10, 100, 500, 1000],
};

// ============================================================================
// 性能指标收集
// ============================================================================

interface PerformanceMetrics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  throughput: number; // ops/sec
}

class PerformanceCollector {
  private measurements: number[] = [];

  record(duration: number): void {
    this.measurements.push(duration);
  }

  reset(): void {
    this.measurements = [];
  }

  getMetrics(): PerformanceMetrics {
    if (this.measurements.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, throughput: 0 };
    }

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const mean = sum / sorted.length;

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      throughput: sorted.length / (sum / 1000), // ops/sec
    };
  }

  printMetrics(testName: string, target?: number): void {
    const metrics = this.getMetrics();
    console.log(`\n📊 ${testName}`);
    console.log(`  ├─ Min:        ${metrics.min.toFixed(2)}ms`);
    console.log(`  ├─ Max:        ${metrics.max.toFixed(2)}ms`);
    console.log(`  ├─ Mean:       ${metrics.mean.toFixed(2)}ms`);
    console.log(`  ├─ Median:     ${metrics.median.toFixed(2)}ms`);
    console.log(`  ├─ P95:        ${metrics.p95.toFixed(2)}ms`);
    console.log(`  ├─ P99:        ${metrics.p99.toFixed(2)}ms`);
    console.log(`  └─ Throughput: ${metrics.throughput.toFixed(0)} ops/sec`);

    if (target) {
      const status = metrics.p95 < target ? '✅ PASS' : '❌ FAIL';
      console.log(`  📈 Target: <${target}ms | P95: ${metrics.p95.toFixed(2)}ms ${status}`);
    }
  }
}

// ============================================================================
// 测试 1: Redis 性能基准
// ============================================================================

async function benchmarkRedis(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('📦 测试 1: Redis 读写性能');
  console.log('='.repeat(70));

  const redisClient = new RedisClient({
    host: process.env.EKET_REDIS_HOST || 'localhost',
    port: parseInt(process.env.EKET_REDIS_PORT || '6379'),
    keyPrefix: 'benchmark:',
  });

  const connectResult = await redisClient.connect();
  if (!connectResult.success) {
    console.log('⚠️  Redis 不可用，跳过 Redis 测试');
    return;
  }

  try {
    // 预热
    for (let i = 0; i < CONFIG.warmupRounds; i++) {
      await redisClient.set(`warmup:${i}`, `value:${i}`);
      await redisClient.get(`warmup:${i}`);
    }

    // 测试写入性能
    const writeCollector = new PerformanceCollector();
    for (let i = 0; i < CONFIG.iterations; i++) {
      const start = performance.now();
      await redisClient.set(`key:${i}`, JSON.stringify({ id: i, data: 'test' }));
      writeCollector.record(performance.now() - start);
    }
    writeCollector.printMetrics('Redis 写入性能', 5);

    // 测试读取性能
    const readCollector = new PerformanceCollector();
    for (let i = 0; i < CONFIG.iterations; i++) {
      const start = performance.now();
      await redisClient.get(`key:${i}`);
      readCollector.record(performance.now() - start);
    }
    readCollector.printMetrics('Redis 读取性能', 5);

    // 测试删除性能
    const deleteCollector = new PerformanceCollector();
    for (let i = 0; i < CONFIG.iterations; i++) {
      const start = performance.now();
      await redisClient.delete(`key:${i}`);
      deleteCollector.record(performance.now() - start);
    }
    deleteCollector.printMetrics('Redis 删除性能', 5);

    // 清理
    await redisClient.disconnect();
  } catch (error) {
    console.error('❌ Redis 测试失败:', error);
    await redisClient.disconnect();
  }
}

// ============================================================================
// 测试 2: SQLite 性能基准
// ============================================================================

async function benchmarkSQLite(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('💾 测试 2: SQLite 查询性能');
  console.log('='.repeat(70));

  const dbPath = path.join(process.cwd(), '.eket', 'benchmark.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqliteClient = new SQLiteClient(dbPath);
  const connectResult = sqliteClient.connect();

  if (!connectResult.success) {
    console.log('❌ SQLite 连接失败');
    return;
  }

  try {
    // 预热：插入测试数据
    for (let i = 0; i < CONFIG.warmupRounds; i++) {
      sqliteClient.insertRetrospective({
        id: `warmup-${i}`,
        instanceId: 'benchmark',
        timestamp: Date.now(),
        category: 'test',
        content: { message: 'warmup' },
        metadata: {},
      });
    }

    // 测试插入性能
    const insertCollector = new PerformanceCollector();
    for (let i = 0; i < CONFIG.iterations; i++) {
      const start = performance.now();
      sqliteClient.insertRetrospective({
        id: `test-${i}`,
        instanceId: 'benchmark',
        timestamp: Date.now(),
        category: 'performance',
        content: { iteration: i, data: 'test data' },
        metadata: { benchmark: true },
      });
      insertCollector.record(performance.now() - start);
    }
    insertCollector.printMetrics('SQLite 插入性能', 10);

    // 测试查询性能
    const queryCollector = new PerformanceCollector();
    for (let i = 0; i < CONFIG.iterations; i++) {
      const start = performance.now();
      sqliteClient.getRetrospective(`test-${i}`);
      queryCollector.record(performance.now() - start);
    }
    queryCollector.printMetrics('SQLite 查询性能', 10);

    // 测试批量查询性能
    const batchQueryCollector = new PerformanceCollector();
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      sqliteClient.searchRetrospectives('performance');
      batchQueryCollector.record(performance.now() - start);
    }
    batchQueryCollector.printMetrics('SQLite 批量查询性能', 50);

    // 清理
    sqliteClient.disconnect();
    fs.unlinkSync(dbPath);
  } catch (error) {
    console.error('❌ SQLite 测试失败:', error);
    sqliteClient.disconnect();
  }
}

// ============================================================================
// 测试 3: 文件队列性能基准
// ============================================================================

async function benchmarkFileQueue(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('📁 测试 3: 文件队列性能');
  console.log('='.repeat(70));

  const queueDir = path.join(process.cwd(), '.eket', 'benchmark-queue');
  fs.mkdirSync(queueDir, { recursive: true });

  const fileQueue = new FileMessageQueue({
    mode: 'file',
    queueDir,
    filePollingInterval: 100,
  });

  await fileQueue.connect();

  try {
    // 测试消息发布性能
    const publishCollector = new PerformanceCollector();
    for (let i = 0; i < CONFIG.iterations; i++) {
      const message: Message = {
        id: `msg-${i}`,
        type: 'test',
        sender: 'benchmark',
        recipient: 'test',
        timestamp: Date.now(),
        payload: { iteration: i },
      };

      const start = performance.now();
      await fileQueue.publish('test-channel', message);
      publishCollector.record(performance.now() - start);
    }
    publishCollector.printMetrics('文件队列发布性能', 20);

    // 测试消息订阅性能
    let receivedCount = 0;
    const subscribeCollector = new PerformanceCollector();

    await fileQueue.subscribe('test-channel', async (message) => {
      const start = performance.now();
      // 模拟处理
      receivedCount++;
      subscribeCollector.record(performance.now() - start);
    });

    // 等待消息处理
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`\n  📨 接收消息数: ${receivedCount}/${CONFIG.iterations}`);
    if (receivedCount > 0) {
      subscribeCollector.printMetrics('文件队列订阅性能', 50);
    }

    // 清理
    await fileQueue.disconnect();
    fs.rmSync(queueDir, { recursive: true, force: true });
  } catch (error) {
    console.error('❌ 文件队列测试失败:', error);
    await fileQueue.disconnect();
  }
}

// ============================================================================
// 测试 4: 缓存层性能基准
// ============================================================================

async function benchmarkCache(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 测试 4: LRU 缓存性能');
  console.log('='.repeat(70));

  const cache = new LRUCache<string>({
    maxSize: 10000,
    defaultTTL: 300000,
  });

  // 测试写入性能
  const writeCollector = new PerformanceCollector();
  for (let i = 0; i < CONFIG.iterations; i++) {
    const start = performance.now();
    cache.set(`key:${i}`, JSON.stringify({ id: i, data: 'test' }));
    writeCollector.record(performance.now() - start);
  }
  writeCollector.printMetrics('缓存写入性能', 1);

  // 测试读取性能（命中）
  const readCollector = new PerformanceCollector();
  for (let i = 0; i < CONFIG.iterations; i++) {
    const start = performance.now();
    cache.get(`key:${i}`);
    readCollector.record(performance.now() - start);
  }
  readCollector.printMetrics('缓存读取性能（命中）', 1);

  // 测试读取性能（未命中）
  const missCollector = new PerformanceCollector();
  for (let i = 0; i < CONFIG.iterations; i++) {
    const start = performance.now();
    cache.get(`missing:${i}`);
    missCollector.record(performance.now() - start);
  }
  missCollector.printMetrics('缓存读取性能（未命中）', 1);

  // 测试 LRU 驱逐性能
  const evictCollector = new PerformanceCollector();
  for (let i = CONFIG.iterations; i < CONFIG.iterations + 5000; i++) {
    const start = performance.now();
    cache.set(`evict:${i}`, JSON.stringify({ id: i }));
    evictCollector.record(performance.now() - start);
  }
  evictCollector.printMetrics('缓存 LRU 驱逐性能', 1);

  // 打印缓存统计
  const stats = cache.getStats();
  console.log('\n📈 缓存统计:');
  console.log(`  ├─ 命中率:     ${(stats.hitRate * 100).toFixed(2)}%`);
  console.log(`  ├─ 命中次数:   ${stats.hits}`);
  console.log(`  ├─ 未命中次数: ${stats.misses}`);
  console.log(`  ├─ 驱逐次数:   ${stats.evictions}`);
  console.log(`  └─ 当前大小:   ${stats.size}`);
}

// ============================================================================
// 测试 5: 并发性能测试
// ============================================================================

async function benchmarkConcurrency(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('⚡ 测试 5: 并发性能测试');
  console.log('='.repeat(70));

  const cache = new LRUCache<string>({ maxSize: 10000, defaultTTL: 300000 });

  for (const concurrency of CONFIG.concurrencyLevels) {
    const collector = new PerformanceCollector();

    const start = performance.now();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        (async () => {
          const opStart = performance.now();
          cache.set(`concurrent:${i}`, `value:${i}`);
          cache.get(`concurrent:${i}`);
          collector.record(performance.now() - opStart);
        })()
      );
    }

    await Promise.all(promises);
    const totalTime = performance.now() - start;

    console.log(`\n🔄 并发级别: ${concurrency}`);
    console.log(`  ├─ 总耗时: ${totalTime.toFixed(2)}ms`);
    console.log(`  ├─ 平均延迟: ${(totalTime / concurrency).toFixed(2)}ms`);
    console.log(`  └─ 吞吐量: ${((concurrency / totalTime) * 1000).toFixed(0)} ops/sec`);
  }
}

// ============================================================================
// 测试 6: 内存使用分析
// ============================================================================

function benchmarkMemory(): void {
  console.log('\n' + '='.repeat(70));
  console.log('💾 测试 6: 内存使用分析');
  console.log('='.repeat(70));

  const memBefore = process.memoryUsage();

  // 创建大量对象
  const cache = new LRUCache<string>({ maxSize: 10000, defaultTTL: 300000 });
  for (let i = 0; i < 10000; i++) {
    cache.set(`key:${i}`, JSON.stringify({ id: i, data: 'x'.repeat(100) }));
  }

  const memAfter = process.memoryUsage();

  console.log('\n📊 内存使用情况:');
  console.log(`  ├─ RSS:        ${((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ├─ Heap Used:  ${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ├─ Heap Total: ${((memAfter.heapTotal - memBefore.heapTotal) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  └─ External:   ${((memAfter.external - memBefore.external) / 1024 / 1024).toFixed(2)} MB`);

  const targetMemory = 512; // MB
  const actualMemory = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
  const status = actualMemory < targetMemory ? '✅ PASS' : '❌ FAIL';
  console.log(`\n📈 目标: <${targetMemory}MB | 实际: ${actualMemory.toFixed(2)}MB ${status}`);
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 EKET v2.1.1 综合性能基准测试 - TASK-004');
  console.log('='.repeat(70));
  console.log(`\n⚙️  配置:`);
  console.log(`  ├─ 迭代次数: ${CONFIG.iterations}`);
  console.log(`  ├─ 预热轮数: ${CONFIG.warmupRounds}`);
  console.log(`  └─ 并发级别: ${CONFIG.concurrencyLevels.join(', ')}`);
  console.log('\n📋 测试目标:');
  console.log('  ├─ Redis 读写:  <5ms (P95)');
  console.log('  ├─ SQLite 查询: <10ms (P95)');
  console.log('  ├─ 文件队列:    <20ms (P95)');
  console.log('  ├─ 消息传递:    <50ms (P95)');
  console.log('  └─ 内存使用:    <512MB');

  const startTime = performance.now();

  try {
    await benchmarkRedis();
    await benchmarkSQLite();
    await benchmarkFileQueue();
    await benchmarkCache();
    await benchmarkConcurrency();
    benchmarkMemory();
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }

  const totalTime = performance.now() - startTime;

  console.log('\n' + '='.repeat(70));
  console.log(`✅ 基准测试完成 (总耗时: ${(totalTime / 1000).toFixed(2)}s)`);
  console.log('='.repeat(70));
  console.log('\n📝 下一步: 运行压力测试 (k6 load test)');
  console.log('   命令: k6 run k6/load-test.js\n');
}

// 运行测试
main().catch((error) => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});
