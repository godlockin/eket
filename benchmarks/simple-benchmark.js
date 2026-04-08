/**
 * EKET Framework - File Queue Performance Benchmark
 *
 * 测量 OptimizedFileQueueManager 的性能指标：
 * - Enqueue 延迟（P50, P95, P99）
 * - Dequeue 延迟（P50, P95, P99）
 * - 吞吐量（ops/sec）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createOptimizedFileQueueManager } from '../node/dist/core/optimized-file-queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 清理测试目录
function cleanupTestDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 计算百分位数
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// 格式化延迟（毫秒）
function formatLatency(ms) {
  return ms.toFixed(2) + 'ms';
}

// 生成测试消息
function generateMessage(id) {
  return {
    id: `msg-${id}`,
    type: 'test',
    timestamp: new Date().toISOString(),
    data: { index: id, payload: 'benchmark-test-data' },
  };
}

async function runBenchmark() {
  console.log('🚀 Starting File Queue Performance Benchmark\n');

  const testDir = path.join(__dirname, '..', '.eket-benchmark');
  const queueDir = path.join(testDir, 'queue');
  const archiveDir = path.join(testDir, 'archive');

  // 清理旧测试数据
  cleanupTestDir(testDir);

  // 创建队列管理器
  const queue = createOptimizedFileQueueManager({
    queueDir,
    archiveDir,
    maxAge: 24 * 60 * 60 * 1000,
    archiveAfter: 60 * 60 * 1000,
    atomicWrites: true,
  });

  // 测试参数
  const WARMUP_COUNT = 100;
  const TEST_COUNT = 1000;
  const CHANNEL = 'benchmark';

  // ============================
  // 热身阶段（避免首次 I/O 影响）
  // ============================
  console.log(`📊 Warmup: ${WARMUP_COUNT} operations...`);
  for (let i = 0; i < WARMUP_COUNT; i++) {
    queue.enqueue(CHANNEL, generateMessage(`warmup-${i}`));
  }
  queue.dequeue(CHANNEL, WARMUP_COUNT);

  // 清空队列
  cleanupTestDir(queueDir);
  fs.mkdirSync(queueDir, { recursive: true });

  // ============================
  // Enqueue 性能测试
  // ============================
  console.log(`\n📈 Testing Enqueue (${TEST_COUNT} ops)...`);
  const enqueueTimes = [];

  for (let i = 0; i < TEST_COUNT; i++) {
    const start = process.hrtime.bigint();
    queue.enqueue(CHANNEL, generateMessage(i));
    const end = process.hrtime.bigint();
    enqueueTimes.push(Number(end - start) / 1e6); // 转换为毫秒
  }

  const enqueueP50 = percentile(enqueueTimes, 50);
  const enqueueP95 = percentile(enqueueTimes, 95);
  const enqueueP99 = percentile(enqueueTimes, 99);
  const enqueueAvg = enqueueTimes.reduce((a, b) => a + b, 0) / enqueueTimes.length;

  console.log(`  P50: ${formatLatency(enqueueP50)}`);
  console.log(`  P95: ${formatLatency(enqueueP95)}`);
  console.log(`  P99: ${formatLatency(enqueueP99)}`);
  console.log(`  Avg: ${formatLatency(enqueueAvg)}`);

  // ============================
  // Dequeue 性能测试
  // ============================
  console.log(`\n📉 Testing Dequeue (batch size: 100)...`);
  const dequeueTimes = [];
  let totalDequeued = 0;

  while (totalDequeued < TEST_COUNT) {
    const start = process.hrtime.bigint();
    const messages = queue.dequeue(CHANNEL, 100);
    const end = process.hrtime.bigint();

    if (messages.length === 0) break;

    const timePerMessage = Number(end - start) / 1e6 / messages.length;
    for (let i = 0; i < messages.length; i++) {
      dequeueTimes.push(timePerMessage);
    }

    // 标记为已处理（模拟消费）
    messages.forEach(({ message }) => queue.markProcessed(message.id));
    totalDequeued += messages.length;
  }

  const dequeueP50 = percentile(dequeueTimes, 50);
  const dequeueP95 = percentile(dequeueTimes, 95);
  const dequeueP99 = percentile(dequeueTimes, 99);
  const dequeueAvg = dequeueTimes.reduce((a, b) => a + b, 0) / dequeueTimes.length;

  console.log(`  P50: ${formatLatency(dequeueP50)}`);
  console.log(`  P95: ${formatLatency(dequeueP95)}`);
  console.log(`  P99: ${formatLatency(dequeueP99)}`);
  console.log(`  Avg: ${formatLatency(dequeueAvg)}`);

  // ============================
  // 保存结果
  // ============================
  const results = {
    timestamp: new Date().toISOString(),
    testConfig: {
      warmupCount: WARMUP_COUNT,
      testCount: TEST_COUNT,
      channel: CHANNEL,
    },
    enqueue: {
      p50: enqueueP50,
      p95: enqueueP95,
      p99: enqueueP99,
      avg: enqueueAvg,
      unit: 'ms',
    },
    dequeue: {
      p50: dequeueP50,
      p95: dequeueP95,
      p99: dequeueP99,
      avg: dequeueAvg,
      unit: 'ms',
    },
    stats: queue.getStats(),
  };

  // 确定 round 编号（查找已有结果）
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });

  const existingFiles = fs.readdirSync(resultsDir).filter(f => f.startsWith('round'));
  const roundNumber = existingFiles.length + 4; // 从 Round 4 开始（已有 Round 1-3）

  const outputFile = path.join(resultsDir, `round${roundNumber}-benchmark-results.json`);
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log(`\n✅ Benchmark completed!`);
  console.log(`📁 Results saved to: ${outputFile}`);

  // 清理测试数据
  cleanupTestDir(testDir);

  // 性能判定
  console.log('\n📊 Performance Assessment:');
  const targetP95 = 1.0; // 目标 P95 < 1ms

  console.log(`  Enqueue P95: ${formatLatency(enqueueP95)} ${enqueueP95 < targetP95 ? '✅' : '❌'} (target: <${targetP95}ms)`);
  console.log(`  Dequeue P95: ${formatLatency(dequeueP95)} ${dequeueP95 < targetP95 ? '✅' : '❌'} (target: <${targetP95}ms)`);

  if (enqueueP95 < targetP95 && dequeueP95 < targetP95) {
    console.log('\n🎉 Performance target achieved!');
  } else {
    console.log('\n⚠️  Performance needs improvement');
  }
}

// 运行基准测试
runBenchmark().catch(console.error);
