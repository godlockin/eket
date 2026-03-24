#!/usr/bin/env node
/**
 * EKET Framework CLI
 * Version: 0.7.0
 *
 * 混合架构 CLI 入口 - 支持 Node.js 高级功能，同时保持 Shell 降级能力
 */

import { Command } from 'commander';
import { createRedisClient } from './core/redis-client.js';
import { createSQLiteClient } from './core/sqlite-client.js';
import { registerClaim } from './commands/claim.js';
import type { RedisConfig } from './types';

const pkg = {
  name: 'eket-cli',
  version: '0.7.0',
  description: 'EKET Framework CLI - Hybrid Node.js Implementation',
};

/**
 * 检查 Node.js 模块是否可用
 * 用于 Shell 脚本检测
 */
function checkAvailability(): boolean {
  try {
    // 检查关键依赖
    import('ioredis');
    import('better-sqlite3');
    import('commander');
    return true;
  } catch {
    return false;
  }
}

/**
 * 主 CLI 程序
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name(pkg.name)
    .version(pkg.version)
    .description(pkg.description);

  // ============================================================================
  // Redis 相关命令
  // ============================================================================

  program
    .command('redis:check')
    .description('检查 Redis 连接状态')
    .option('-h, --host <host>', 'Redis 主机', process.env.EKET_REDIS_HOST || 'localhost')
    .option('-p, --port <port>', 'Redis 端口', process.env.EKET_REDIS_PORT || '6379')
    .action(async (options) => {
      const config: RedisConfig = {
        host: options.host,
        port: parseInt(options.port, 10),
        password: process.env.EKET_REDIS_PASSWORD,
      };

      const client = createRedisClient();
      const result = await client.connect();

      if (result.success) {
        console.log('✓ Redis 连接成功');
        const slavers = await client.getActiveSlavers();
        if (slavers.success && slavers.data.length > 0) {
          console.log(`活跃 Slaver: ${slavers.data.length}`);
          slavers.data.forEach((s) => {
            console.log(`  - ${s.slaverId} (${s.status})`);
          });
        } else {
          console.log('暂无活跃 Slaver');
        }
        await client.disconnect();
      } else {
        console.error('✗ Redis 连接失败:', result.error.message);
        process.exit(1);
      }
    });

  program
    .command('redis:list-slavers')
    .description('列出所有活跃 Slaver')
    .action(async () => {
      const client = createRedisClient();
      await client.connect();

      const result = await client.getActiveSlavers();
      if (result.success) {
        if (result.data.length === 0) {
          console.log('暂无活跃 Slaver');
        } else {
          console.table(
            result.data.map((s) => ({
              ID: s.slaverId,
              状态：s.status,
              当前任务：s.currentTaskId || '-',
              时间：new Date(s.timestamp).toLocaleTimeString(),
            }))
          );
        }
        await client.disconnect();
      } else {
        console.error('获取 Slaver 列表失败:', result.error.message);
        process.exit(1);
      }
    });

  // ============================================================================
  // SQLite 相关命令
  // ============================================================================

  program
    .command('sqlite:check')
    .description('检查 SQLite 数据库状态')
    .option('-d, --database <path>', '数据库文件路径')
    .action((options) => {
      const client = createSQLiteClient(options.database);
      const result = client.connect();

      if (result.success) {
        console.log('✓ SQLite 数据库连接成功');
        const report = client.generateReport();
        if (report.success) {
          console.log(`Retrospectives: ${report.data.totalRetrospectives}`);
          console.log(`Sprints: ${report.data.totalSprints}`);
          console.log(`总条目数：${report.data.totalItems}`);
        }
        client.close();
      } else {
        console.error('✗ SQLite 连接失败:', result.error.message);
        process.exit(1);
      }
    });

  program
    .command('sqlite:list-retros')
    .description('列出所有 Retrospective')
    .action(() => {
      const client = createSQLiteClient();
      client.connect();

      const result = client.listRetrospectives();
      if (result.success) {
        if (result.data.length === 0) {
          console.log('暂无 Retrospective');
        } else {
          console.table(
            result.data.map((r) => ({
              ID: r.id,
              Sprint: r.sprintId,
              标题：r.title,
              日期：r.date,
              文件：r.fileName,
            }))
          );
        }
        client.close();
      } else {
        console.error('获取 Retrospective 列表失败:', result.error.message);
        process.exit(1);
      }
    });

  program
    .command('sqlite:search <keyword>')
    .description('搜索 Retrospective')
    .action((keyword) => {
      const client = createSQLiteClient();
      client.connect();

      const result = client.searchRetrospectives(keyword);
      if (result.success) {
        if (result.data.length === 0) {
          console.log(`未找到匹配 "${keyword}" 的结果`);
        } else {
          console.log(`找到 ${result.data.length} 条匹配结果:`);
          console.table(
            result.data.map((r) => ({
              Sprint: r.sprintId,
              标题：r.title,
              日期：r.date,
            }))
          );
        }
        client.close();
      } else {
        console.error('搜索失败:', result.error.message);
        process.exit(1);
      }
    });

  program
    .command('sqlite:report')
    .description('生成 Retrospective 统计报告')
    .action(() => {
      const client = createSQLiteClient();
      client.connect();

      const report = client.generateReport();
      if (report.success) {
        console.log('\n=== Retrospective 统计报告 ===\n');
        console.log(`总 Retrospectives: ${report.data.totalRetrospectives}`);
        console.log(`总 Sprints: ${report.data.totalSprints}`);
        console.log(`总条目数：${report.data.totalItems}`);
        console.log('\n按类别统计:');
        report.data.byCategory.forEach((c) => {
          console.log(`  ${c.category}: ${c.count}`);
        });
        console.log('');
        client.close();
      } else {
        console.error('生成报告失败:', report.error.message);
        process.exit(1);
      }
    });

  // ============================================================================
  // 系统命令
  // ============================================================================

  program
    .command('check')
    .description('检查 Node.js 模块可用性')
    .action(() => {
      const available = checkAvailability();
      if (available) {
        console.log('✓ Node.js 高级功能可用');
        console.log('  - Redis 客户端：支持');
        console.log('  - SQLite 客户端：支持');
        console.log('  - CLI 框架：支持');
      } else {
        console.log('✗ Node.js 模块未完全安装');
        console.log('  运行 ./scripts/enable-advanced.sh 启用高级功能');
        process.exit(1);
      }
    });

  program
    .command('doctor')
    .description('诊断系统状态')
    .action(async () => {
      console.log('=== EKET 系统诊断 ===\n');

      // 检查 Node.js 版本
      console.log(`Node.js 版本：${process.version}`);

      // 检查 Redis
      console.log('\n[Redis]');
      const redisClient = createRedisClient();
      const redisResult = await redisClient.connect();
      if (redisResult.success) {
        console.log('  ✓ 连接正常');
        await redisClient.disconnect();
      } else {
        console.log('  ✗ 连接失败：', redisResult.error.message);
      }

      // 检查 SQLite
      console.log('\n[SQLite]');
      const sqliteClient = createSQLiteClient();
      const sqliteResult = sqliteClient.connect();
      if (sqliteResult.success) {
        console.log('  ✓ 连接正常');
        sqliteClient.close();
      } else {
        console.log('  ✗ 连接失败：', sqliteResult.error.message);
      }

      console.log('');
    });

  // ============================================================================
  // 任务管理命令
  // ============================================================================

  // 注册 claim 命令
  registerClaim(program);

  // 解析命令行
  await program.parseAsync(process.argv);
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

// 执行主程序
main().catch((error) => {
  console.error('CLI 启动失败:', error.message);
  process.exit(1);
});
