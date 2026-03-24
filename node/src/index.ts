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
import { runInitWizard } from './commands/init-wizard.js';
import { registerSubmitPR } from './commands/submit-pr.js';
import { createMessageQueue, createMessage } from './core/message-queue.js';
import { createHeartbeatManager, createSlaverMonitor } from './core/heartbeat-monitor.js';
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

  // 注册 init 命令
  program
    .command('init')
    .description('项目初始化向导')
    .option('-p, --path <path>', '项目路径', process.cwd())
    .action(async (options) => {
      console.log('\n启动项目初始化向导...\n');
      const result = await runInitWizard(options.path);
      if (!result) {
        process.exit(1);
      }
    });

  // 注册 heartbeat 命令
  program
    .command('heartbeat:start <slaverId>')
    .description('启动 Slaver 心跳')
    .option('-i, --interval <ms>', '心跳间隔（毫秒）', '10000')
    .action(async (slaverId, options) => {
      const manager = createHeartbeatManager(slaverId, {
        heartbeatInterval: parseInt(options.interval, 10),
      });

      const result = await manager.start();
      if (!result.success) {
        console.error('启动心跳失败:', result.error.message);
        process.exit(1);
      }

      console.log(`心跳已启动：${slaverId}`);
      console.log('按 Ctrl+C 停止...\n');

      // 等待退出信号
      process.on('SIGINT', async () => {
        await manager.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await manager.stop();
        process.exit(0);
      });

      // 保持进程运行
      setInterval(() => {}, 1000);
    });

  program
    .command('heartbeat:status')
    .description('查看 Slaver 心跳状态')
    .action(async () => {
      const monitor = createSlaverMonitor();
      await monitor.start();

      const result = await monitor.getActiveSlavers();
      if (result.success) {
        if (result.data.length === 0) {
          console.log('暂无活跃 Slaver');
        } else {
          console.table(
            result.data.map((s) => ({
              Slaver ID: s.slaverId,
              状态：s.status,
              当前任务：s.currentTaskId || '-',
              最后心跳：new Date(s.timestamp).toLocaleString(),
            }))
          );
        }
      } else {
        console.error('获取状态失败:', result.error.message);
      }

      await monitor.stop();
    });

  // 注册 mq:test 命令
  program
    .command('mq:test')
    .description('测试消息队列')
    .action(async () => {
      console.log('=== 消息队列测试 ===\n');

      const mq = createMessageQueue({ mode: 'auto' });
      const connectResult = await mq.connect();

      if (!connectResult.success) {
        console.error('连接消息队列失败:', connectResult.error.message);
        process.exit(1);
      }

      console.log(`当前模式：${mq.getMode()}\n`);

      // 订阅测试通道
      await mq.subscribe('test', (message) => {
        console.log('收到消息:', message);
      });

      // 发送测试消息
      const testMessage = createMessage(
        'notification',
        'system',
        'all',
        { text: '这是一条测试消息' }
      );

      console.log('发送测试消息...');
      const publishResult = await mq.publish('test', testMessage);

      if (publishResult.success) {
        console.log('✓ 消息发送成功');
      } else {
        console.error('✗ 消息发送失败:', publishResult.error.message);
      }

      // 等待消息处理
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await mq.disconnect();
      console.log('\n测试完成');
    });

  // 注册 submit-pr 命令
  registerSubmitPR(program);

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
