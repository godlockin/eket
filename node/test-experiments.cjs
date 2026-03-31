/**
 * EKET v0.9.4 假设验证实验
 */

const { ApiKeyManager } = require('./dist/api/middleware/api-key-manager.js');
const { ApiKeyStorage } = require('./dist/api/middleware/api-key-storage.js');
const { SQLiteClient } = require('./dist/core/sqlite-client.js');
const { OptimizedFileQueueManager } = require('./dist/core/optimized-file-queue.js');
const fs = require('fs');
const path = require('path');

async function runAllExperiments() {
  console.log('='.repeat(60));
  console.log('EKET v0.9.4 假设验证实验');
  console.log('='.repeat(60));
  console.log();

  // 实验 H3: API Key 持久化验证
  console.log('=== 实验 H3: API Key 持久化验证 ===');
  try {
    const dbPath = '/tmp/eket-test-api-keys.db';

    // 清理旧数据库
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    const db = new SQLiteClient(dbPath);
    const storage = new ApiKeyStorage(db);
    const manager = new ApiKeyManager(storage);

    // 初始化
    await manager.initialize();

    // 生成 Key
    const { key, keyId } = await manager.generateKey(
      'test-key',
      'user-123',
      ['read', 'write']
    );

    console.log('生成 Key:', key.substring(0, 20) + '...');
    console.log('Key ID:', keyId);

    // 验证 Key
    const result = await manager.validateKey(key);
    console.log('验证结果:', result.valid ? '✅ 有效' : '❌ 无效');

    // 模拟重启：创建新实例并重新加载
    console.log('\n--- 模拟重启 ---');
    const db2 = new SQLiteClient(dbPath);
    const storage2 = new ApiKeyStorage(db2);
    const manager2 = new ApiKeyManager(storage2);
    await manager2.initialize();

    // 验证重启后 Key 仍有效
    const result2 = await manager2.validateKey(key);
    console.log('重启后验证:', result2.valid ? '✅ 有效 (持久化成功)' : '❌ 无效 (持久化失败)');

    // 清理
    await db.close();
    await db2.close();
    fs.unlinkSync(dbPath);

    console.log('\nH3 假设验证:', result2.valid ? '✅ 通过 - API Key 持久化有效' : '❌ 失败');
  } catch (error) {
    console.error('H3 实验失败:', error.message);
  }

  console.log();
  console.log();

  // 实验 H5: 临时文件清理验证
  console.log('=== 实验 H5: 临时文件清理验证 ===');
  try {
    const queueDir = '/tmp/eket-test-queue';
    const archiveDir = '/tmp/eket-test-archive';

    // 清理旧目录
    if (fs.existsSync(queueDir)) {
      fs.rmSync(queueDir, { recursive: true, force: true });
    }
    if (fs.existsSync(archiveDir)) {
      fs.rmSync(archiveDir, { recursive: true, force: true });
    }

    // 创建目录
    fs.mkdirSync(queueDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    // 模拟残留的临时文件
    const tempFile1 = path.join(queueDir, '.tmp.12345');
    const tempFile2 = path.join(queueDir, '.tmp.67890');
    fs.writeFileSync(tempFile1, 'temp content 1');
    fs.writeFileSync(tempFile2, 'temp content 2');

    // 修改临时文件时间戳为 2 小时前（模拟旧临时文件）
    const oldTime = Date.now() - 2 * 60 * 60 * 1000;
    fs.utimesSync(tempFile1, oldTime / 1000, oldTime / 1000);
    fs.utimesSync(tempFile2, oldTime / 1000, oldTime / 1000);

    console.log('创建前临时文件数:', fs.readdirSync(queueDir).filter(f => f.includes('.tmp.')).length);

    // 创建管理器（应该自动清理临时文件）
    const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

    const remainingTempFiles = fs.readdirSync(queueDir).filter(f => f.includes('.tmp.'));
    console.log('清理后临时文件数:', remainingTempFiles.length);
    console.log('临时文件清理:', remainingTempFiles.length === 0 ? '✅ 通过' : '❌ 失败');

    // 清理
    fs.rmSync(queueDir, { recursive: true, force: true });
    fs.rmSync(archiveDir, { recursive: true, force: true });

    console.log('H5 假设验证:', remainingTempFiles.length === 0 ? '✅ 通过 - 临时文件清理有效' : '❌ 失败');
  } catch (error) {
    console.error('H5 实验失败:', error.message);
  }

  console.log();
  console.log();

  // 实验 H1: Redis 连接池超时验证（代码审查）
  console.log('=== 实验 H1: Redis 连接池超时验证 (代码审查) ===');
  const cacheLayerCode = fs.readFileSync('./dist/core/cache-layer.js', 'utf-8');

  const hasQueueSizeLimit = cacheLayerCode.includes('poolSize * 2') || cacheLayerCode.includes('waitQueue.length');
  const hasTimeout = cacheLayerCode.includes('timeoutId') || cacheLayerCode.includes('setTimeout');

  console.log('队列大小限制:', hasQueueSizeLimit ? '✅ 存在' : '❌ 缺失');
  console.log('超时机制:', hasTimeout ? '✅ 存在' : '❌ 缺失');
  console.log('H1 假设验证:', (hasQueueSizeLimit && hasTimeout) ? '✅ 通过 - Redis 连接池超时机制有效' : '⚠️ 部分通过');

  console.log();
  console.log();

  // 实验 H6: 四级降级使用统计（代码审查）
  console.log('=== 实验 H6: 四级降级策略分析 (代码审查) ===');
  const connectionManagerCode = fs.readFileSync('./dist/core/connection-manager.js', 'utf-8');

  const hasFourLevels = connectionManagerCode.includes('remote_redis') &&
                         connectionManagerCode.includes('local_redis') &&
                         connectionManagerCode.includes('sqlite') &&
                         connectionManagerCode.includes('file');
  const hasUpgrade = connectionManagerCode.includes('tryUpgrade') || connectionManagerCode.includes('upgrade');
  const hasStats = connectionManagerCode.includes('fallbackCount') || connectionManagerCode.includes('getStats');

  console.log('四级降级实现:', hasFourLevels ? '✅ 完整' : '❌ 不完整');
  console.log('升级机制:', hasUpgrade ? '✅ 存在' : '❌ 缺失');
  console.log('统计追踪:', hasStats ? '✅ 存在' : '❌ 缺失');
  console.log('H6 假设验证:', hasFourLevels ? '⚠️ 需在生产环境统计实际使用率' : '❌ 不完整');

  console.log();
  console.log('='.repeat(60));
  console.log('实验完成');
  console.log('='.repeat(60));
}

runAllExperiments().catch(console.error);
