/**
 * Task Claim Command
 * 用于 Slaver 领取 Jira 任务
 *
 * Phase 4.3 - Integrated with TaskAssigner and InstanceRegistry
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';
import ora from 'ora';

import { createInstanceRegistry } from '../core/instance-registry.js';
import { createTaskAssigner, type AssignmentResult } from '../core/task-assigner.js';
import type { Instance, Ticket } from '../types/index.js';
import { printError, logSuccess } from '../utils/error-handler.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

import {
  loadConfig,
  getTickets,
  matchRole,
  initializeProfile,
  sendClaimMessage,
} from './claim-helpers.js';

interface ClaimOptions {
  ticketId?: string;
  auto: boolean;
  role?: string;
  assign?: boolean;
}

/**
 * 将 Ticket 转换为标准格式
 */
function convertToTicket(ticket: {
  id: string;
  title: string;
  priority: string;
  tags: string[];
  status: string;
}): Ticket {
  return {
    id: ticket.id,
    title: ticket.title,
    priority: ticket.priority as 'urgent' | 'high' | 'normal' | 'low',
    tags: ticket.tags,
    status: ticket.status,
    required_role: undefined, // 会在后续匹配
  };
}

/**
 * 使用任务分配器分配任务
 */
async function assignTaskWithRegistry(
  _projectRoot: string,
  ticket: { id: string; title: string; priority: string; tags: string[]; status: string }
): Promise<AssignmentResult> {
  const registry = createInstanceRegistry();
  const connectResult = await registry.connect();

  if (!connectResult.success) {
    // Redis 不可用时降级到本地分配
    console.log('[Claim] Redis unavailable, using local assignment');
    return { assigned: false, reason: 'Redis not available' };
  }

  try {
    const assigner = createTaskAssigner();
    const instancesResult = await registry.getAvailableInstances();

    if (!instancesResult.success) {
      return { assigned: false, reason: 'Failed to get instances' };
    }

    const standardTicket = convertToTicket(ticket);
    return assigner.assignTicket(standardTicket, instancesResult.data);
  } finally {
    await registry.disconnect();
  }
}

/**
 * 更新任务状态
 */
async function updateTicketStatus(
  projectRoot: string,
  ticketId: string,
  status: string
): Promise<void> {
  // 查找任务文件
  const jiraPath = path.join(projectRoot, 'jira', 'tickets');
  const dirs = ['feature', 'bugfix', 'task', 'improvement'];

  for (const dir of dirs) {
    const ticketFile = path.join(jiraPath, dir, `${ticketId}.md`);
    if (fs.existsSync(ticketFile)) {
      // 更新状态 (简单替换)
      let content = fs.readFileSync(ticketFile, 'utf-8');
      content = content.replace(/\*\*状态\*\*:\s*\w+/i, `**状态**: ${status}`);
      fs.writeFileSync(ticketFile, content);
      return;
    }
  }
}

/**
 * 创建 worktree
 */
async function createWorktree(projectRoot: string, ticketId: string): Promise<string> {
  const worktreeDir = path.join(projectRoot, '.eket', 'worktrees', ticketId);

  // 确保目录存在
  fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });

  // 调用 git worktree add (使用安全执行)
  const branchName = ticketId.replace(/[^a-zA-Z0-9_-]/g, '_');
  await execFileNoThrow('git', ['worktree', 'add', '-b', branchName, worktreeDir]);

  return worktreeDir;
}

/**
 * 注册 claim 命令
 */
export function registerClaim(program: Command): void {
  program
    .command('task:claim [ticketId]')
    .description('Claim a Jira task')
    .option('-a, --auto', 'Auto claim highest priority task', false)
    .option('-r, --role <role>', 'Specify role type')
    .option('--assign', 'Use task assigner for automatic assignment', false)
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli task:claim                         # Show available tasks
  $ eket-cli task:claim FEAT-123                # Claim specific task
  $ eket-cli task:claim auto                    # Auto claim highest priority
  $ eket-cli task:claim -a -r frontend_dev      # Auto claim with role

Related Commands:
  $ eket-cli task:list                          # List all tasks
  $ eket-cli instance:start                     # Start instance after claiming
  $ eket-cli submit-pr                          # Submit PR after completion
`
    )
    .action(async (ticketId: string | undefined, options: ClaimOptions) => {
      console.log('\n=== Claim Task ===\n');

      // 1. 检查项目状态
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        printError({
          code: 'PROJECT_NOT_FOUND',
          message: 'EKET project not found',
          solutions: [
            'Run `eket-cli project:init` to initialize the project',
            'Ensure you are in the correct project directory',
          ],
        });
        process.exit(1);
      }

      // 2. 读取配置
      const config = await loadConfig(projectRoot);
      if (!config) {
        printError({
          code: 'CONFIG_NOT_FOUND',
          message: 'Project configuration not found',
          solutions: [
            'Run `eket-cli project:init` to create configuration',
            'Check .eket/config.yml exists',
          ],
        });
        process.exit(1);
      }

      // 3. 获取任务列表
      const tickets = await getTickets(projectRoot);
      if (tickets.length === 0) {
        console.log('No tasks available to claim');
        return;
      }

      // 4. 选择任务
      let selectedTicket;
      if (options.auto || ticketId === 'auto') {
        // 自动模式：选择最高优先级任务
        selectedTicket = tickets[0];
        console.log(`Auto-selected task: ${selectedTicket.id}`);
      } else if (ticketId) {
        // 指定任务 ID
        selectedTicket = tickets.find((t) => t.id === ticketId);
        if (!selectedTicket) {
          printError({
            code: 'TASK_NOT_FOUND',
            message: `Task ${ticketId} not found`,
            solutions: [
              'Run `eket-cli task:claim` to see available tasks',
              'Verify the task ID format (e.g., FEAT-123)',
            ],
          });
          return;
        }
      } else {
        // 手动模式：显示列表
        console.log('Available tasks:\n');
        tickets.forEach((ticket, index) => {
          console.log(`  ${index + 1}. [${ticket.id}] ${ticket.title}`);
          console.log(`     Priority: ${ticket.priority} | Tags: ${ticket.tags.join(', ')}`);
        });
        console.log(
          '\nUse /eket-claim <id> to claim specific task, or /eket-claim auto for auto claim'
        );
        return;
      }

      // 5. 任务分配（如果启用）
      let assignedInstance: Instance | undefined;
      if (options.assign) {
        const assignSpinner = ora('Assigning task with Task Assigner...').start();
        const assignResult = await assignTaskWithRegistry(projectRoot, selectedTicket);

        if (assignResult.assigned && assignResult.instance) {
          assignSpinner.succeed('Task assigned');
          assignedInstance = assignResult.instance;
          console.log(`  Instance: ${assignResult.instance.id}`);
          console.log(`  Role: ${assignResult.instance.agent_type}`);
          console.log(`  Type: ${assignResult.instance.type}`);
        } else {
          assignSpinner.info('Task assigner unavailable, using local matching');
        }
      }

      // 6. 匹配角色
      const roleSpinner = ora('Matching role...').start();
      const role =
        options.role || assignedInstance?.agent_type || (await matchRole(selectedTicket));
      roleSpinner.succeed(`Role matched: ${role}`);

      // 7. 更新任务状态
      const statusSpinner = ora('Updating task status...').start();
      await updateTicketStatus(projectRoot, selectedTicket.id, 'in_progress');
      statusSpinner.succeed(`Task status updated: ${selectedTicket.id} -> in_progress`);

      // 8. 创建 worktree
      const worktreeSpinner = ora('Creating worktree...').start();
      const worktreePath = await createWorktree(projectRoot, selectedTicket.id);
      worktreeSpinner.succeed(`Worktree created: ${worktreePath}`);

      // 9. 初始化 Profile
      const profileSpinner = ora('Initializing profile...').start();
      await initializeProfile(projectRoot, role, selectedTicket);
      profileSpinner.succeed(`Profile initialized: ${role}`);

      // 10. 发送消息
      const messageSpinner = ora('Sending message to queue...').start();
      await sendClaimMessage(projectRoot, selectedTicket.id, role);
      messageSpinner.succeed('Message sent');

      logSuccess('Task claimed successfully', [
        `Task: ${selectedTicket.id}`,
        `Role: ${role}`,
        `Instance: ${assignedInstance?.id || 'local'}`,
        `Worktree: ${worktreePath}`,
      ]);
      console.log('\nNext step: Run /eket-start to begin execution\n');
    });
}
