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
import { startInstance, listAvailableRoles } from './commands/start-instance.js';
import { createMessageQueue, createMessage } from './core/message-queue.js';
import { createHeartbeatManager, createSlaverMonitor } from './core/heartbeat-monitor.js';
import { registerTeamStatus } from './commands/team-status.js';
import { registerSetRole } from './commands/set-role.js';
import { registerRecommend } from './commands/recommend.js';
import { createWebDashboardServer } from './api/web-server.js';
import { registerDependencyAnalyze } from './commands/dependency-analyze.js';
import { registerAlerts } from './commands/alerts.js';
import { OpenCLAWGateway } from './api/openclaw-gateway.js';
import { createHttpHookServer } from './hooks/http-hook-server.js';

// Skills 系统导出（仅供库使用者 import，不参与 CLI 命令）
// 使用方式：import { SkillsRegistry, SkillLoader, UnifiedSkillInterface } from 'eket-cli';
export {
  // 类型
  type Skill,
  type SkillInput,
  type SkillOutput,
  type SkillRegistry,
  type SkillLoaderConfig,
  type UnifiedSkillExecuteParams,
  type UnifiedSkillExecuteResult,
  // 类
  SkillsRegistry,
  SkillLoader,
  UnifiedSkillInterface,
  // 工厂函数
  createSkillsRegistry,
  createSkillLoader,
  createUnifiedSkillInterface,
  // 拦截器
  LoggingInterceptor,
  ValidationInterceptor,
  CachingInterceptor,
  // 内置 Skills
  RequirementDecompositionSkill,
  APIDesignSkill,
  FrontendDevelopmentSkill,
  UnitTestSkill,
  DockerBuildSkill,
  APIDocumentationSkill,
} from './skills/index.js';

const pkg = {
  name: 'eket-cli',
  version: '0.7.3',
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
    .action(async () => {
      const client = createRedisClient();
      const result = await client.connect();

      if (result.success) {
        console.log('✓ Redis 连接成功');
        const slavers = await client.getActiveSlavers();
        if (slavers.success && slavers.data.length > 0) {
          console.log(`活跃 Slaver: ${slavers.data.length}`);
          slavers.data.forEach((s: { slaverId: string; status: string }) => {
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
              Status: s.status,
              CurrentTask: s.currentTaskId || '-',
              Time: new Date(s.timestamp).toLocaleTimeString(),
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
            result.data.map((r: { id: number; sprintId: string; title: string; date: string; fileName: string }) => ({
              ID: r.id,
              Sprint: r.sprintId,
              Title: r.title,
              Date: r.date,
              File: r.fileName,
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
            result.data.map((r: { sprintId: string; title: string; date: string }) => ({
              Sprint: r.sprintId,
              Title: r.title,
              Date: r.date,
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
        report.data.byCategory.forEach((c: { category: string; count: number }) => {
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

  // 注册 start:instance 命令
  program
    .command('start:instance')
    .description('启动 Instance（支持人类/AI 模式）')
    .option('--human', '人类控制的 Instance')
    .option('--role <role>', '指定 Agent 角色（人类模式必需）')
    .option('--auto', 'AI 自动模式（自动领取任务）')
    .option('-p, --project-root <path>', '项目根目录', process.cwd())
    .option('--list-roles', '列出所有可用角色')
    .action(async (options) => {
      if (options.listRoles) {
        listAvailableRoles();
        return;
      }

      // 人类模式必须指定角色
      if (options.human && !options.role) {
        console.error('错误：人类模式必须指定 --role');
        console.error('\n可用角色：运行 eket-cli start:instance --list-roles');
        process.exit(1);
      }

      const result = await startInstance({
        human: options.human,
        role: options.role,
        auto: options.auto,
        projectRoot: options.projectRoot,
      });

      if (!result.success) {
        console.error(`Instance 启动失败：${result.error.message}`);
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
              'Slaver ID': s.slaverId,
              Status: s.status,
              'Current Task': s.currentTaskId || '-',
              'Last Heartbeat': new Date(s.timestamp).toLocaleString(),
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
      await mq.subscribe('test', async (message) => {
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

  // 注册 team-status 命令
  registerTeamStatus(program);

  // 注册 set-role 命令
  registerSetRole(program);

  // 注册 recommend 命令
  registerRecommend(program);

  // 注册 dependency:analyze 命令
  registerDependencyAnalyze(program);

  // 注册 alerts 命令
  registerAlerts(program);

  // ============================================================================
  // Web Dashboard 命令 (Phase 5.1)
  // ============================================================================

  program
    .command('web:dashboard')
    .description('启动 Web 监控面板')
    .option('-p, --port <port>', '端口号', '3000')
    .option('-H, --host <host>', '主机地址', 'localhost')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const host = options.host;

      console.log('\n=== EKET Web Dashboard ===\n');
      console.log('正在启动 Web 服务器...');

      const server = createWebDashboardServer({ port, host });
      const result = await server.start();

      if (!result.success) {
        console.error('启动失败:', result.error.message);
        process.exit(1);
      }

      console.log('\n访问地址：http://' + host + ':' + port);
      console.log('按 Ctrl+C 停止...\n');

      // 等待退出信号
      process.on('SIGINT', async () => {
        console.log('\n正在关闭服务器...');
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await server.stop();
        process.exit(0);
      });

      // 保持进程运行
      setInterval(() => {}, 1000);
    });

  // ============================================================================
  // HTTP Hook Server 命令 (v1.2.0)
  // ============================================================================

  program
    .command('hooks:start')
    .description('启动 HTTP Hook 服务器（接收 Agent 生命周期事件）')
    .option('-p, --port <port>', '端口号', '8899')
    .option('-H, --host <host>', '主机地址', '0.0.0.0')
    .option('-s, --secret <secret>', '认证密钥（可选）')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const secret = options.secret || process.env.EKET_HOOK_SECRET;

      console.log('\n=== EKET HTTP Hook Server v1.2.0 ===\n');
      console.log('正在启动 HTTP Hook 服务器...');
      console.log('配置：');
      console.log(`  端口：${port}`);
      console.log(`  主机：${host}`);
      console.log(`  认证：${secret ? '已启用' : '未启用'}`);
      console.log('');

      const server = createHttpHookServer({ port, host, secret });

      // 注册示例处理器（实际使用时应通过配置文件或插件注册）
      server.on('PreToolUse', async (payload) => {
        console.log(`[Hook] PreToolUse: ${payload.data.toolName} by ${payload.agentName || 'unknown'}`);
        return { action: 'allow' };
      });

      server.on('TeammateIdle', async (payload) => {
        console.log(`[Hook] TeammateIdle: ${payload.agentName} is idle`);
        return { action: 'allow', feedback: 'Task assignment available' };
      });

      server.on('TaskCompleted', async (payload) => {
        console.log(`[Hook] TaskCompleted: ${payload.data.taskId} by ${payload.agentName}`);
        return { action: 'allow' };
      });

      try {
        await server.start();
        console.log('\nHTTP Hook Server 已启动');
        console.log('端点：');
        console.log('  POST /hooks/pre-tool-use       - PreToolUse 事件');
        console.log('  POST /hooks/post-tool-use      - PostToolUse 事件');
        console.log('  POST /hooks/teammate-idle      - TeammateIdle 事件');
        console.log('  POST /hooks/task-completed     - TaskCompleted 事件');
        console.log('  POST /hooks/permission-request - PermissionRequest 事件');
        console.log('  GET  /health                   - 健康检查');
        console.log('\n按 Ctrl+C 停止...\n');

        // 等待退出信号
        process.on('SIGINT', async () => {
          console.log('\n正在关闭 Hook 服务器...');
          await server.stop();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          await server.stop();
          process.exit(0);
        });

        // 保持进程运行
        setInterval(() => {}, 1000);
      } catch (err) {
        console.error('Hook Server 启动失败:', err instanceof Error ? err.message : 'Unknown error');
        process.exit(1);
      }
    });

  // ============================================================================
  // OpenCLAW Gateway 命令
  // ============================================================================

  program
    .command('gateway:start')
    .description('启动 OpenCLAW API Gateway')
    .option('-p, --port <port>', '端口号', '8080')
    .option('-H, --host <host>', '主机地址', 'localhost')
    .option('-k, --api-key <key>', 'API Key（不推荐，建议使用环境变量）')
    .option('-P, --project-root <path>', '项目根目录', process.cwd())
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const projectRoot = options.projectRoot;

      // 安全修复：从环境变量获取 API Key，不提供默认值
      const apiKey = options.apiKey || process.env.OPENCLAW_API_KEY;

      // 强制要求 API Key
      if (!apiKey) {
        console.error('\n❌ 错误：缺少 API Key');
        console.error('\n请使用以下方法之一设置 API Key:');
        console.error('  1. 命令行参数：--api-key <your-key>');
        console.error('  2. 环境变量：export OPENCLAW_API_KEY=<your-key>');
        console.error('\n安全提示:');
        console.error('  - API Key 应至少 32 个字符');
        console.error('  - 使用随机生成的字符串（如：openssl rand -hex 16）');
        console.error('  - 不要使用默认值或简单字符串\n');
        process.exit(1);
      }

      // 警告使用默认/简单 Key
      const dangerousKeys = ['eket-dev-key', 'dev-key', 'test-key', 'changeme', '123456'];
      if (dangerousKeys.includes(apiKey.toLowerCase()) || apiKey.length < 16) {
        console.warn('\n⚠️  安全警告：API Key 过于简单');
        console.warn('建议生成一个更安全的 Key:');
        console.warn('  openssl rand -hex 16');
        console.warn('  或使用：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
      }

      console.log('\n=== OpenCLAW API Gateway ===\n');
      console.log('正在启动 API Gateway...');
      console.log('配置：');
      console.log(`  端口：${port}`);
      console.log(`  主机：${host}`);
      console.log(`  项目目录：${projectRoot}`);
      console.log('');

      const gateway = new OpenCLAWGateway({
        port,
        host,
        apiKey,
        projectRoot,
      });

      try {
        await gateway.start();
        console.log('\n访问地址：http://' + host + ':' + port);
        console.log('API 端点：');
        console.log('  POST/GET /api/v1/workflow - Workflow 管理');
        console.log('  POST/GET /api/v1/task     - Task 管理');
        console.log('  POST/GET /api/v1/agent    - Agent 管理');
        console.log('  GET  /api/v1/memory       - Memory 查询');
        console.log('  GET  /health              - 健康检查');
        console.log('\n按 Ctrl+C 停止...\n');

        // 等待退出信号
        process.on('SIGINT', async () => {
          console.log('\n正在关闭 Gateway...');
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          process.exit(0);
        });

        // 保持进程运行
        setInterval(() => {}, 1000);
      } catch (err) {
        console.error('Gateway 启动失败:', err instanceof Error ? err.message : 'Unknown error');
        process.exit(1);
      }
    });

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
