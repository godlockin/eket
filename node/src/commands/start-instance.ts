/**
 * EKET Framework - Instance Start Command
 * Version: 0.7.2
 *
 * 支持人类和 AI Instance 的初始化流程
 * - Master 检测与初始化
 * - 人类 Slaver 初始化（用户指定角色）
 * - AI Slaver 初始化（自动选择角色）
 */

import * as fs from 'fs';
import * as path from 'path';

import { createMasterElection, type MasterElection } from '../core/master-election.js';
import { createRedisClient } from '../core/redis-client.js';
import { loadMindset, buildMasterContext, buildSlaverContext, injectSystemPrompt } from '../core/mindset-loader.js';
import { EketError, EketErrorCode, Result } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export type InstanceType = 'master' | 'slaver';
export type SlaverMode = 'human' | 'ai-auto' | 'ai-manual';

export interface InstanceConfig {
  instanceType: InstanceType;
  slaverMode?: SlaverMode;
  role?: string;
  autoMode: boolean;
  projectRoot: string;
}

export interface MasterMarker {
  exists: boolean;
  path?: string;
  content?: string;
}

export interface ThreeReposState {
  confluence: { exists: boolean; hasContent: boolean };
  jira: { exists: boolean; hasContent: boolean };
  codeRepo: { exists: boolean; hasContent: boolean };
}

// ============================================================================
// Constants
// ============================================================================

const MASTER_MARKER_FILE = '.eket_master_marker';
const STATE_DIR = '.eket/state';
const CONFIG_FILE = 'instance_config.yml';

// Available agent roles
const AVAILABLE_ROLES = {
  coordinators: ['product_manager', 'architect', 'tech_manager', 'doc_monitor'],
  executors: [
    'frontend_dev',
    'backend_dev',
    'qa_engineer',
    'devops_engineer',
    'designer',
    'tester',
    'fullstack',
  ],
};

// ============================================================================
// Master Detection
// ============================================================================

/**
 * 检查 Master 标记是否存在
 */
export async function checkMasterMarker(projectRoot: string): Promise<Result<MasterMarker>> {
  try {
    const possiblePaths = [
      path.join(projectRoot, 'confluence', MASTER_MARKER_FILE),
      path.join(projectRoot, 'jira', MASTER_MARKER_FILE),
      path.join(projectRoot, 'code_repo', MASTER_MARKER_FILE),
      path.join(projectRoot, 'src', MASTER_MARKER_FILE),
      path.join(projectRoot, MASTER_MARKER_FILE),
    ];

    for (const markerPath of possiblePaths) {
      if (fs.existsSync(markerPath)) {
        const content = fs.readFileSync(markerPath, 'utf-8');
        return {
          success: true,
          data: {
            exists: true,
            path: markerPath,
            content,
          },
        };
      }
    }

    return {
      success: true,
      data: { exists: false },
    };
  } catch (error) {
    return {
      success: false,
      error: new EketError(
        'MASTER_CHECK_FAILED',
        `Failed to check master marker: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}

/**
 * 检查三仓库状态
 */
export function checkThreeReposState(projectRoot: string): Result<ThreeReposState> {
  try {
    const checkRepo = (repoName: string, alternatives: string[] = []) => {
      let repoPath = path.join(projectRoot, repoName);
      let exists = fs.existsSync(repoPath);

      // 检查备选路径
      if (!exists && alternatives.length > 0) {
        for (const alt of alternatives) {
          const altPath = path.join(projectRoot, alt);
          if (fs.existsSync(altPath)) {
            repoPath = altPath;
            exists = true;
            break;
          }
        }
      }

      let hasContent = false;
      if (exists) {
        try {
          const files = fs.readdirSync(repoPath, { withFileTypes: true });
          hasContent = files.some(
            (f) =>
              f.isFile() &&
              (f.name.endsWith('.md') || f.name.endsWith('.ts') || f.name.endsWith('.js'))
          );
        } catch {
          hasContent = false;
        }
      }

      return { exists, hasContent };
    };

    const state: ThreeReposState = {
      confluence: checkRepo('confluence'),
      jira: checkRepo('jira'),
      codeRepo: checkRepo('code_repo', ['src']),
    };

    return { success: true, data: state };
  } catch (error) {
    return {
      success: false,
      error: new EketError(
        'REPO_STATE_CHECK_FAILED',
        `Failed to check repos state: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}

/**
 * 决定实例角色
 */
export function decideInstanceRole(
  masterExists: boolean,
  reposState: ThreeReposState,
  humanMode: boolean,
  specifiedRole?: string
): Result<InstanceType> {
  // 如果用户明确指定了人类模式且有角色，优先使用用户指定
  if (humanMode && specifiedRole) {
    return { success: true, data: 'slaver' };
  }

  // 没有 Master 且仓库未初始化 → Master
  if (
    !masterExists &&
    (!reposState.confluence.exists || !reposState.jira.exists || !reposState.codeRepo.exists)
  ) {
    return { success: true, data: 'master' };
  }

  // 已有 Master → Slaver
  if (masterExists) {
    return { success: true, data: 'slaver' };
  }

  // 仓库已初始化但没有 Master 标记 → 当前实例成为 Master
  if (reposState.confluence.exists && reposState.jira.exists && reposState.codeRepo.exists) {
    return { success: true, data: 'master' };
  }

  // 默认成为 Slaver
  return { success: true, data: 'slaver' };
}

// ============================================================================
// Master Initialization
// ============================================================================

/**
 * 创建 Master 标记
 */
export function createMasterMarker(
  projectRoot: string,
  instanceType: InstanceType
): Result<string> {
  try {
    const timestamp = new Date().toISOString();
    const markerContent = `initialized_by: ${instanceType}\nmaster_instance: true\ninitialized_at: ${timestamp}\n`;

    // 优先在 confluence 创建标记
    const markerPath = path.join(projectRoot, 'confluence', MASTER_MARKER_FILE);

    if (fs.existsSync(markerPath)) {
      return {
        success: false,
        error: new EketError(EketErrorCode.MASTER_ALREADY_EXISTS, 'Master marker already exists'),
      };
    }

    fs.writeFileSync(markerPath, markerContent, 'utf-8');

    return { success: true, data: markerPath };
  } catch (error) {
    return {
      success: false,
      error: new EketError(
        'CREATE_MASTER_MARKER_FAILED',
        `Failed to create master marker: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}

/**
 * 初始化 Master 目录结构
 */
export function initializeMasterDirectories(projectRoot: string): Result<string[]> {
  try {
    const createdDirs: string[] = [];

    // Confluence 目录
    const confluenceDirs = [
      'confluence/projects',
      'confluence/memory/best-practices',
      'confluence/templates',
    ];
    for (const dir of confluenceDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        createdDirs.push(dir);
        // 创建 .gitkeep
        fs.writeFileSync(path.join(fullPath, '.gitkeep'), '');
      }
    }

    // Jira 目录
    const jiraDirs = [
      'jira/epics',
      'jira/tickets/feature',
      'jira/tickets/bugfix',
      'jira/tickets/task',
      'jira/state',
    ];
    for (const dir of jiraDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        createdDirs.push(dir);
        fs.writeFileSync(path.join(fullPath, '.gitkeep'), '');
      }
    }

    // Code Repo 目录
    const codeDirs = [
      'code_repo/src',
      'code_repo/tests',
      'code_repo/configs',
      'code_repo/deployments',
    ];
    for (const dir of codeDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        createdDirs.push(dir);
        fs.writeFileSync(path.join(fullPath, '.gitkeep'), '');
      }
    }

    return { success: true, data: createdDirs };
  } catch (error) {
    return {
      success: false,
      error: new EketError(
        'INIT_DIRECTORIES_FAILED',
        `Failed to initialize directories: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}

// ============================================================================
// Slaver Initialization
// ============================================================================

/**
 * 初始化 Slaver 实例配置
 */
export function initializeSlaverConfig(
  projectRoot: string,
  slaverMode: SlaverMode,
  role?: string
): Result<string> {
  try {
    const stateDir = path.join(projectRoot, STATE_DIR);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const configPath = path.join(stateDir, CONFIG_FILE);
    const timestamp = new Date().toISOString();

    const configContent = `# EKET Slaver Instance Configuration
# Generated at: ${timestamp}

# 实例角色
role: "slaver"

# Slaver 模式
slaver_mode: "${slaverMode}"

# Agent 角色类型（人类模式时需指定）
agent_type: ${role ? `"${role}"` : 'null'}

# 实例状态
status: "initializing"

# 运行模式
auto_mode: ${slaverMode === 'ai-auto'}

# 工作区配置
workspace:
  confluence_initialized: true
  jira_initialized: true
  code_repo_initialized: true
`;

    fs.writeFileSync(configPath, configContent, 'utf-8');
    return { success: true, data: configPath };
  } catch (error) {
    return {
      success: false,
      error: new EketError(
        'INIT_SLAVER_CONFIG_FAILED',
        `Failed to initialize slaver config: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}

/**
 * 注册 Slaver 到 Redis（如果可用）
 */
export async function registerSlaverWithRedis(
  _projectRoot: string,
  slaverId: string,
  role?: string
): Promise<Result<void>> {
  try {
    const redisConfig = parseRedisConfigFromEnv();
    if (!redisConfig) {
      return {
        success: false,
        error: new EketError(EketErrorCode.REDIS_NOT_CONFIGURED, 'Redis not configured in environment'),
      };
    }

    const client = createRedisClient();
    const connectResult = await client.connect();

    if (!connectResult.success) {
      return { success: false, error: connectResult.error };
    }

    const heartbeat = {
      slaverId,
      timestamp: Date.now(),
      status: 'active' as const,
      currentTaskId: undefined,
      role: role || 'unknown',
    };

    const registerResult = await client.registerSlaver(heartbeat);
    await client.disconnect();

    return registerResult;
  } catch (error) {
    return {
      success: false,
      error: new EketError(
        'REDIS_REGISTRATION_FAILED',
        `Failed to register slaver: ${error instanceof Error ? error.message : 'Unknown error'}`
      ),
    };
  }
}

// ============================================================================
// Instance Start Command
// ============================================================================

export interface StartInstanceOptions {
  human?: boolean;
  role?: string;
  auto?: boolean;
  projectRoot?: string;
}

/**
 * 启动 Instance 主函数（v0.9.1 - 使用 Master 选举机制）
 */
export async function startInstance(
  options: StartInstanceOptions = {}
): Promise<Result<InstanceConfig>> {
  const projectRoot = options.projectRoot || process.cwd();

  console.log('========================================');
  console.log('EKET Instance Start v0.9.1');
  console.log('========================================\n');

  // Step 1: 使用 Master 选举机制代替简单的文件检测
  console.log('## Step 1: Running Master election...');

  // 从环境变量读取 Redis 配置
  const redisConfig = process.env.EKET_REDIS_HOST
    ? {
        host: process.env.EKET_REDIS_HOST,
        port: parseInt(process.env.EKET_REDIS_PORT || '6379', 10),
        password: process.env.EKET_REDIS_PASSWORD,
      }
    : undefined;

  const election = createMasterElection({
    redis: redisConfig,
    projectRoot,
    electionTimeout: 5000,
    declarationPeriod: 2000,
    leaseTime: 30000,
  });

  const electionResult = await election.elect();

  if (!electionResult.success) {
    console.error(`Master election failed: ${electionResult.error.message}`);
    return { success: false, error: electionResult.error };
  }

  const result = electionResult.data;
  console.log(
    `Election result: ${result.isMaster ? 'MASTER' : 'SLAVER'} (level: ${result.electionLevel})`
  );

  if (result.conflictDetected) {
    console.log(`Another master detected: ${result.masterId}`);
  }
  console.log();

  // Step 2: 检查三仓库状态
  console.log('## Step 2: Checking three repos state...');
  const reposResult = checkThreeReposState(projectRoot);

  if (!reposResult.success) {
    console.error(`Repos check failed: ${reposResult.error.message}`);
    return { success: false, error: reposResult.error };
  }

  const reposState = reposResult.data;
  console.log(`Confluence: ${reposState.confluence.exists ? 'exists' : 'missing'}`);
  console.log(`Jira: ${reposState.jira.exists ? 'exists' : 'missing'}`);
  console.log(`CodeRepo: ${reposState.codeRepo.exists ? 'exists' : 'missing'}`);
  console.log();

  // Step 3: 决定实例角色（使用选举结果）
  console.log('## Step 3: Determining instance role from election...');
  const instanceType: InstanceType = result.isMaster ? 'master' : 'slaver';
  console.log(`Instance type: ${instanceType.toUpperCase()}`);
  console.log();

  // Step 4: 执行对应初始化逻辑
  console.log(`## Step 4: Initializing ${instanceType} instance...`);

  if (instanceType === 'master') {
    // Master 初始化
    const initResult = await initializeMasterInstance(projectRoot, election);
    if (!initResult.success) {
      console.error(`Master initialization failed: ${initResult.error.message}`);
      return { success: false, error: initResult.error };
    }

    console.log('Master instance initialized successfully!');
    console.log('\nMaster responsibilities:');
    console.log('  - Requirements analysis');
    console.log('  - Task decomposition');
    console.log('  - Progress checking');
    console.log('  - Code review');
    console.log('  - Merge to main branch');
  } else {
    // Slaver 初始化
    const slaverMode: SlaverMode = options.human ? 'human' : options.auto ? 'ai-auto' : 'ai-manual';
    const slaverResult = await initializeSlaverInstance(projectRoot, slaverMode, options.role);

    if (!slaverResult.success) {
      console.error(`Slaver initialization failed: ${slaverResult.error.message}`);
      return { success: false, error: slaverResult.error };
    }

    console.log(`Slaver instance initialized successfully!`);
    console.log(`Mode: ${slaverMode}`);
    if (options.role) {
      console.log(`Role: ${options.role}`);
    }
  }

  console.log();
  console.log('========================================');
  console.log('Instance start completed!');
  console.log('========================================');

  // Build final config
  const config: InstanceConfig = {
    instanceType,
    slaverMode:
      instanceType === 'slaver'
        ? options.human
          ? 'human'
          : options.auto
            ? 'ai-auto'
            : 'ai-manual'
        : undefined,
    role: options.role,
    autoMode: options.auto || false,
    projectRoot,
  };

  return { success: true, data: config };
}

/**
 * 初始化 Master 实例
 */
async function initializeMasterInstance(
  projectRoot: string,
  election: MasterElection
): Promise<Result<void>> {
  // 创建目录结构
  const dirsResult = initializeMasterDirectories(projectRoot);
  if (!dirsResult.success) {
    return { success: false, error: dirsResult.error };
  }

  if (dirsResult.data.length > 0) {
    console.log(`Created directories: ${dirsResult.data.join(', ')}`);
  }

  // Master marker 已由选举机制创建

  // 创建 state 目录
  const stateDir = path.join(projectRoot, STATE_DIR);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  // 创建 Master 配置文件
  const configPath = path.join(stateDir, CONFIG_FILE);
  const configContent = `# EKET Master Instance Configuration
# Generated at: ${new Date().toISOString()}

role: "master"
status: "ready"
instance_id: ${election.getInstanceId()}

workspace:
  confluence_initialized: true
  jira_initialized: true
  code_repo_initialized: true

auto_mode: false
`;
  fs.writeFileSync(configPath, configContent, 'utf-8');

  // 加载并注入 Master 思维模板 (新增)
  const context = buildMasterContext();
  const mindset = await loadMindset('master', context);
  if (mindset) {
    console.log('## Master mindset loaded');
    injectSystemPrompt(mindset);
  }

  return { success: true, data: undefined };
}

/**
 * 初始化 Slaver 实例
 */
async function initializeSlaverInstance(
  projectRoot: string,
  slaverMode: SlaverMode,
  role?: string
): Promise<Result<void>> {
  // 初始化配置文件
  const configResult = initializeSlaverConfig(projectRoot, slaverMode, role);
  if (!configResult.success) {
    return { success: false, error: configResult.error };
  }

  console.log(`Slaver config saved: ${configResult.data}`);

  // 如果指定了角色，尝试注册到 Redis
  if (role) {
    const hostname = process.env.HOSTNAME || 'unknown';
    const pid = process.pid;
    const slaverId = `slaver_${role}_${hostname}_${pid}`;

    const registerResult = await registerSlaverWithRedis(projectRoot, slaverId, role);
    if (registerResult.success) {
      console.log(`Slaver registered with Redis: ${slaverId}`);
    }
  }

  // 加载并注入 Slaver 思维模板 (新增)
  const context = buildSlaverContext(role);
  const mindset = await loadMindset('slaver', context);
  if (mindset) {
    console.log('## Slaver mindset loaded');
    injectSystemPrompt(mindset);
  }

  return { success: true, data: undefined };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * 从环境变量解析 Redis 配置
 */
function parseRedisConfigFromEnv(): { host: string; port: number; password?: string } | null {
  const host = process.env.EKET_REDIS_HOST || process.env.REDIS_HOST;
  const port = parseInt(process.env.EKET_REDIS_PORT || process.env.REDIS_PORT || '6379', 10);

  if (!host) {
    return null;
  }

  return {
    host,
    port,
    password: process.env.EKET_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
  };
}

/**
 * 列出可用角色
 */
export function listAvailableRoles(): void {
  console.log('\nAvailable Coordinator Roles:');
  for (const role of AVAILABLE_ROLES.coordinators) {
    console.log(`  - ${role}`);
  }
  console.log('\nAvailable Executor Roles:');
  for (const role of AVAILABLE_ROLES.executors) {
    console.log(`  - ${role}`);
  }
  console.log();
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * CLI 入口函数
 */
export async function runStartInstance(args: string[]): Promise<void> {
  const options: StartInstanceOptions = {
    projectRoot: process.cwd(),
  };

  // 解析参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--human' || arg === '-h') {
      options.human = true;
    } else if (arg === '--auto' || arg === '-a') {
      options.auto = true;
    } else if (arg === '--role' || arg === '-r') {
      options.role = args[++i];
    } else if (arg === '--project-root' || arg === '-p') {
      options.projectRoot = args[++i];
    } else if (arg === '--help' || arg === '--list-roles') {
      listAvailableRoles();
      process.exit(0);
    }
  }

  // 人类模式必须指定角色
  if (options.human && !options.role) {
    console.error('Error: --role is required when using --human mode');
    console.error('\nAvailable roles:');
    listAvailableRoles();
    process.exit(1);
  }

  const result = await startInstance(options);

  if (!result.success) {
    console.error(`Instance start failed: ${result.error.message}`);
    process.exit(1);
  }

  console.log('\nInstance started successfully!');
}
