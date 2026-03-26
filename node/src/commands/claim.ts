/**
 * Task Claim Command
 * 用于 Slaver 领取 Jira 任务
 *
 * Phase 4.3 - Integrated with TaskAssigner and InstanceRegistry
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { findProjectRoot } from '../utils/process-cleanup.js';
import {
  loadConfig,
  getTickets,
  matchRole,
  initializeProfile,
  sendClaimMessage,
} from './claim-helpers.js';
import { createInstanceRegistry } from '../core/instance-registry.js';
import { createTaskAssigner, type AssignmentResult } from '../core/task-assigner.js';
import type { Instance, Ticket } from '../types/index.js';

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
    .command('claim [ticketId]')
    .description('领取 Jira 任务')
    .option('-a, --auto', '自动领取最高优先级任务', false)
    .option('-r, --role <role>', '指定角色类型')
    .option('--assign', '使用任务分配器自动分配', false)
    .action(async (ticketId: string | undefined, options: ClaimOptions) => {
      console.log('\n=== 领取任务 ===\n');

      // 1. 检查项目状态
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('错误：未找到 EKET 项目');
        process.exit(1);
      }

      // 2. 读取配置
      const config = await loadConfig(projectRoot);
      if (!config) {
        console.error('错误：未找到项目配置');
        process.exit(1);
      }

      // 3. 获取任务列表
      const tickets = await getTickets(projectRoot);
      if (tickets.length === 0) {
        console.log('当前没有可领取的任务');
        return;
      }

      // 4. 选择任务
      let selectedTicket;
      if (options.auto || ticketId === 'auto') {
        // 自动模式：选择最高优先级任务
        selectedTicket = tickets[0];
        console.log(`自动选择任务：${selectedTicket.id}`);
      } else if (ticketId) {
        // 指定任务 ID
        selectedTicket = tickets.find((t) => t.id === ticketId);
        if (!selectedTicket) {
          console.error(`错误：未找到任务 ${ticketId}`);
          return;
        }
      } else {
        // 手动模式：显示列表
        console.log('可领取的任务:\n');
        tickets.forEach((ticket, index) => {
          console.log(`  ${index + 1}. [${ticket.id}] ${ticket.title}`);
          console.log(`     优先级：${ticket.priority} | 标签：${ticket.tags.join(', ')}`);
        });
        console.log('\n请使用 /eket-claim <id> 指定任务，或使用 /eket-claim auto 自动领取');
        return;
      }

      // 5. 任务分配（如果启用）
      let assignedInstance: Instance | undefined;
      if (options.assign) {
        console.log('正在使用任务分配器分配任务...');
        const assignResult = await assignTaskWithRegistry(projectRoot, selectedTicket);

        if (assignResult.assigned && assignResult.instance) {
          assignedInstance = assignResult.instance;
          console.log(`任务已分配给实例：${assignResult.instance.id}`);
          console.log(`  角色：${assignResult.instance.agent_type}`);
          console.log(`  类型：${assignResult.instance.type}`);
        } else {
          console.log(`任务分配失败：${assignResult.reason}`);
          console.log('降级到本地角色匹配...');
        }
      }

      // 6. 匹配角色
      const role = options.role || (assignedInstance?.agent_type) || await matchRole(selectedTicket);
      console.log(`匹配角色：${role}`);

      // 7. 更新任务状态
      await updateTicketStatus(projectRoot, selectedTicket.id, 'in_progress');
      console.log(`任务状态已更新：${selectedTicket.id} -> in_progress`);

      // 8. 创建 worktree
      const worktreePath = await createWorktree(projectRoot, selectedTicket.id);
      console.log(`worktree 已创建：${worktreePath}`);

      // 9. 初始化 Profile
      await initializeProfile(projectRoot, role, selectedTicket);
      console.log(`Profile 已初始化：${role}`);

      // 10. 发送消息
      await sendClaimMessage(projectRoot, selectedTicket.id, role);
      console.log('消息已发送到消息队列');

      console.log('\n✓ 任务领取成功');
      console.log(`  任务：${selectedTicket.id}`);
      console.log(`  角色：${role}`);
      console.log(`  实例：${assignedInstance?.id || 'local'}`);
      console.log(`  worktree: ${worktreePath}`);
      console.log('\n下一步：开始任务执行 /eket-start\n');
    });
}
