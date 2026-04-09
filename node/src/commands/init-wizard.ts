/**
 * Project Initialization Wizard
 * 用于收集项目配置信息
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { withProgress } from '../utils/progress.js';

interface GitRepoConfig {
  url: string;
  username?: string;
  token?: string;
  branch: string;
}

interface RedisConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
}

interface SQLiteConfig {
  enabled: boolean;
  path: string;
}

interface ProjectConfig {
  projectName: string;
  organization: string;
  confluence: GitRepoConfig;
  jira: GitRepoConfig;
  codeRepo: GitRepoConfig;
  redis: RedisConfig;
  sqlite: SQLiteConfig;
}

/**
 * 创建 readline 接口
 */
function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * 提示用户输入
 */
async function prompt(
  rl: readline.Interface,
  question: string,
  defaultValue?: string
): Promise<string> {
  const defaultText = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${defaultText}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * 确认提示
 */
async function confirm(
  rl: readline.Interface,
  question: string,
  defaultValue = true
): Promise<boolean> {
  const defaultText = defaultValue ? 'Y/n' : 'y/N';
  return new Promise((resolve) => {
    rl.question(`${question} [${defaultText}]: `, (answer) => {
      const lower = answer.toLowerCase().trim();
      if (lower === '') {
        resolve(defaultValue);
      } else if (lower === 'y' || lower === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * 密码输入（隐藏）
 */
async function promptPassword(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    // 注意：readline 不支持真正的密码隐藏，这里只是提示用户
    console.log('\n* 敏感信息将被保存到 .eket/config.yml，请确保该文件不被提交到 Git');
    rl.question(`${question}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Git 仓库配置
 */
async function configureGitRepo(
  rl: readline.Interface,
  name: string,
  description: string
): Promise<GitRepoConfig> {
  console.log(`\n=== 配置 ${description} ===`);

  const url = await prompt(rl, `${name} Git 仓库 URL`);
  if (!url) {
    console.log('跳过（留空表示稍后配置）');
    return { url: '', branch: 'main' };
  }

  const branch = await prompt(rl, '默认分支名', 'main');

  // 询问认证方式
  const useAuth = await confirm(rl, '需要认证吗？', true);
  let username: string | undefined;
  let token: string | undefined;

  if (useAuth) {
    username = await prompt(rl, '用户名');
    token = await promptPassword(rl, 'Access Token / Password');
  }

  return { url, username, token, branch };
}

/**
 * Redis 配置
 */
async function configureRedis(rl: readline.Interface): Promise<RedisConfig> {
  console.log('\n=== 配置 Redis（可选）===');
  console.log('Redis 用于 Slaver 心跳监控和消息队列');

  const enabled = await confirm(rl, '启用 Redis 吗？', false);
  if (!enabled) {
    return { enabled: false, host: '', port: 6379, db: 0 };
  }

  const host = await prompt(rl, 'Redis 主机', 'localhost');
  const portStr = await prompt(rl, 'Redis 端口', '6379');
  const port = parseInt(portStr, 10) || 6379;

  const usePassword = await confirm(rl, '需要密码吗？', false);
  let password: string | undefined;
  if (usePassword) {
    password = await promptPassword(rl, 'Redis 密码');
  }

  const dbStr = await prompt(rl, 'Redis 数据库编号', '0');
  const db = parseInt(dbStr, 10) || 0;

  return { enabled, host, port, password, db };
}

/**
 * SQLite 配置
 */
async function configureSQLite(rl: readline.Interface, projectRoot: string): Promise<SQLiteConfig> {
  console.log('\n=== 配置 SQLite（可选）===');
  console.log('SQLite 用于 Retrospective 数据持久化');

  const enabled = await confirm(rl, '启用 SQLite 吗？', true);
  if (!enabled) {
    return { enabled: false, path: '' };
  }

  const defaultPath = path.join(projectRoot, '.eket', 'data', 'sqlite', 'eket.db');
  const customPath = await prompt(rl, 'SQLite 数据库路径', defaultPath);

  return { enabled, path: customPath };
}

/**
 * 生成 config.yml
 */
function generateConfigYaml(config: ProjectConfig): string {
  const lines = [
    `# EKET Project Configuration`,
    `# 项目：${config.projectName}`,
    `# 组织：${config.organization}`,
    `# 生成时间：${new Date().toISOString()}`,
    ``,
    `project:`,
    `  name: "${config.projectName}"`,
    `  organization: "${config.organization}"`,
    ``,
    `# Git 仓库配置`,
    `repositories:`,
  ];

  // Confluence
  lines.push(`  confluence:`);
  lines.push(`    url: "${config.confluence.url}"`);
  lines.push(`    branch: "${config.confluence.branch}"`);
  if (config.confluence.username) {
    lines.push(`    username: "${config.confluence.username}"`);
  }
  if (config.confluence.token) {
    lines.push(`    token: "${config.confluence.token}"`);
  }

  // Jira
  lines.push(`  jira:`);
  lines.push(`    url: "${config.jira.url}"`);
  lines.push(`    branch: "${config.jira.branch}"`);
  if (config.jira.username) {
    lines.push(`    username: "${config.jira.username}"`);
  }
  if (config.jira.token) {
    lines.push(`    token: "${config.jira.token}"`);
  }

  // Code Repo
  lines.push(`  code_repo:`);
  lines.push(`    url: "${config.codeRepo.url}"`);
  lines.push(`    branch: "${config.codeRepo.branch}"`);
  if (config.codeRepo.username) {
    lines.push(`    username: "${config.codeRepo.username}"`);
  }
  if (config.codeRepo.token) {
    lines.push(`    token: "${config.codeRepo.token}"`);
  }

  // Redis
  lines.push(``);
  lines.push(`# Redis 配置（可选）`);
  lines.push(`redis:`);
  lines.push(`  enabled: ${config.redis.enabled}`);
  if (config.redis.enabled) {
    lines.push(`  host: "${config.redis.host}"`);
    lines.push(`  port: ${config.redis.port}`);
    if (config.redis.password) {
      lines.push(`  password: "${config.redis.password}"`);
    }
    lines.push(`  db: ${config.redis.db}`);
  }

  // SQLite
  lines.push(``);
  lines.push(`# SQLite 配置（可选）`);
  lines.push(`sqlite:`);
  lines.push(`  enabled: ${config.sqlite.enabled}`);
  if (config.sqlite.enabled) {
    lines.push(`  path: "${config.sqlite.path}"`);
  }

  // Agent 角色配置
  lines.push(``);
  lines.push(`# Agent 角色配置`);
  lines.push(`agent_roles:`);
  lines.push(`  - frontend_dev`);
  lines.push(`  - backend_dev`);
  lines.push(`  - qa_engineer`);
  lines.push(`  - devops_engineer`);

  // 任务状态机配置
  lines.push(``);
  lines.push(`# 任务类型与执行状态映射`);
  lines.push(`task_types:`);
  lines.push(`  - name: "feature"`);
  lines.push(`    execution_states: ["dev", "test", "review"]`);
  lines.push(`  - name: "bugfix"`);
  lines.push(`    execution_states: ["fix", "verify"]`);
  lines.push(`  - name: "deployment"`);
  lines.push(`    execution_states: ["dry_run", "verification", "production"]`);

  return lines.join('\n');
}

/**
 * 生成 .gitignore
 */
function generateGitignore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entries = [
    `# EKET`,
    `.eket/config.yml`,
    `.eket/state/`,
    `.eket/logs/`,
    `.eket/data/`,
    ``,
    `# 系统文件`,
    `.DS_Store`,
    `Thumbs.db`,
  ];

  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8');
    const missing = entries.filter((e) => !existing.includes(e));
    if (missing.length > 0) {
      fs.appendFileSync(gitignorePath, '\n' + missing.join('\n'));
    }
  } else {
    fs.writeFileSync(gitignorePath, entries.join('\n'));
  }
}

/**
 * 初始化向导主函数
 *
 * Phase 1: 最小配置（3 项）
 *   - 项目名称
 *   - 代码仓库 URL
 *   - 默认分支
 *
 * Phase 2: 可选增强配置
 *   - Confluence/Jira 仓库
 *   - Redis 配置
 *   - SQLite 配置
 */
export async function runInitWizard(projectRoot?: string): Promise<ProjectConfig | null> {
  const rl = createRL();

  try {
    console.log('\n========================================');
    console.log('  EKET 项目初始化向导 v2.0.0');
    console.log('========================================\n');

    // 确定项目根目录
    if (!projectRoot) {
      projectRoot = process.cwd();
    }

    // ========================================================================
    // Phase 1: 最小配置（必需）
    // ========================================================================
    console.log('>>> Phase 1: 最小配置（必需）\n');
    console.log('这些配置是项目运行的最基本要求。\n');

    // 1.1 项目名称
    console.log('--- 步骤 1/3: 项目基本信息 ---');
    const projectName = await prompt(rl, '项目名称', path.basename(projectRoot));
    const organization = await prompt(rl, '组织名称', 'my-org');

    // 1.2 代码仓库配置
    console.log('\n--- 步骤 2/3: 代码仓库配置 ---');
    console.log('代码仓库是项目的主要工作区。\n');
    const codeRepoUrl = await prompt(rl, '代码仓库 Git URL');
    const codeRepoBranch = await prompt(rl, '默认分支名', 'main');

    const codeRepo: GitRepoConfig = codeRepoUrl
      ? {
          url: codeRepoUrl,
          branch: codeRepoBranch,
        }
      : { url: '', branch: 'main' };

    // 1.3 确认是否继续
    console.log('\n--- 步骤 3/3: 确认配置 ---');
    console.log(`项目：${projectName}`);
    console.log(`组织：${organization}`);
    console.log(`代码仓库：${codeRepo.url || '未配置'}`);
    console.log(`分支：${codeRepo.branch}`);

    const continueConfig = await confirm(rl, '\n保存基本配置并继续增强配置吗？', true);
    if (!continueConfig) {
      console.log('配置已取消');
      return null;
    }

    // ========================================================================
    // Phase 2: 可选增强配置
    // ========================================================================
    console.log('\n>>> Phase 2: 可选增强配置\n');
    console.log('这些配置用于增强功能，可以稍后配置。\n');

    // 2.1 Confluence 仓库（可选）
    console.log('--- Confluence 文档仓库（可选）---');
    const setupConfluence = await confirm(rl, '配置 Confluence 文档仓库吗？', false);
    const confluence = setupConfluence
      ? await configureGitRepo(rl, 'Confluence', '文档仓库')
      : { url: '', branch: 'main' };

    // 2.2 Jira 仓库（可选）
    console.log('\n--- Jira 任务管理仓库（可选）---');
    const setupJira = await confirm(rl, '配置 Jira 任务管理仓库吗？', false);
    const jira = setupJira
      ? await configureGitRepo(rl, 'Jira', '任务管理仓库')
      : { url: '', branch: 'main' };

    // 2.3 Redis 配置（可选）
    console.log('\n--- Redis 配置（可选）---');
    console.log('Redis 用于 Slaver 心跳监控和消息队列。\n');
    const redis = await configureRedis(rl);

    // 2.4 SQLite 配置（可选）
    console.log('\n--- SQLite 配置（可选）---');
    console.log('SQLite 用于 Retrospective 数据持久化。\n');
    const sqlite = await configureSQLite(rl, projectRoot);

    // 汇总配置
    const config: ProjectConfig = {
      projectName,
      organization,
      confluence,
      jira,
      codeRepo,
      redis,
      sqlite,
    };

    // 显示配置摘要
    console.log('\n========================================');
    console.log('  配置摘要');
    console.log('========================================\n');
    console.log(`项目：${projectName}`);
    console.log(`组织：${organization}`);
    console.log(`Confluence: ${confluence.url || '未配置'}`);
    console.log(`Jira: ${jira.url || '未配置'}`);
    console.log(`CodeRepo: ${codeRepo.url || '未配置'}`);
    console.log(`Redis: ${redis.enabled ? `${redis.host}:${redis.port}` : '未启用'}`);
    console.log(`SQLite: ${sqlite.enabled ? sqlite.path : '未启用'}`);

    // 确认保存
    const confirmed = await confirm(rl, '\n保存配置吗？', true);
    if (!confirmed) {
      console.log('配置已取消');
      return null;
    }

    // 保存配置
    const configDir = path.join(projectRoot, '.eket', 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const configPath = path.join(configDir, 'config.yml');

    // 使用进度条保存配置
    await withProgress(
      async (bar) => {
        bar.increment();
        fs.writeFileSync(configPath, generateConfigYaml(config));
        console.log(`\n✓ 配置已保存：${configPath}`);

        bar.increment();
        if (projectRoot) {
          generateGitignore(projectRoot);
          console.log('✓ .gitignore 已更新');

          // 创建必要的目录
          const dirs = [
            '.eket/state',
            '.eket/logs',
            '.eket/data/queue',
            '.eket/data/sqlite',
            '.eket/worktrees',
            'confluence',
            'jira',
            'code_repo',
          ];

          let created = 0;
          for (const dir of dirs) {
            const fullPath = path.join(projectRoot, dir);
            if (!fs.existsSync(fullPath)) {
              fs.mkdirSync(fullPath, { recursive: true });
              // 创建 .gitkeep
              const gitkeepPath = path.join(fullPath, '.gitkeep');
              if (!fs.existsSync(gitkeepPath)) {
                fs.writeFileSync(gitkeepPath, '');
              }
              created++;
            }
            bar.increment();
          }
          console.log(`✓ 目录结构已创建 (${created} 个目录)`);
        }
      },
      { total: 10, name: 'Initializing project' }
    );

    console.log('\n========================================');
    console.log('  初始化完成！');
    console.log('========================================\n');
    console.log('下一步:');
    console.log('  1. 配置 Redis（如已启用）：');
    if (redis.enabled) {
      console.log(`     export EKET_REDIS_HOST=${redis.host}`);
      console.log(`     export EKET_REDIS_PORT=${redis.port}`);
    }
    console.log('  2. 克隆 Git 仓库：');
    console.log('     ./scripts/init-three-repos.sh');
    console.log('  3. 启动 Agent 实例：');
    console.log('     /eket-start\n');

    return config;
  } catch {
    console.error('初始化失败');
    return null;
  } finally {
    rl.close();
  }
}
