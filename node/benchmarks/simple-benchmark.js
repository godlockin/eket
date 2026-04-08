/**
 * 简单性能基准测试 - Round 4
 * 使用构建后的代码避免 ts-node ESM 问题
 */

import { performance } from 'perf_hooks';
import Redis from 'ioredis';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 配置
// ============================================================================

const ITERATIONS = 1000;
const WARMUP = 100;
const CONCURRENCY_LEVELS = [1, 10, 100, 500];

// Redis 配置
const redisConfig = {
  host: process.env.EKET_REDIS_HOST || 'localhost',
  port: parseInt(process.env.EKET_REDIS_PORT || '6379'),
  connectTimeout: 5000,
};

// SQLite 配置
const sqlitePath = join(__dirname, '../.eket/benchmark.db');
const queueDir = join(__dirname, '../.eket/benchmark-queue');

// ============================================================================
// 工具函数
// ============================================================================

function calculateStats(times) {
  if (times.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };

  const sorted = times.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

function formatStats(stats, label, target) {
  const passed = stats.p95 < target ? '✓' : '✗';
  console.log(`\n${label}:`);
  console.log(`  Min:  ${stats.min.toFixed(2)}ms`);
  console.log(`  Avg:  ${stats.avg.toFixed(2)}ms`);
  console.log(`  P50:  ${stats.p50.toFixed(2)}ms`);
  console.log(`  P95:  ${stats.p95.toFixed(2)}ms ${passed} (target: <${target}ms)`);
  console.log(`  P99:  ${stats.p99.toFixed(2)}ms`);
  console.log(`  Max:  ${stats.max.toFixed(2)}ms`);
  return passed === '✓';
}

// ============================================================================
// 测试 1: Redis 读写性能
// ============================================================================

async function benchmarkRedis() {
  console.log('\n=== Redis 读写性能测试 ===');

  const redis = new Redis(redisConfig);

  try {
    await redis.ping();
    console.log('✓ Redis 连接成功');
  } catch (err) {
    console.error('✗ Redis 连接失败:', err.message);
    redis.disconnect();
    return { passed: false, stats: null };
  }

  // 预热
  for (let i = 0; i < WARMUP; i++) {
    await redis.set(`warmup:${i}`, 'value');
    await redis.get(`warmup:${i}`);
  }

  // 写入测试
  const writeTimes = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await redis.set(`bench:write:${i}`, JSON.stringify({ id: i, timestamp: Date.now() }));
    writeTimes.push(performance.now() - start);
  }

  // 读取测试
  const readTimes = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await redis.get(`bench:write:${i}`);
    readTimes.push(performance.now() - start);
  }

  // 清理
  const keys = await redis.keys('bench:*');
  if (keys.length > 0) await redis.del(...keys);
  redis.disconnect();

  const writeStats = calculateStats(writeTimes);
  const readStats = calculateStats(readTimes);

  const writePassed = formatStats(writeStats, 'Redis Write', 5);
  const readPassed = formatStats(readStats, 'Redis Read', 5);

  return {
    passed: writePassed && readPassed,
    stats: { write: writeStats, read: readStats }
  };
}

// ============================================================================
// 测试 2: SQLite 查询性能 (WAL 模式)
// ============================================================================

function benchmarkSQLite() {
  console.log('\n=== SQLite 查询性能测试 (WAL 模式) ===');

  // 确保目录存在
  const dir = dirname(sqlitePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // 删除旧数据库
  if (existsSync(sqlitePath)) {
    rmSync(sqlitePath);
  }

  const db = new Database(sqlitePath);

  // 启用 WAL 模式（Round 2 优化）
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  const walMode = db.pragma('journal_mode', { simple: true });
  console.log(`✓ WAL 模式: ${walMode}`);

  // 创建测试表
  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmark_data (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_key ON benchmark_data(key);
  `);

  // 插入测试
  const insertStmt = db.prepare('INSERT INTO benchmark_data (key, value, timestamp) VALUES (?, ?, ?)');
  const insertTimes = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    insertStmt.run(`key_${i}`, JSON.stringify({ data: i }), Date.now());
    insertTimes.push(performance.now() - start);
  }

  // 查询测试
  const selectStmt = db.prepare('SELECT * FROM benchmark_data WHERE key = ?');
  const selectTimes = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    selectStmt.get(`key_${i}`);
    selectTimes.push(performance.now() - start);
  }

  db.close();

  const insertStats = calculateStats(insertTimes);
  const selectStats = calculateStats(selectTimes);

  const insertPassed = formatStats(insertStats, 'SQLite Insert (WAL)', 10);
  const selectPassed = formatStats(selectStats, 'SQLite Select (WAL)', 10);

  return {
    passed: insertPassed && selectPassed,
    stats: { insert: insertStats, select: selectStats }
  };
}

// ============================================================================
// 测试 3: 文件队列性能
// ============================================================================

function benchmarkFileQueue() {
  console.log('\n=== 文件队列性能测试 ===');

  // 确保目录存在
  if (existsSync(queueDir)) {
    rmSync(queueDir, { recursive: true });
  }
  mkdirSync(queueDir, { recursive: true });

  const enqueueTimes = [];
  const dequeueTimes = [];

  // 入队测试
  for (let i = 0; i < ITERATIONS; i++) {
    const message = {
      id: `msg_${i}`,
      timestamp: Date.now(),
      data: { payload: i }
    };

    const start = performance.now();
    const filePath = join(queueDir, `${message.id}.json`);
    writeFileSync(filePath, JSON.stringify(message));
    enqueueTimes.push(performance.now() - start);
  }

  // 出队测试（读取+删除）
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const filePath = join(queueDir, `msg_${i}.json`);
    readFileSync(filePath, 'utf-8');
    rmSync(filePath);
    dequeueTimes.push(performance.now() - start);
  }

  // 清理
  rmSync(queueDir, { recursive: true });

  const enqueueStats = calculateStats(enqueueTimes);
  const dequeueStats = calculateStats(dequeueTimes);

  const enqueuePassed = formatStats(enqueueStats, 'File Queue Enqueue', 20);
  const dequeuePassed = formatStats(dequeueStats, 'File Queue Dequeue', 20);

  return {
    passed: enqueuePassed && dequeuePassed,
    stats: { enqueue: enqueueStats, dequeue: dequeueStats }
  };
}

// ============================================================================
// 测试 4: 并发性能
// ============================================================================

async function benchmarkConcurrency() {
  console.log('\n=== 并发性能测试 ===');

  const redis = new Redis(redisConfig);

  try {
    await redis.ping();
  } catch (err) {
    console.error('✗ Redis 连接失败，跳过并发测试');
    redis.disconnect();
    return { passed: false, stats: {} };
  }

  const results = {};

  for (const concurrency of CONCURRENCY_LEVELS) {
    const times = [];
    const iterations = Math.min(1000, concurrency * 10);

    for (let batch = 0; batch < Math.ceil(iterations / concurrency); batch++) {
      const start = performance.now();

      const promises = [];
      for (let i = 0; i < concurrency && (batch * concurrency + i) < iterations; i++) {
        const key = `concurrent:${batch * concurrency + i}`;
        promises.push(redis.set(key, 'value'));
      }

      await Promise.all(promises);
      times.push(performance.now() - start);
    }

    const stats = calculateStats(times);
    results[`concurrency_${concurrency}`] = stats;

    console.log(`\n并发级别 ${concurrency}:`);
    console.log(`  批次平均: ${stats.avg.toFixed(2)}ms`);
    console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
  }

  // 清理
  const keys = await redis.keys('concurrent:*');
  if (keys.length > 0) await redis.del(...keys);
  redis.disconnect();

  return { passed: true, stats: results };
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('EKET Framework - 性能基准测试');
  console.log('================================');
  console.log(`迭代次数: ${ITERATIONS}`);
  console.log(`预热次数: ${WARMUP}`);
  console.log(`并发级别: ${CONCURRENCY_LEVELS.join(', ')}`);

  const results = {
    timestamp: new Date().toISOString(),
    version: '2.3.1',
    iterations: ITERATIONS,
    tests: {}
  };

  let allPassed = true;

  // 运行测试
  try {
    const redisResult = await benchmarkRedis();
    results.tests.redis = redisResult;
    allPassed = allPassed && redisResult.passed;
  } catch (err) {
    console.error('\n✗ Redis 测试失败:', err.message);
    results.tests.redis = { passed: false, error: err.message };
    allPassed = false;
  }

  try {
    const sqliteResult = benchmarkSQLite();
    results.tests.sqlite = sqliteResult;
    allPassed = allPassed && sqliteResult.passed;
  } catch (err) {
    console.error('\n✗ SQLite 测试失败:', err.message);
    results.tests.sqlite = { passed: false, error: err.message };
    allPassed = false;
  }

  try {
    const fileQueueResult = benchmarkFileQueue();
    results.tests.fileQueue = fileQueueResult;
    allPassed = allPassed && fileQueueResult.passed;
  } catch (err) {
    console.error('\n✗ 文件队列测试失败:', err.message);
    results.tests.fileQueue = { passed: false, error: err.message };
    allPassed = false;
  }

  try {
    const concurrencyResult = await benchmarkConcurrency();
    results.tests.concurrency = concurrencyResult;
    allPassed = allPassed && concurrencyResult.passed;
  } catch (err) {
    console.error('\n✗ 并发测试失败:', err.message);
    results.tests.concurrency = { passed: false, error: err.message };
  }

  // 保存结果
  const reportPath = join(__dirname, '../benchmarks/results/round4-benchmark-results.json');
  const reportDir = dirname(reportPath);
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }
  writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('\n================================');
  console.log(`总体结果: ${allPassed ? '✓ 通过' : '✗ 失败'}`);
  console.log(`结果已保存: ${reportPath}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('基准测试失败:', err);
  process.exit(1);
});
