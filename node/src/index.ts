#!/usr/bin/env node
/**
 * EKET Framework CLI
 * Version: 2.0.0
 *
 * 混合架构 CLI 入口 - 支持 Node.js 高级功能，同时保持 Shell 降级能力
 *
 * 运维就绪性增强 (v2.0.0):
 * - 结构化日志
 * - 内存监控
 * - 优雅关闭
 * - 健康检查
 */

import { Command } from 'commander';
import ora from 'ora';

import { OpenCLAWGateway } from './api/openclaw-gateway.js';
import { createWebDashboardServer } from './api/web-server.js';
import { registerAlerts } from './commands/alerts.js';
import { registerClaim } from './commands/claim.js';
import { registerHandoff } from './commands/handoff.js';
import { registerTaskResume } from './commands/task-resume.js';
import { registerDependencyAnalyze } from './commands/dependency-analyze.js';
import { registerGateReview } from './commands/gate-review.js';
import { registerMasterHeartbeat } from './commands/master-heartbeat.js';
import { runInitWizard } from './commands/init-wizard.js';
import { runInteractiveStartCLI } from './commands/interactive-start.js';
import { registerMasterPoll } from './commands/master-poll.js';
import { registerRecommend } from './commands/recommend.js';
import { registerCompletion } from './utils/completion.js';
import { registerSetRole } from './commands/set-role.js';
import { registerSlaverPoll } from './commands/slaver-poll.js';
import { registerSlaverRegister } from './commands/slaver-register.js';
import { startInstance, listAvailableRoles } from './commands/start-instance.js';
import { registerSubmitPR } from './commands/submit-pr.js';
import { registerTeamStatus } from './commands/team-status.js';
import { createAgentPoolManager } from './core/agent-pool.js';
import { createHeartbeatManager, createSlaverMonitor } from './core/heartbeat-monitor.js';
import { createMessageQueue, createMessage } from './core/message-queue.js';
import { createRedisClient } from './core/redis-client.js';
import { createSQLiteManager } from './core/sqlite-manager.js';
import { createHttpHookServer } from './hooks/http-hook-server.js';
import { WORKFLOW_TEMPLATES, getWorkflowTemplate, type WorkflowTemplateName } from './core/workflow-engine.js';
import { printError, logSuccess, logWarning } from './utils/error-handler.js';

// 运维就绪性模块导入
import { logger, initLogger } from './utils/logger.js';
import { startGlobalMemoryMonitoring } from './utils/memory-monitor.js';
import { setupProcessHandlers, gracefulShutdown } from './utils/process-cleanup.js';

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

// ============================================================================
// Phase 10 - Architecture Improvements Exports
// ============================================================================

export {
  // Dependency Injection
  DIContainer,
  createContainer,
  getGlobalContainer,
  resetGlobalContainer,
  Service,
  Inject,
  type ServiceLifetime,
  type ServiceDescriptor,
  type ContainerConfig,
  type ContainerStats,
} from './di/container.js';

export {
  // Configuration Management
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  getConfig,
  setConfig,
  validateConfig,
  type AppConfig,
  type ConfigSource,
  type ConfigChangeEvent,
  type ConfigChangeListener,
  type RedisConfig,
  type SQLiteConfig,
  type MessageQueueConfig,
  type MasterElectionConfig,
  type ConnectionConfig,
} from './config/app-config.js';

export {
  // Event Bus
  EventBus,
  createEventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
  SystemEvents,
  TaskEvents,
  MessageEvents,
  ConfigEvents,
  type DomainEvent,
  type EventHandler,
  type EventInterceptor,
  type SubscriptionOptions,
  type EventBusConfig,
  type DeadLetterEvent,
  type EventBusStats,
} from './core/event-bus.js';

export {
  // Master Election with Warm Standby
  MasterElection,
  createMasterElection,
  type MasterRole,
  type MasterState,
  type WarmStandbyConfig,
  type MasterElectionResult,
  type ElectionLevel,
} from './core/master-election.js';

// ============================================================================
// Utility Exports (TASK-004: Progress Bar)
// ============================================================================

export {
  // Progress Bar Utilities
  createProgressBar,
  createMultiProgressBar,
  withProgress,
  MultiStepProgress,
  formatDuration,
  type ProgressBarConfig,
  type ProgressStep,
} from './utils/progress.js';

const pkg = {
  name: 'eket-cli',
  version: '2.0.0',
  description: 'EKET Framework CLI - AI Agent Collaboration Tools',
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

  program.name(pkg.name).version(pkg.version).description(pkg.description);

  // ============================================================================
  // Redis Commands
  // ============================================================================

  program
    .command('redis:check')
    .description('Check Redis connection status')
    .option('-h, --host <host>', 'Redis host', process.env.EKET_REDIS_HOST || 'localhost')
    .option('-p, --port <port>', 'Redis port', process.env.EKET_REDIS_PORT || '6379')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli redis:check                        # Check local Redis connection
  $ eket-cli redis:check -h redis.example.com   # Check remote Redis

Related Commands:
  $ eket-cli system:doctor                      # Full system diagnosis
  $ eket-cli redis:list-slavers                 # List active Slavers
`
    )
    .action(async () => {
      const spinner = ora('Connecting to Redis...').start();
      const client = createRedisClient();
      const result = await client.connect();

      if (result.success) {
        spinner.succeed('Redis connection established');
        const slavers = await client.getActiveSlavers();
        if (slavers.success && slavers.data.length > 0) {
          console.log(`Active Slavers: ${slavers.data.length}`);
          slavers.data.forEach((s: { slaverId: string; status: string }) => {
            console.log(`  - ${s.slaverId} (${s.status})`);
          });
        } else {
          console.log('No active Slavers');
        }
        await client.disconnect();
      } else {
        spinner.fail('Redis connection failed');
        printError({
          code: 'REDIS_CONNECTION_FAILED',
          message: result.error.message,
          causes: [
            'Redis server is not running',
            'Incorrect host or port configuration',
            'Network connectivity issues',
          ],
          solutions: [
            'Start Redis: redis-server or docker run -d -p 6379:6379 redis',
            'Check host/port: redis-cli -h <host> -p <port> ping',
            'Verify EKET_REDIS_HOST and EKET_REDIS_PORT environment variables',
          ],
          docLink: 'https://redis.io/docs/latest/operate/oss_and_stack/management/connection/',
        });
        process.exit(1);
      }
    });

  program
    .command('redis:list-slavers')
    .description('List all active Slavers')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli redis:list-slavers                 # List all active Slavers

Related Commands:
  $ eket-cli redis:check                        # Check Redis connection
  $ eket-cli pool:status                        # View agent pool status
`
    )
    .action(async () => {
      const spinner = ora('Fetching Slaver list...').start();
      const client = createRedisClient();
      await client.connect();

      const result = await client.getActiveSlavers();
      if (result.success) {
        spinner.succeed('Slaver list fetched');
        if (result.data.length === 0) {
          console.log('\nNo active Slavers');
        } else {
          console.log('');
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
        spinner.fail('Failed to fetch Slaver list');
        printError({
          code: 'REDIS_FETCH_FAILED',
          message: result.error.message,
        });
        process.exit(1);
      }
    });

  // ============================================================================
  // SQLite Commands
  // ============================================================================

  program
    .command('sqlite:check')
    .description('Check SQLite database status')
    .option('-d, --database <path>', 'Database file path')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli sqlite:check                       # Check default SQLite database
  $ eket-cli sqlite:check -d /path/to/db.sqlite # Check custom database path

Related Commands:
  $ eket-cli system:doctor                      # Full system diagnosis
  $ eket-cli sqlite:list-retros                 # List all Retrospectives
`
    )
    .action(async (options) => {
      const spinner = ora('Connecting to SQLite...').start();
      const manager = await createSQLiteManager({
        useWorker: false,
        dbPath: options.database
      });
      const result = await manager.connect();

      if (result.success) {
        spinner.succeed('SQLite connection established');
        const report = await manager.generateReport();
        if (report.success) {
          console.log(`\nRetrospectives: ${report.data.totalRetrospectives}`);
          console.log(`Sprints: ${report.data.totalSprints}`);
          console.log(`Total Items: ${report.data.totalItems}`);
        }
        await manager.close();
      } else {
        spinner.fail('SQLite connection failed');
        printError({
          code: 'SQLITE_CONNECTION_FAILED',
          message: result.error.message,
          solutions: [
            'Verify database file path exists',
            'Check file permissions',
            'Ensure SQLite is installed: npm install better-sqlite3',
          ],
        });
        process.exit(1);
      }
    });

  program
    .command('sqlite:list-retros')
    .description('List all Retrospectives')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli sqlite:list-retros                 # List all Retrospectives

Related Commands:
  $ eket-cli sqlite:search <keyword>            # Search Retrospectives
  $ eket-cli sqlite:report                      # Generate statistics report
`
    )
    .action(async () => {
      const spinner = ora('Fetching Retrospectives...').start();
      const manager = await createSQLiteManager({ useWorker: false });
      await manager.connect();

      const result = await manager.listRetrospectives();
      if (result.success) {
        spinner.succeed('Retrospectives fetched');
        if (result.data.length === 0) {
          console.log('\nNo Retrospectives found');
        } else {
          console.log('');
          console.table(
            result.data.map((r) => {
              const retro = r as {
                id: number;
                sprintId: string;
                title: string;
                date: string;
                fileName: string;
              };
              return {
                ID: retro.id,
                Sprint: retro.sprintId,
                Title: retro.title,
                Date: retro.date,
                File: retro.fileName,
              };
            })
          );
        }
        await manager.close();
      } else {
        spinner.fail('Failed to fetch Retrospectives');
        printError({
          code: 'SQLITE_FETCH_FAILED',
          message: result.error.message,
        });
        process.exit(1);
      }
    });

  program
    .command('sqlite:search <keyword>')
    .description('Search Retrospectives by keyword')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli sqlite:search "performance"        # Search for performance related items
  $ eket-cli sqlite:search "bug"                # Search for bug related items

Related Commands:
  $ eket-cli sqlite:list-retros                 # List all Retrospectives
  $ eket-cli sqlite:report                      # Generate statistics report
`
    )
    .action(async (keyword) => {
      const spinner = ora(`Searching for "${keyword}"...`).start();
      const manager = await createSQLiteManager({ useWorker: false });
      await manager.connect();

      const result = await manager.searchRetrospectives(keyword);
      if (result.success) {
        if (result.data.length === 0) {
          spinner.info(`No results found for "${keyword}"`);
        } else {
          spinner.succeed(`Found ${result.data.length} results`);
          console.log('');
          console.table(
            result.data.map((r) => {
              const retro = r as { sprintId: string; title: string; date: string };
              return {
                Sprint: retro.sprintId,
                Title: retro.title,
                Date: retro.date,
              };
            })
          );
        }
        await manager.close();
      } else {
        spinner.fail('Search failed');
        printError({
          code: 'SQLITE_SEARCH_FAILED',
          message: result.error.message,
        });
        process.exit(1);
      }
    });

  program
    .command('sqlite:report')
    .description('Generate Retrospective statistics report')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli sqlite:report                      # Generate statistics report

Related Commands:
  $ eket-cli sqlite:list-retros                 # List all Retrospectives
  $ eket-cli sqlite:search <keyword>            # Search Retrospectives
`
    )
    .action(async () => {
      const spinner = ora('Generating report...').start();
      const manager = await createSQLiteManager({ useWorker: false });
      await manager.connect();

      const report = await manager.generateReport();
      if (report.success) {
        spinner.succeed('Report generated');
        console.log('\n=== Retrospective Statistics Report ===\n');
        console.log(`Total Retrospectives: ${report.data.totalRetrospectives}`);
        console.log(`Total Sprints: ${report.data.totalSprints}`);
        console.log(`Total Items: ${report.data.totalItems}`);
        console.log('\nBy Category:');
        report.data.byCategory.forEach((c: { category: string; count: number }) => {
          console.log(`  ${c.category}: ${c.count}`);
        });
        console.log('');
        await manager.close();
      } else {
        spinner.fail('Failed to generate report');
        printError({
          code: 'SQLITE_REPORT_FAILED',
          message: report.error.message,
        });
        process.exit(1);
      }
    });

  // ============================================================================
  // System Commands
  // ============================================================================

  program
    .command('system:check')
    .description('Check Node.js module availability')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli system:check                 # Check if all modules are installed

Related Commands:
  $ eket-cli system:doctor                # Full system diagnosis
`
    )
    .action(() => {
      const available = checkAvailability();
      if (available) {
        logSuccess('Node.js advanced features available', [
          'Redis client: supported',
          'SQLite client: supported',
          'CLI framework: supported',
        ]);
      } else {
        printError({
          code: 'MODULES_NOT_INSTALLED',
          message: 'Node.js modules are not fully installed',
          solutions: [
            'Run ./scripts/enable-advanced.sh to enable advanced features',
            'Run npm install in the node directory',
          ],
        });
        process.exit(1);
      }
    });

  program
    .command('system:doctor')
    .description('Diagnose system status')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli system:doctor                # Run full system diagnosis

Related Commands:
  $ eket-cli system:check                 # Quick module availability check
  $ eket-cli redis:check                  # Check Redis connection only
  $ eket-cli sqlite:check                 # Check SQLite connection only
`
    )
    .action(async () => {
      console.log('\n=== EKET System Doctor ===\n');

      // Check Node.js version
      console.log(`Node.js Version: ${process.version}`);

      // Check Redis
      console.log('\n[Redis]');
      const redisClient = createRedisClient();
      const redisResult = await redisClient.connect();
      if (redisResult.success) {
        console.log('  ✓ Connection: OK');
        await redisClient.disconnect();
      } else {
        console.log('  ✗ Connection: FAILED');
        console.log(`     Error: ${redisResult.error.message}`);
      }

      // Check SQLite
      console.log('\n[SQLite]');
      const sqliteManager = await createSQLiteManager({ useWorker: false });
      const sqliteResult = await sqliteManager.connect();
      if (sqliteResult.success) {
        console.log('  ✓ Connection: OK');
        await sqliteManager.close();
      } else {
        console.log('  ✗ Connection: FAILED');
        console.log(`     Error: ${sqliteResult.error.message}`);
      }

      console.log('');
    });

  // ============================================================================
  // 任务管理命令
  // ============================================================================

  // 注册 claim 命令
  registerClaim(program);

  // 注册 handoff 命令
  registerHandoff(program);

  // 注册 task:resume 命令
  registerTaskResume(program);

  // 注册 project:init 命令
  program
    .command('project:init')
    .description('Project initialization wizard')
    .option('-p, --path <path>', 'Project root path', process.cwd())
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli project:init                     # Initialize current directory
  $ eket-cli project:init -p /my/project      # Initialize specific path
  $ eket-cli project:init --path ./my-app     # Initialize relative path

Related Commands:
  $ eket-cli instance:start                   # Start an agent instance
  $ eket-cli system:check                     # Verify system requirements
`
    )
    .action(async (options) => {
      console.log('\n🚀 Starting Project Initialization Wizard...\n');
      const result = await runInitWizard(options.path);
      if (!result) {
        printError({
          code: 'INIT_FAILED',
          message: 'Project initialization failed',
          solutions: [
            'Check that you have write permissions in the target directory',
            'Ensure the directory is not already initialized',
            'Run with --path to specify a different directory',
          ],
        });
        process.exit(1);
      }
      logSuccess('Project initialization completed');
    });

  // 注册 instance:start 命令
  program
    .command('instance:start')
    .description('Start an instance (Master or Slaver mode)')
    .option('--human', 'Human-controlled instance')
    .option('--role <role>', 'Specify agent role (required for human mode)')
    .option('--auto', 'AI auto mode (automatically claim tasks)')
    .option('-p, --project-root <path>', 'Project root directory', process.cwd())
    .option('--list-roles', 'List all available roles')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli instance:start --auto                  # Start AI auto mode
  $ eket-cli instance:start --human --role frontend_dev  # Start human mode with role
  $ eket-cli instance:start --list-roles            # List available roles
  $ eket-cli instance:start -p /path/to/project     # Start in specific directory

Related Commands:
  $ eket-cli project:init                           # Initialize project first
  $ eket-cli instance:set-role                      # Change role after starting
  $ eket-cli task:claim                             # Claim a task manually

Available Roles:
  Coordinators: product_manager, architect, tech_manager, doc_monitor
  Executors: frontend_dev, backend_dev, qa_engineer, devops_engineer, designer, tester, fullstack
`
    )
    .action(async (options) => {
      if (options.listRoles) {
        listAvailableRoles();
        return;
      }

      // 人类模式必须指定角色
      if (options.human && !options.role) {
        printError({
          code: 'MISSING_ROLE',
          message: 'Role is required for human mode',
          solutions: [
            'Specify --role with a valid role name',
            'Run instance:start --list-roles to see available roles',
          ],
          docLink: 'https://github.com/eket-framework/docs/blob/main/agent-roles.md',
        });
        process.exit(1);
      }

      const spinner = ora('Starting instance...').start();

      try {
        const result = await startInstance({
          human: options.human,
          role: options.role,
          auto: options.auto,
          projectRoot: options.projectRoot,
        });

        if (!result.success) {
          spinner.fail('Instance start failed');
          printError({
            code: 'INSTANCE_START_FAILED',
            message: result.error.message,
            solutions: [
              'Check if project is initialized (run project:init)',
              'Verify Redis/SQLite configuration',
              'Run system:doctor for full diagnosis',
            ],
          });
          process.exit(1);
        }

        spinner.succeed('Instance started successfully');

        const mode =
          result.data.instanceType === 'master'
            ? 'Master'
            : `Slaver (${options.human ? 'human' : 'ai-' + (options.auto ? 'auto' : 'manual')})`;
        logSuccess(
          `Instance role: ${mode}`,
          [
            `Project: ${options.projectRoot}`,
            options.role ? `Agent role: ${options.role}` : null,
          ].filter(Boolean) as string[]
        );
      } catch (error) {
        spinner.fail('Instance start failed');
        printError({
          code: 'INSTANCE_START_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
        process.exit(1);
      }
    });

  // 注册 interactive:start 命令 (TASK-001: CLI 体验优化)
  program
    .command('interactive:start')
    .description('Start an instance with interactive wizard')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli interactive:start              # Start interactive wizard

Related Commands:
  $ eket-cli instance:start                 # Start instance with command-line options
  $ eket-cli project:init                   # Initialize project first

Description:
  Interactive wizard guides you through:
  - Selecting instance mode (AI auto / Human / AI manual)
  - Choosing agent role
  - Confirming configuration
  - One-click startup
`
    )
    .action(async () => {
      await runInteractiveStartCLI();
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

  // 注册 queue:test 命令
  program
    .command('queue:test')
    .description('Test message queue functionality')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli queue:test                       # Run message queue test

Related Commands:
  $ eket-cli system:check                     # Check system connectivity
  $ eket-cli redis:check                      # Check Redis connection
`
    )
    .action(async () => {
      const spinner = ora('Connecting to message queue...').start();

      const mq = createMessageQueue({ mode: 'auto' });
      const connectResult = await mq.connect();

      if (!connectResult.success) {
        spinner.fail('Failed to connect to message queue');
        printError({
          code: 'MQ_CONNECTION_FAILED',
          message: connectResult.error.message,
          solutions: [
            'Check if Redis is running (redis-cli ping)',
            'Verify EKET_REDIS_HOST and EKET_REDIS_PORT environment variables',
            'Run system:doctor for full diagnosis',
          ],
        });
        process.exit(1);
      }

      spinner.succeed('Connected to message queue');
      console.log(`Current mode: ${mq.getMode()}\n`);

      // 订阅测试通道
      const subscribeSpinner = ora('Subscribing to test channel...').start();
      await mq.subscribe('test', async (message) => {
        console.log('📨 Received message:', message);
      });
      subscribeSpinner.succeed('Subscribed to test channel');

      // 发送测试消息
      const testMessage = createMessage('notification', 'system', 'all', {
        text: '这是一条测试消息',
      });

      const publishSpinner = ora('Sending test message...').start();
      const publishResult = await mq.publish('test', testMessage);

      if (publishResult.success) {
        publishSpinner.succeed('Message sent successfully');
      } else {
        publishSpinner.fail('Failed to send message');
        printError({
          code: 'MQ_PUBLISH_FAILED',
          message: publishResult.error.message,
        });
      }

      // 等待消息处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      await mq.disconnect();
      console.log('\n✓ Test completed');
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

  // 注册 gate:review 命令（执行前关卡审查）
  registerGateReview(program);

  // 注册 master:heartbeat 命令（Master 4问自检）
  registerMasterHeartbeat(program);


  // 注册 alerts 命令
  registerAlerts(program);

  // 注册 slaver:register 命令
  registerSlaverRegister(program);

  // 注册 master:poll 命令
  registerMasterPoll(program);

  // 注册 slaver:poll 命令
  registerSlaverPoll(program);

  // ============================================================================
  // Web Dashboard 命令 (Phase 5.1)
  // ============================================================================

  program
    .command('web:dashboard')
    .description('Start Web monitoring dashboard')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('-H, --host <host>', 'Host address', 'localhost')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli web:dashboard                      # Start on default port 3000
  $ eket-cli web:dashboard -p 8080              # Start on custom port
  $ eket-cli web:dashboard -H 0.0.0.0 -p 3000   # Start on all interfaces

Related Commands:
  $ eket-cli system:doctor                      # Check system status
  $ eket-cli redis:list-slavers                 # View active Slavers
`
    )
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const host = options.host;

      const spinner = ora('Starting web dashboard...').start();
      console.log('\n=== EKET Web Dashboard ===\n');

      const server = createWebDashboardServer({ port, host });
      const result = await server.start();

      if (!result.success) {
        spinner.fail('Failed to start web dashboard');
        printError({
          code: 'DASHBOARD_START_FAILED',
          message: result.error.message,
          solutions: [
            'Check if port is already in use',
            'Verify Redis/SQLite connections',
            'Run system:doctor for diagnosis',
          ],
        });
        process.exit(1);
      }

      spinner.succeed('Web dashboard started');
      console.log(`\n📊 Dashboard URL: http://${host}:${port}`);
      console.log('\nPress Ctrl+C to stop...\n');

      // 等待退出信号
      process.on('SIGINT', async () => {
        console.log('\n🛑  Shutting down dashboard...');
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
    .description('Start HTTP Hook server (receive Agent lifecycle events)')
    .option('-p, --port <port>', 'Port number', '8899')
    .option('-H, --host <host>', 'Host address', '0.0.0.0')
    .option('-s, --secret <secret>', 'Authentication secret (optional)')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli hooks:start                        # Start on default port 8899
  $ eket-cli hooks:start -p 9000                # Start on custom port
  $ eket-cli hooks:start -s my-secret           # Start with auth secret

Related Commands:
  $ eket-cli system:doctor                      # Check system status
  $ eket-cli pool:status                        # View agent pool status

Endpoints:
  POST /hooks/pre-tool-use       - PreToolUse event
  POST /hooks/post-tool-use      - PostToolUse event
  POST /hooks/teammate-idle      - TeammateIdle event
  POST /hooks/task-completed     - TaskCompleted event
  POST /hooks/permission-request - PermissionRequest event
  GET  /health                   - Health check
`
    )
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const secret = options.secret || process.env.EKET_HOOK_SECRET;

      console.log('\n=== EKET HTTP Hook Server v1.2.0 ===\n');

      const server = createHttpHookServer({ port, host, secret });

      // 注册示例处理器
      server.on('PreToolUse', async (payload) => {
        console.log(
          `[Hook] PreToolUse: ${payload.data.toolName} by ${payload.agentName || 'unknown'}`
        );
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
        console.log('\n✓ HTTP Hook Server started');
        console.log('\nEndpoints:');
        console.log('  POST /hooks/pre-tool-use       - PreToolUse event');
        console.log('  POST /hooks/post-tool-use      - PostToolUse event');
        console.log('  POST /hooks/teammate-idle      - TeammateIdle event');
        console.log('  POST /hooks/task-completed     - TaskCompleted event');
        console.log('  POST /hooks/permission-request - PermissionRequest event');
        console.log('  GET  /health                   - Health check');
        console.log('\nPress Ctrl+C to stop...\n');

        // 等待退出信号
        process.on('SIGINT', async () => {
          console.log('\n🛑  Shutting down hook server...');
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
        printError({
          code: 'HOOK_SERVER_START_FAILED',
          message: err instanceof Error ? err.message : 'Failed to start hook server',
          solutions: [
            'Check if port is already in use',
            'Verify EKET_HOOK_SECRET environment variable',
          ],
        });
        process.exit(1);
      }
    });

  // ============================================================================
  // Agent Pool 命令 (v1.3.0)
  // ============================================================================

  program
    .command('pool:status')
    .description('View Agent Pool status')
    .option('-r, --role <role>', 'Filter by role')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli pool:status                        # View all agents
  $ eket-cli pool:status -r frontend_dev        # Filter by role

Related Commands:
  $ eket-cli pool:select -r <role>              # Select best agent
  $ eket-cli redis:list-slavers                 # View active Slavers
`
    )
    .action(async (options) => {
      const spinner = ora('Connecting to agent pool...').start();
      console.log('\n=== EKET Agent Pool Status v1.3.0 ===\n');

      const pool = createAgentPoolManager();
      const startResult = await pool.start();

      if (!startResult.success) {
        spinner.fail('Failed to connect to agent pool');
        printError({
          code: 'POOL_START_FAILED',
          message: startResult.error.message,
          solutions: [
            'Check if Redis is running (redis-cli ping)',
            'Verify EKET_REDIS_HOST environment variable',
          ],
        });
        process.exit(1);
      }

      spinner.succeed('Connected to agent pool');

      try {
        // 获取统计信息
        const statsResult = await pool.getStats();
        if (statsResult.success) {
          const stats = statsResult.data;
          console.log('\nPool Statistics:');
          console.log(`  Total Agents: ${stats.totalAgents}`);
          console.log(`  Idle: ${stats.idleAgents}`);
          console.log(`  Busy: ${stats.busyAgents}`);
          console.log(`  Offline: ${stats.offlineAgents}`);
          console.log(`  Total Capacity: ${stats.totalCapacity}`);
          console.log(`  Used Capacity: ${stats.usedCapacity}`);
          console.log(`  Utilization: ${(stats.utilizationRate * 100).toFixed(1)}%`);
          console.log('');
        }

        // 获取容量信息
        const capacityResult = await pool.getAllAgentCapacities(options.role);
        if (capacityResult.success && capacityResult.data.length > 0) {
          console.log('Agent Capacity:');
          console.table(
            capacityResult.data.map((c) => ({
              'Agent ID': c.agentId,
              Role: c.role,
              'Current Load': c.currentLoad,
              'Max Load': c.maxLoad,
              'Available Slots': c.availableSlots,
              Utilization: `${(c.utilizationRate * 100).toFixed(0)}%`,
            }))
          );
          console.log('');
        } else {
          console.log('No agent information available');
          console.log('');
        }
      } finally {
        await pool.stop();
      }
    });

  program
    .command('pool:select')
    .description('Select the best suited agent')
    .requiredOption('-r, --role <role>', 'Required role')
    .option('-s, --skills <skills>', 'Required skills (comma-separated)')
    .option('-S, --strategy <strategy>', 'Selection strategy', 'least_loaded')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli pool:select -r frontend_dev                 # Select frontend developer
  $ eket-cli pool:select -r backend_dev -s api,db        # Select with skills
  $ eket-cli pool:select -r qa_engineer -S most_expert   # Use different strategy

Selection Strategies:
  least_loaded    - Select agent with lowest current load (default)
  most_expert     - Select agent with highest skill match
  first_available - Select first available agent

Related Commands:
  $ eket-cli pool:status                        # View all agents
  $ eket-cli redis:list-slavers                 # View active Slavers
`
    )
    .action(async (options) => {
      const requiredSkills = options.skills
        ? options.skills.split(',').map((s: string) => s.trim())
        : undefined;
      const strategy = options.strategy as string;

      console.log('\n=== EKET Agent Selection v1.3.0 ===\n');

      console.log('Search Criteria:');
      console.log(`  Role: ${options.role}`);
      if (requiredSkills) {
        console.log(`  Skills: ${requiredSkills.join(', ')}`);
      }
      console.log(`  Strategy: ${strategy}`);
      console.log('');

      const spinner = ora('Searching for best agent...').start();

      const pool = createAgentPoolManager();
      const startResult = await pool.start();

      if (!startResult.success) {
        spinner.fail('Failed to connect to agent pool');
        printError({
          code: 'POOL_START_FAILED',
          message: startResult.error.message,
        });
        process.exit(1);
      }

      try {
        const result = await pool.selectAgent(options.role, requiredSkills, strategy as any);

        if (!result.success) {
          spinner.fail('Selection failed');
          printError({
            code: 'AGENT_SELECTION_FAILED',
            message: result.error?.message || 'Failed to select agent',
            solutions: [
              'Check if any agents match the specified role',
              'Verify the role name is correct',
              'Try a different selection strategy',
            ],
          });
          process.exit(1);
        }

        if (result.data) {
          spinner.succeed('Agent selected');
          console.log('\nSelected Agent:');
          console.log(`  ID: ${result.data.id}`);
          console.log(`  Role: ${result.data.role}`);
          console.log(`  Skills: ${result.data.skills.join(', ')}`);
          console.log(`  Current Load: ${result.data.currentLoad}/${result.data.maxLoad}`);
          console.log(`  Status: ${result.data.status}`);
        } else {
          spinner.fail('No matching agent found');
          console.log('\nNo agent found matching the criteria');
        }
      } finally {
        await pool.stop();
      }
    });

  // ============================================================================
  // OpenCLAW Gateway 命令
  // ============================================================================

  program
    .command('gateway:start')
    .description('Start OpenCLAW API Gateway')
    .option('-p, --port <port>', 'Port number', '8080')
    .option('-H, --host <host>', 'Host address', 'localhost')
    .option('-k, --api-key <key>', 'API Key (not recommended, use env var instead)')
    .option('-P, --project-root <path>', 'Project root directory', process.cwd())
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli gateway:start                      # Start on default port 8080
  $ eket-cli gateway:start -p 9090              # Start on custom port
  $ eket-cli gateway:start --api-key my-key     # Start with API key
  $ eket-cli gateway:start -P /path/to/project  # Start with project root

Security Tips:
  - API Key should be at least 32 characters
  - Use randomly generated strings: openssl rand -hex 16
  - Never use default values or simple strings
  - Use environment variable OPENCLAW_API_KEY instead

Related Commands:
  $ eket-cli system:doctor                      # Check system status
  $ eket-cli pool:status                        # View agent pool status
`
    )
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const projectRoot = options.projectRoot;

      // 安全修复：从环境变量获取 API Key
      const apiKey = options.apiKey || process.env.OPENCLAW_API_KEY;

      // 强制要求 API Key
      if (!apiKey) {
        printError({
          code: 'MISSING_API_KEY',
          message: 'API Key is required',
          solutions: [
            'Use --api-key <your-key> command line option',
            'Set OPENCLAW_API_KEY environment variable',
          ],
          docLink: 'https://github.com/eket-framework/docs/blob/main/security.md',
        });
        console.error('\nSecurity Tips:');
        console.error('  - API Key should be at least 32 characters');
        console.error('  - Use randomly generated strings: openssl rand -hex 16');
        console.error('  - Never use default values or simple strings\n');
        process.exit(1);
      }

      // 警告使用默认/简单 Key
      const dangerousKeys = ['eket-dev-key', 'dev-key', 'test-key', 'changeme', '123456'];
      if (dangerousKeys.includes(apiKey.toLowerCase()) || apiKey.length < 16) {
        logWarning('API Key is too simple', [
          'Generate a secure key: openssl rand -hex 16',
          "Or use: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        ]);
      }

      const spinner = ora('Starting API Gateway...').start();
      console.log('\n=== OpenCLAW API Gateway ===\n');

      const gateway = new OpenCLAWGateway({
        port,
        host,
        apiKey,
        projectRoot,
      });

      try {
        await gateway.start();
        spinner.succeed('API Gateway started');
        console.log(`\n🌐 Gateway URL: http://${host}:${port}`);
        console.log('\nAPI Endpoints:');
        console.log('  POST/GET /api/v1/workflow - Workflow management');
        console.log('  POST/GET /api/v1/task     - Task management');
        console.log('  POST/GET /api/v1/agent    - Agent management');
        console.log('  GET  /api/v1/memory       - Memory query');
        console.log('  GET  /health              - Health check');
        console.log('\nPress Ctrl+C to stop...\n');

        // 等待退出信号
        process.on('SIGINT', async () => {
          console.log('\n🛑  Shutting down gateway...');
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          process.exit(0);
        });

        // 保持进程运行
        setInterval(() => {}, 1000);
      } catch (err) {
        spinner.fail('Gateway start failed');
        printError({
          code: 'GATEWAY_START_FAILED',
          message: err instanceof Error ? err.message : 'Failed to start gateway',
          solutions: [
            'Check if port is already in use',
            'Verify project root path exists',
            'Check OPENCLAW_API_KEY environment variable',
          ],
        });
        process.exit(1);
      }
    });

  // ============================================================================
  // Workflow Template Commands (TASK-030: CrewAI Flows inspired)
  // ============================================================================

  program
    .command('workflow:list')
    .description('List available workflow templates')
    .action(() => {
      console.log('\nAvailable workflow templates:\n');
      Object.entries(WORKFLOW_TEMPLATES).forEach(([key, tpl]) => {
        console.log(`  ${key.padEnd(20)} ${tpl.description}`);
      });
      console.log('');
    });

  program
    .command('workflow:start <template>')
    .description('Start a workflow from a template (FEATURE_DEV | PARALLEL_REVIEW | BUG_FIX)')
    .option('--ticket <id>', 'Associated ticket ID')
    .action((template: string, opts: { ticket?: string }) => {
      const tpl = getWorkflowTemplate(template as WorkflowTemplateName);
      if (!tpl) {
        console.error(`Unknown template: ${template}. Run workflow:list to see options.`);
        process.exit(1);
      }
      console.log(`Starting workflow: ${tpl.name}`);
      console.log(`Ticket: ${opts.ticket ?? 'none'}`);
      console.log(`Steps: ${tpl.steps.map((s) => s.id).join(' → ')}`);
    });

  // ============================================================================
  // Shell Completion Command (TASK-002: CLI 体验优化)
  // ============================================================================

  registerCompletion(program);

  // 解析命令行
  await program.parseAsync(process.argv);
}

// ============================================================================
// 初始化运维就绪性模块
// ============================================================================

/**
 * 初始化日志系统
 */
function initLoggerSystem(): void {
  const logLevel = (process.env.EKET_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
  const logFile = process.env.EKET_LOG_FILE !== 'false';
  const logConsole = process.env.EKET_LOG_CONSOLE !== 'false';
  const logDir = process.env.EKET_LOG_DIR || './logs';

  initLogger({
    minLevel: logLevel,
    console: logConsole,
    file: logFile,
    logDir,
    filePrefix: 'eket',
    includeLocation: logLevel === 'debug',
    defaultComponent: 'cli',
  });

  logger.info('Logger initialized', { level: logLevel, dir: logDir });
}

/**
 * 初始化内存监控
 */
function initMemoryMonitor(): void {
  const warningThreshold = parseFloat(process.env.EKET_MEMORY_WARNING_THRESHOLD || '0.75');
  const criticalThreshold = parseFloat(process.env.EKET_MEMORY_CRITICAL_THRESHOLD || '0.90');
  const checkInterval = parseInt(process.env.EKET_MEMORY_CHECK_INTERVAL || '60000', 10);
  const enableGC = process.env.EKET_MEMORY_ENABLE_GC !== 'false';

  const monitor = startGlobalMemoryMonitoring({
    warningThreshold,
    criticalThreshold,
    checkInterval,
    enableGC,
    gcThreshold: 0.85,
    historySize: 60,
  });

  // 监听告警事件
  monitor.on('alert', (alert) => {
    logger.warn('Memory alert', {
      level: alert.level,
      usagePercent: alert.usagePercent,
      threshold: alert.threshold,
    });
  });

  // 监听 GC 事件
  monitor.on('gc', ({ before, after }) => {
    const freedMB = Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024);
    logger.info('GC completed', { freedMB });
  });

  logger.info('Memory monitor initialized', {
    warningThreshold,
    criticalThreshold,
    checkInterval,
    enableGC,
  });
}

/**
 * 初始化优雅关闭处理器
 */
function initGracefulShutdown(): void {
  const timeout = parseInt(process.env.EKET_SHUTDOWN_TIMEOUT || '30000', 10);

  setupProcessHandlers({
    timeout,
    verbose: true,
  });

  logger.info('Graceful shutdown handler initialized', { timeout });
}

// ============================================================================
// 主程序启动
// ============================================================================

// 初始化运维模块
initLoggerSystem();
initMemoryMonitor();
initGracefulShutdown();

logger.info('EKET Framework CLI starting', { version: '2.0.0' });

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException').then(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  // 不立即退出，让当前操作完成
});

// 执行主程序
main().catch((error) => {
  logger.error('CLI startup failed', error);
  process.exit(1);
});
