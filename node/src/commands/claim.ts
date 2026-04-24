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

import { contextCompressor } from '../core/context-compressor.js';
import { EnvelopeManager } from '../core/envelope-manager.js';
import { createInstanceRegistry } from '../core/instance-registry.js';
import { selectRole, getRulesFileName, getRulesPath } from '../core/role-selector.js';
import { SagaExecutor } from '../core/saga-executor.js';
import { SkillStacker } from '../core/skill-stacker.js';
import { createSQLiteManager } from '../core/sqlite-manager.js';
import { sseBus } from '../core/sse-bus.js';
import { createTaskAssigner, type AssignmentResult } from '../core/task-assigner.js';
import { appendTaskMessage, injectActiveContext as injectActiveContextData } from '../core/task-logger.js';
import { reviewTicket } from '../core/ticket-reviewer.js';
import { WorktreeManager } from '../core/worktree-manager.js';
import type { Instance, Ticket } from '../types/index.js';
import { printError, logSuccess } from '../utils/error-handler.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

import {
  loadConfig,
  getTickets,
  matchRole,
  initializeProfile,
  sendClaimMessage,
} from './claim-helpers.js';


/**
 * 获取或生成持久化 Slaver ID（P4修复）
 * 读写 .eket/slaver-id 文件，避免 PID 重启后 ID 变化导致检查点丢失
 */
function getOrCreateSlaverId(projectRoot: string): string {
  if (process.env.EKET_SLAVER_ID) {
    return process.env.EKET_SLAVER_ID;
  }
  const slaveridPath = path.join(projectRoot, '.eket', 'slaver-id');
  try {
    if (fs.existsSync(slaveridPath)) {
      const id = fs.readFileSync(slaveridPath, 'utf-8').trim();
      if (id) {return id;}
    }
    const newId = `slaver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.dirname(slaveridPath), { recursive: true });
    fs.writeFileSync(slaveridPath, newId, 'utf-8');
    return newId;
  } catch {
    return `slaver_${process.pid}`;
  }
}

interface ClaimOptions {
  ticketId?: string;
  auto: boolean;
  role?: string;
  assign?: boolean;
}

/**
 * 构建 ACTIVE_CONTEXT.md 内容（TASK-069）
 */
export function buildActiveContextMd(
  ticket: { id: string; title: string },
  slaverId: string,
  skills: string[],
  role: string
): string {
  const now = new Date().toISOString();
  const skillList = skills.length > 0 ? skills.map((s) => `- ${s}`).join('\n') : '- (none)';
  return `# EKET Active Context

> 此文件由 task:claim 自动生成，ticket 完成后删除。请勿手动编辑。
> 生成时间: ${now}

## Active Ticket

- **ID**: ${ticket.id}
- **Title**: ${ticket.title}

## Identity

- **Slaver ID**: ${slaverId}
- **Role**: ${role}
- **Started At**: ${now}

## Available Commands

- \`task:claim\` — 领取下一个任务
- \`task:resume\` — 断点恢复
- \`system:doctor\` — 系统诊断
- \`heartbeat:start\` — 启动心跳

## Active Skills

${skillList}
`;
}

/**
 * 注入活跃上下文到 .eket/ACTIVE_CONTEXT.md（TASK-069，4-arg 版本供测试使用）
 */
export async function injectActiveContext(
  projectRoot: string,
  ticket: { id: string; title: string },
  slaverId: string,
  role: string
): Promise<void> {
  const skills: string[] = [];
  const content = buildActiveContextMd(ticket, slaverId, skills, role);
  const dir = path.join(projectRoot, '.eket');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ACTIVE_CONTEXT.md'), content, 'utf-8');
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
 * 获取 isolation 模式（读取环境变量，默认 "worktree"）
 */
export function getIsolationMode(): 'worktree' | 'none' {
  const val = process.env.EKET_ISOLATION;
  if (val === 'none') {return 'none';}
  return 'worktree';
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

      // 4.5 加载 Layer 2 session summary（如果存在）
      {
        const summary = await contextCompressor.loadSummary(selectedTicket.id);
        if (summary) {
          console.log('[context] Loaded session summary from previous run');
          console.log(summary);
        }
      }

      // 5. 任务分配（如果启用）
      // 5. 任务分配（如果启用）
      let assignedInstance: Instance | undefined;

      // 5.0 SQLite 原子事务领取（防竞争）
      const slaverId = getOrCreateSlaverId(projectRoot);
      const sqliteClient = createSQLiteManager();
      const sqliteConnected = await sqliteClient.connect();
      if (sqliteConnected.success) {
        const claimResult = await sqliteClient.claimTaskById(selectedTicket.id, slaverId);
        await sqliteClient.close();
        if (claimResult.success && claimResult.data === false) {
          // 被其他 Slaver 抢占
          printError({
            code: 'TASK_ALREADY_CLAIMED',
            message: `Task ${selectedTicket.id} 已被其他 Slaver 抢占，请选择其他任务`,
            solutions: ['Run `eket-cli task:list` to see available tasks'],
          });
          return;
        }
        if (!claimResult.success) {
          // SQLite 操作失败，不降级，直接报错（P2修复）
          printError({
            code: 'SQLITE_CLAIM_FAILED',
            message: `SQLite 领取操作失败: ${claimResult.error?.message ?? 'unknown'}`,
            solutions: [
              'Check SQLite database health: node dist/index.js system:doctor',
              'Retry after resolving the database issue',
            ],
          });
          return;
        }
      } else {
        // SQLite 完全不可用时才降级文件系统
        await sqliteClient.close();
        console.log('[Claim] SQLite unavailable, using filesystem-only mode');
      }

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

      // 5.5 读取 TaskEnvelope + Skill Stacking（TASK-118）
      {
        try {
          const eketDir = path.join(projectRoot, '.eket');
          const envelopeManager = new EnvelopeManager(eketDir);
          const envelope = await envelopeManager.readEnvelope(selectedTicket.id);
          if (envelope) {
            console.log(`[envelope] Found envelope for ${selectedTicket.id}, mode=${envelope.mode}`);
            if (envelope.requiredSkills.length > 0) {
              const skillsRoot = path.join(projectRoot, 'node', 'src', 'skills');
              const stacker = new SkillStacker(skillsRoot);
              const stackedCtx = await stacker.loadStack(envelope.requiredSkills);
              console.log(`[skills] Loaded stack: [${stackedCtx.skillIds.join(', ')}]`);
            }
          } else {
            // Parse required_skills from ticket markdown if no envelope
            const rawRequired = (selectedTicket as { rawContent?: string }).rawContent ?? '';
            const m = rawRequired.match(/required_skills[:\s]+\[([^\]]+)\]/);
            if (m) {
              const skillIds = m[1].split(',').map((s: string) => s.trim()).filter(Boolean);
              if (skillIds.length > 0) {
                const skillsRoot = path.join(projectRoot, 'node', 'src', 'skills');
                const stacker = new SkillStacker(skillsRoot);
                const stackedCtx = await stacker.loadStack(skillIds);
                console.log(`[skills] Loaded stack: [${stackedCtx.skillIds.join(', ')}]`);
              }
            }
          }
        } catch { /* envelope/skill-stacker unavailable — continue */ }
      }

      // 6. 匹配角色
      const roleSpinner = ora('Matching role...').start();
      const role =
        options.role || assignedInstance?.agent_type || (await matchRole(selectedTicket));
      roleSpinner.succeed(`Role matched: ${role}`);

      // 6.05 推荐层级（TASK-104b）
      {
        let recommendedLevel: 1 | 2 | 3 = 1;
        try {
          const { getSkillIndex } = await import('../skills/index-loader.js');
          const idx = getSkillIndex();
          const domain = selectedTicket.id.replace(/-\d+.*$/, '').toLowerCase();
          recommendedLevel = (idx.modelRouteTable[domain] ?? idx.modelRouteTable['default'] ?? 1) as 1 | 2 | 3;
        } catch { /* SkillIndex not initialized — use default */ }
        const levelNames: Record<number, string> = { 1: 'haiku', 2: 'sonnet', 3: 'opus' };
        console.log(`[model] Recommended level: ${recommendedLevel} (${levelNames[recommendedLevel]})`);
        // Write recommended level to instance
        try {
          const { createInstanceRegistry } = await import('../core/instance-registry.js');
          const registry = createInstanceRegistry();
          const result = await registry.getInstance(slaverId);
          const instance = result && 'data' in result ? result.data : null;
          if (instance) {
            // Upgrade until we reach recommended level
            while (instance.currentLevel < recommendedLevel) {
              await registry.upgradeModel(slaverId, `claim:recommended-level-${recommendedLevel}`);
              instance.currentLevel = Math.min(3, instance.currentLevel + 1) as 1 | 2 | 3;
            }
          }
        } catch { /* registry unavailable */ }
      }

      // 6.1 选择专项规则（TASK-045）
      const ticketType = selectedTicket.tags[0] ?? 'feature';
      const slaverRole = selectRole(ticketType);
      console.log(
        `[Role] Ticket type: ${ticketType} → 加载专项规则: ${getRulesFileName(slaverRole)}`
      );
      console.log(`[Role] 规则路径: ${getRulesPath(slaverRole)}`);

      // 7. 更新任务状态
      const statusSpinner = ora('Updating task status...').start();
      await updateTicketStatus(projectRoot, selectedTicket.id, 'in_progress');
      statusSpinner.succeed(`Task status updated: ${selectedTicket.id} -> in_progress`);

      // 8. 创建 worktree（isolation=worktree 时，使用 SagaExecutor 保证原子性）
      let worktreePath = '';
      const isolationMode = getIsolationMode();
      if (isolationMode === 'worktree') {
        const worktreeSpinner = ora('Creating worktree...').start();
        interface WorktreeState { path: string }
        const wm = new WorktreeManager({ projectRoot });
        const worktreeSaga = new SagaExecutor<WorktreeState>();
        worktreeSaga.addStep({
          name: 'createWorktree',
          forward: async (_state) => {
            const created = await wm.createWorktree(selectedTicket.id, slaverId);
            return { path: created };
          },
          compensate: async (_state) => {
            try {
              await wm.removeWorktree(selectedTicket.id, true);
            } catch { /* ignore removal errors */ }
          },
        });
        const sagaResult = await worktreeSaga.execute({ path: '' });
        if (sagaResult.success) {
          worktreePath = sagaResult.state.path;
          worktreeSpinner.succeed(`[worktree] Created: ${worktreePath}`);
        } else {
          const errMsg = sagaResult.error?.message ?? 'unknown';
          worktreeSpinner.warn(`Worktree creation skipped: ${errMsg}`);
          // Saga failed → mark ticket blocked + write inbox feedback
          await updateTicketStatus(projectRoot, selectedTicket.id, 'blocked');
          const feedbackDir = path.join(projectRoot, 'inbox', 'human_feedback');
          fs.mkdirSync(feedbackDir, { recursive: true });
          const feedbackFile = path.join(feedbackDir, `blocked-${selectedTicket.id}-${slaverId}.md`);
          fs.writeFileSync(feedbackFile, `# Blocked: ${selectedTicket.id}\n\n**Slaver ID**: ${slaverId}\n**Ticket**: ${selectedTicket.id}\n**Time**: ${new Date().toISOString()}\n**Status**: blocked\n\n## Reason\n\nWorktree creation saga failed: ${errMsg}\n`, 'utf-8');
          console.log(`\n[feedback] Written: ${feedbackFile}`);
        }
      }

      // 8.5 Slaver 自主 ticket 完整性 review（TASK-110b）
      {
        // Find ticket file path
        const jiraBase = path.join(projectRoot, 'jira', 'tickets');
        const searchDirs = ['', 'feature', 'bugfix', 'task', 'improvement'];
        let ticketFilePath = '';
        for (const dir of searchDirs) {
          const candidate = dir
            ? path.join(jiraBase, dir, `${selectedTicket.id}.md`)
            : path.join(jiraBase, `${selectedTicket.id}.md`);
          if (fs.existsSync(candidate)) {
            ticketFilePath = candidate;
            break;
          }
        }

        if (ticketFilePath) {
          const reviewSpinner = ora('Running ticket review...').start();
          const reviewResult = await reviewTicket(ticketFilePath);

          if (!reviewResult.passed) {
            reviewSpinner.fail('Ticket review failed');
            console.log('\n❌ Ticket 完整性检查不通过：');
            reviewResult.issues.forEach((issue: string) => console.log(`  • ${issue}`));

            // 删除刚创建的 worktree
            if (worktreePath) {
              try {
                const wm = new WorktreeManager({ projectRoot });
                await wm.removeWorktree(selectedTicket.id, true);
                console.log('[worktree] Cleaned up due to review failure');
              } catch { /* ignore */ }
            }

            // 更新 ticket 状态为 blocked
            await updateTicketStatus(projectRoot, selectedTicket.id, 'blocked');

            // 写 inbox/human_feedback/blocked-<ticketId>-<slaverId>.md
            const feedbackDir = path.join(projectRoot, 'inbox', 'human_feedback');
            fs.mkdirSync(feedbackDir, { recursive: true });
            const feedbackFile = path.join(feedbackDir, `blocked-${selectedTicket.id}-${slaverId}.md`);
            const feedbackContent = `# Blocked: ${selectedTicket.id}

**Slaver ID**: ${slaverId}
**Ticket**: ${selectedTicket.id}
**Time**: ${new Date().toISOString()}
**Status**: blocked

## Issues

${reviewResult.issues.map((i: string) => `- ${i}`).join('\n')}

## Required Actions

请 Master 补充 ticket 信息后重新分配此任务。
`;
            fs.writeFileSync(feedbackFile, feedbackContent, 'utf-8');
            console.log(`\n[feedback] Written: ${feedbackFile}`);
            process.exit(1);
          }

          reviewSpinner.succeed('✅ Ticket review passed，开始执行');
        }
      }

      // 9. 初始化 Profile
      const profileSpinner = ora('Initializing profile...').start();
      await initializeProfile(projectRoot, role, selectedTicket);
      profileSpinner.succeed(`Profile initialized: ${role}`);

      // 10. 发送消息
      const messageSpinner = ora('Sending message to queue...').start();
      await sendClaimMessage(projectRoot, selectedTicket.id, role);
      messageSpinner.succeed('Message sent');

      // 11. 追加执行日志到 ticket（TASK-078）
      const logSlaverId = `agent_${role}_${process.pid}`;
      await appendTaskMessage(selectedTicket.id, '领取任务', logSlaverId);

      // 12. 刷新活跃上下文（TASK-079）
      await injectActiveContextData({
        ticketId: selectedTicket.id,
        role,
        slaverId,
        claimedAt: new Date().toISOString(),
        status: 'in_progress',
      });

      logSuccess('Task claimed successfully', [
        `Task: ${selectedTicket.id}`,
        `Role: ${role}`,
        `Instance: ${assignedInstance?.id || 'local'}`,
        `Worktree: ${worktreePath}`,
      ]);

      // Publish task_started SSE event (TASK-109)
      sseBus.publish({
        type: 'task_started',
        ticketId: selectedTicket.id,
        slaverId: logSlaverId,
        timestamp: new Date().toISOString(),
      });

      console.log('\nNext step: Run /eket-start to begin execution\n');
    });
}
