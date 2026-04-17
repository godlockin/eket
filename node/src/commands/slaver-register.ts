/**
 * Slaver Register Command
 *
 * Slaver 身份注册和任务识别
 * 版本：v2.1.4
 *
 * 功能：
 * 1. 注册 Slaver 身份
 * 2. 识别可领取的任务
 * 3. 检查当前任务状态
 * 4. 显示身份信息卡片
 * 5. 显示可用命令
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';
import ora from 'ora';

import { printError, logInfo } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

// Color codes
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

interface TicketInfo {
  ticketId: string;
  priority: string;
  role: string;
  status: string;
  assignee?: string;
  filePath: string;
}

interface SlaverStatus {
  instanceId: string;
  role: string;
  specialty: string;
  currentTask: string | null;
  currentTaskStatus: string;
}

/**
 * 获取当前实例信息
 */
function getInstanceInfo(): SlaverStatus {
  const stateDir = '.eket/state';
  const configPath = path.join(stateDir, 'instance_config.yml');

  let instanceId = 'unknown';
  let role = 'unknown';
  let specialty = 'none';

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const instanceIdMatch = content.match(/instance_id:\s*(\S+)/);
    const roleMatch = content.match(/role:\s*(\S+)/);
    const specialtyMatch = content.match(/specialty:\s*(\S+)/);

    if (instanceIdMatch) {instanceId = instanceIdMatch[1];}
    if (roleMatch) {role = roleMatch[1];}
    if (specialtyMatch) {specialty = specialtyMatch[1];}
  }

  // 检查当前任务
  const currentTaskFile = path.join(stateDir, 'current_task.yml');
  let currentTask: string | null = null;
  let currentTaskStatus = 'idle';

  if (fs.existsSync(currentTaskFile)) {
    const content = fs.readFileSync(currentTaskFile, 'utf-8');
    const taskIdMatch = content.match(/task_id:\s*(\S+)/);
    if (taskIdMatch) {
      currentTask = taskIdMatch[1];
      // 查找任务状态
      const jiraDir = 'jira/tickets';
      for (const dir of ['feature', 'bugfix', 'task', 'fix']) {
        const ticketPath = path.join(jiraDir, dir, `${currentTask}.md`);
        if (fs.existsSync(ticketPath)) {
          const ticketContent = fs.readFileSync(ticketPath, 'utf-8');
          const statusMatch = ticketContent.match(/^状态:\s*(\S+)/m);
          if (statusMatch) {
            currentTaskStatus = statusMatch[1];
          }
          break;
        }
      }
    }
  }

  return {
    instanceId,
    role,
    specialty,
    currentTask,
    currentTaskStatus,
  };
}

/**
 * 注册 Slaver 身份
 */
function registerSlaverIdentity(instanceId: string, specialty: string): string {
  const slaversDir = '.eket/state/slavers';
  fs.mkdirSync(slaversDir, { recursive: true });

  const markerFile = path.join(slaversDir, `${instanceId}.yml`);
  const now = new Date().toISOString();

  const content = `# Slaver 实例注册信息
# 更新于：${now}

instance_id: ${instanceId}
role: slaver
specialty: ${specialty}
status: active
registered_at: ${now}
last_heartbeat: ${now}

# 工作空间
worktree_dir: null
current_task: null

# 能力标签
skills: []
`;

  fs.writeFileSync(markerFile, content, 'utf-8');
  return markerFile;
}

/**
 * 扫描可领取的任务
 */
function scanReadyTasks(_specialty: string): TicketInfo[] {
  const jiraDir = 'jira/tickets';
  const readyTasks: TicketInfo[] = [];

  if (!fs.existsSync(jiraDir)) {
    return readyTasks;
  }

  for (const dir of ['feature', 'bugfix', 'task', 'fix']) {
    const typeDir = path.join(jiraDir, dir);
    if (!fs.existsSync(typeDir)) {continue;}

    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const ticketPath = path.join(typeDir, file);
      const content = fs.readFileSync(ticketPath, 'utf-8');

      const statusMatch = content.match(/^状态:\s*(\S+)/m);
      const priorityMatch = content.match(/^优先级:\s*(\S+)/m);
      const roleMatch = content.match(/^适配角色:\s*(\S+)/m);

      const status = statusMatch ? statusMatch[1] : 'unknown';

      if (status === 'ready') {
        const ticketId = file.replace('.md', '');
        const priority = priorityMatch ? priorityMatch[1] : 'P3';
        const role = roleMatch ? roleMatch[1] : '';

        readyTasks.push({
          ticketId,
          priority,
          role,
          status,
          filePath: ticketPath,
        });
      }
    }
  }

  // 按优先级排序
  const priorityOrder: Record<string, number> = { P0: 1, P1: 2, P2: 3, P3: 4 };
  readyTasks.sort((a, b) => {
    const aOrder = priorityOrder[a.priority] || 5;
    const bOrder = priorityOrder[b.priority] || 5;
    return aOrder - bOrder;
  });

  return readyTasks;
}

/**
 * 检查角色匹配
 */
function checkRoleMatch(ticketRole: string, specialty: string): boolean {
  if (!ticketRole || ticketRole === 'fullstack') {return true;}
  if (!specialty) {return true;}
  return ticketRole.includes(specialty);
}

/**
 * 显示任务列表
 */
function displayTaskList(tasks: TicketInfo[], specialty: string) {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  可领取任务列表（按优先级排序）                              │');
  console.log('├──────────────────────────────────────────────────────────────┤');

  for (const task of tasks) {
    const match = checkRoleMatch(task.role, specialty) ? '✓' : '○';

    let priorityDisplay = task.priority;
    switch (task.priority) {
      case 'P0': priorityDisplay = 'P0 (紧急)'; break;
      case 'P1': priorityDisplay = 'P1 (高)'; break;
      case 'P2': priorityDisplay = 'P2 (中)'; break;
      case 'P3': priorityDisplay = 'P3 (低)'; break;
    }

    console.log(`│  ${match} ${task.ticketId}`);
    console.log(`│     优先级：${priorityDisplay} | 适配角色：${task.role || '未指定'}`);
    console.log('│');
  }

  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('领取命令：/eket-claim <ticket-id>');
  console.log('');
}

/**
 * 显示身份信息卡片
 */
function displayIdentityCard(status: SlaverStatus, markerFile: string) {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│                    Slaver 身份信息                            │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  实例 ID:    ${status.instanceId}`);
  console.log(`│  角色：Slaver (执行实例)`);
  console.log(`│  专长：${status.specialty || '未设置'}`);
  console.log('│  状态：活跃');
  console.log('│');
  console.log('│  职责：');
  console.log('│  • 领取 Jira tickets 并执行');
  console.log('│  • 自主规划任务、开发、测试、迭代');
  console.log('│  • 提交 PR 请求 Master 审核');
  console.log('│');
  console.log('│  禁止操作：');
  console.log('│  ❌ 合并代码到 main 分支');
  console.log('│  ❌ 审核自己的 PR');
  console.log('│  ❌ 领取超出能力范围的任务');
  console.log('│  ❌ 跳过测试直接提交');
  console.log('│');
  console.log(`│  当前任务：${status.currentTask || '无'}`);
  console.log(`│  注册文件：${markerFile}`);
  console.log('│');
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * 显示可用命令
 */
function displayAvailableCommands() {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Slaver 可用命令                                              │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log('│  /eket-status          查看当前状态和任务列表                │');
  console.log('│  /eket-claim <id>      领取任务                              │');
  console.log('│  /eket-submit-pr       提交 PR 请求审核                       │');
  console.log('│  /eket-slaver-poll     启动轮询（定期检查状态）              │');
  console.log('│  /eket-role <role>     设置专长角色                          │');
  console.log('│  /eket-help            显示帮助                              │');
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
}

/**
 * 显示下一步建议
 */
function displayNextSteps(status: SlaverStatus, readyTasks: TicketInfo[]) {
  logInfo('下一步建议：');

  if (status.currentTaskStatus === 'idle' && readyTasks.length > 0) {
    console.log('  1. 从上方列表中选择一个任务');
    console.log('  2. 运行 /eket-claim <ticket-id> 领取任务');
    console.log('  3. 开始开发工作');
  } else if (status.currentTaskStatus === 'in_progress') {
    console.log('  - 继续当前的开发工作');
    console.log('  - 完成后运行 /eket-submit-pr 提交 PR');
  } else if (status.currentTaskStatus === 'review') {
    console.log('  - 等待 Master 审核结果');
    console.log('  - 可考虑领取其他 ready 任务');
  } else {
    console.log('  - 等待 Master 创建新任务');
    console.log('  - 或联系人类提供新需求');
  }
  console.log('');
}

/**
 * 注册 Slaver 命令
 */
export function registerSlaverRegister(program: Command): void {
  program
    .command('slaver:register')
    .description('Slaver 身份注册和任务识别')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli slaver:register                  # Register Slaver identity

Related Commands:
  $ eket-cli instance:start                   # Start Slaver instance first
  $ eket-cli slaver:poll                      # Start polling after registration
  $ eket-cli claim                            # Claim a task manually

Description:
  This command performs 5 steps:
  1. Register Slaver identity
  2. Scan for ready tasks
  3. Check current task status
  4. Display identity card
  5. Show available commands
`
    )
    .action(async () => {
      console.log('');
      console.log('========================================');
      console.log('Slaver 身份注册 v2.1.4');
      console.log('========================================');
      console.log('');

      // 获取实例信息
      const status = getInstanceInfo();

      // 检查角色
      if (status.role !== 'slaver') {
        printError({
          code: 'INVALID_ROLE',
          message: '当前实例不是 Slaver 角色',
          solutions: [
            'Run instance:start with --role to create a Slaver instance',
            'Check .eket/state/instance_config.yml for current role',
          ],
        });
        console.log(`当前角色：${status.role}`);
        console.log(`实例 ID: ${status.instanceId}`);
        process.exit(1);
      }

      // 步骤 1: 注册 Slaver 身份
      console.log(`${COLORS.blue}## 步骤 1: 注册 Slaver 身份${COLORS.reset}`);
      console.log('');

      const spinner = ora('创建 Slaver 身份注册文件...').start();
      try {
        const markerFile = registerSlaverIdentity(status.instanceId, status.specialty);
        spinner.succeed(`Slaver 身份已注册到：${markerFile}`);
      } catch (error) {
        spinner.fail('注册失败');
        printError({
          code: 'REGISTRATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        process.exit(1);
      }
      console.log('');

      // 步骤 2: 识别可领取的任务
      console.log(`${COLORS.blue}## 步骤 2: 识别可领取的任务${COLORS.reset}`);
      console.log('');

      const readyTasks = scanReadyTasks(status.specialty);

      if (readyTasks.length === 0) {
        logInfo('当前无 ready 状态的任务');
        console.log('');
        console.log('┌──────────────────────────────────────────────────────────────┐');
        console.log('│  等待 Master 创建新任务...                                    │');
        console.log('│                                                              │');
        console.log('│  提示：                                                      │');
        console.log('│  - 检查 inbox/human_input.md 是否有新需求                    │');
        console.log('│  - 联系 Master 创建任务                                       │');
        console.log('└──────────────────────────────────────────────────────────────┘');
      } else {
        logInfo(`发现 ${readyTasks.length} 个 ready 状态的任务`);
        displayTaskList(readyTasks, status.specialty);

        // 推荐任务
        const recommendedTask = readyTasks.find(t => checkRoleMatch(t.role, status.specialty));
        if (recommendedTask) {
          logInfo(`推荐领取：${recommendedTask.ticketId} (角色匹配)`);
        } else if (readyTasks.length > 0) {
          logInfo(`推荐领取：${readyTasks[0].ticketId} (优先级最高)`);
        }
      }
      console.log('');

      // 步骤 3: 检查当前任务状态
      console.log(`${COLORS.blue}## 步骤 3: 检查当前任务状态${COLORS.reset}`);
      console.log('');

      if (status.currentTask) {
        logInfo(`当前任务：${status.currentTaskStatus}`);

        switch (status.currentTaskStatus) {
          case 'in_progress':
            console.log('');
            console.log('┌──────────────────────────────────────────────────────────────┐');
            console.log(`│  任务：${status.currentTask}`);
            console.log('│  状态：进行中');
            console.log('│                                                              │');
            console.log('│  下一步：                                                    │');
            console.log('│  - 继续开发工作                                              │');
            console.log('│  - 完成后运行 /eket-submit-pr 提交 PR                        │');
            console.log('└──────────────────────────────────────────────────────────────┘');
            break;
          case 'review':
            console.log('');
            console.log('┌──────────────────────────────────────────────────────────────┐');
            console.log(`│  任务：${status.currentTask}`);
            console.log('│  状态：等待 Review');
            console.log('│                                                              │');
            console.log('│  下一步：                                                    │');
            console.log('│  - 等待 Master 审核结果                                      │');
            console.log('│  - 可领取其他 ready 任务                                      │');
            console.log('└──────────────────────────────────────────────────────────────┘');
            break;
          case 'done':
            logInfo('当前任务已完成');
            console.log('');
            console.log('┌──────────────────────────────────────────────────────────────┐');
            console.log(`│  任务：${status.currentTask}`);
            console.log('│  状态：已完成');
            console.log('│                                                              │');
            console.log('│  下一步：                                                    │');
            console.log('│  - 清理当前工作区                                            │');
            console.log('│  - 领取新的任务                                              │');
            console.log('└──────────────────────────────────────────────────────────────┘');
            break;
          default:
            logInfo(`当前任务状态：${status.currentTaskStatus}`);
        }
      } else {
        logInfo('当前无进行中的任务');
      }
      console.log('');

      // 步骤 4: 显示身份信息卡片
      console.log(`${COLORS.blue}## 步骤 4: 显示身份信息卡片${COLORS.reset}`);

      const markerFilePath = path.join('.eket/state/slavers', `${status.instanceId}.yml`);
      displayIdentityCard(status, markerFilePath);

      // 步骤 5: 显示可用命令
      console.log(`${COLORS.blue}## 步骤 5: 可用命令${COLORS.reset}`);
      console.log('');
      displayAvailableCommands();

      console.log('');
      console.log('========================================');
      console.log('Slaver 身份注册完成');
      console.log('========================================');
      console.log('');

      displayNextSteps(status, readyTasks);

      logger.info('Slaver registration completed', {
        instanceId: status.instanceId,
        specialty: status.specialty,
        readyTasks: readyTasks.length,
      });
    });
}
