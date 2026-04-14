/**
 * Master Heartbeat Command
 *
 * 将 CLAUDE.md 中 Master 的 4 个自检问题形式化为可执行命令，输出结构化 JSON 报告。
 *
 * Usage:
 *   node dist/index.js master:heartbeat
 *   node dist/index.js master:heartbeat --json      # 纯 JSON 输出（机器可读）
 *   node dist/index.js master:heartbeat --brief     # 单行摘要
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { EketErrorCode } from '../types/index.js';
import { printError } from '../utils/error-handler.js';

// ============================================================================
// Constants
// ============================================================================

const SLOW_TASK_THRESHOLD_MINUTES = 120;

// ============================================================================
// Types
// ============================================================================

export type TicketStatus =
  | 'backlog'
  | 'analysis'
  | 'ready'
  | 'gate_review'
  | 'in_progress'
  | 'test'
  | 'pr_review'
  | 'done'
  | 'completed'
  | string;

export interface TicketSummary {
  id: string;
  title: string;
  status: TicketStatus;
  priority: string;
  assignee: string;
  lastUpdated: string | null;
  minutesSinceUpdate: number | null;
  blockedBy: string[];
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface InboxStatus {
  hasHumanInput: boolean;
  humanInputLines: number;
  pendingFeedbackFiles: number;
  p0Instructions: string[];
  p1Instructions: number;
}

export interface SlaverStatus {
  id: string;
  ticketId: string;
  status: TicketStatus;
  minutesSinceUpdate: number | null;
  stale: boolean; // >30 min no update
}

export interface BlockedIssue {
  ticketId: string;
  reason: string;
  minutesBlocked: number | null;
}

export interface HeartbeatReport {
  timestamp: string;
  projectRoot: string;

  // Q1: 我的任务有哪些？怎么分优先级？
  taskQueue: {
    total: number;
    byStatus: Record<string, number>;
    p0: TicketSummary[];
    p1: TicketSummary[];
    p2: TicketSummary[];
    p3: TicketSummary[];
    unscheduled: TicketSummary[];
  };

  // Q2: Slaver 们在做什么？有没有依赖/等待？
  slaverStatus: {
    active: SlaverStatus[];
    stale: SlaverStatus[]; // >30 min no update
    waitingOnMaster: TicketSummary[]; // pr_review status
  };

  // Q3: 项目进度是什么？有没有卡点？
  progress: {
    doneCount: number;
    inFlightCount: number;
    blockedCount: number;
    gateReviewCount: number;
    completionRate: number; // 0-100
    riskItems: string[];
    slowTasks: TicketSummary[];            // in_progress 且 started_at 距今 > 120min
    avgExecutionMinutes: number | null;    // done ticket 的平均执行分钟数，无数据时 null
  };

  // Q4: 是否有 block 的问题需要决策？
  blockedIssues: {
    items: BlockedIssue[];
    requiresImmediateAttention: boolean;
  };

  // Q1 sub: inbox 状态
  inbox: InboxStatus;

  // 综合健康度
  health: 'GREEN' | 'YELLOW' | 'RED';
  healthReasons: string[];
  recommendations: string[];
}

// ============================================================================
// Ticket Parsing
// ============================================================================

function parseTimestamp(content: string, field: string): Date | null {
  const match = content.match(new RegExp(`\\*\\*${field}\\*\\*:\\s*(\\S+)`));
  if (!match || !match[1] || match[1].startsWith('<!--')) return null;
  const d = new Date(match[1]);
  return isNaN(d.getTime()) ? null : d;
}

function parseTicketFile(filePath: string): TicketSummary | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath, '.md');

    // Extract ID from filename or H1
    let id = filename;
    const h1Match = content.match(/^#\s+([A-Z]+-\d+)/m);
    if (h1Match) id = h1Match[1] ?? filename;

    // Extract title
    const titleMatch = content.match(/^#\s+[A-Z]+-\d+[:\s]+(.+)/m);
    const title = titleMatch ? (titleMatch[1] ?? '').trim() : filename;

    // Extract status
    const statusMatch = content.match(/\*\*(状态|status)\*\*:\s*(\S+)/i);
    const status: TicketStatus = statusMatch ? (statusMatch[2] ?? 'unknown').toLowerCase() : 'unknown';

    // Extract priority
    const priorityMatch = content.match(/\*\*(优先级|priority)\*\*:\s*(\S+)/i);
    const priority = priorityMatch ? (priorityMatch[2] ?? 'unknown') : 'unknown';

    // Extract assignee
    const assigneeMatch = content.match(/\*\*(负责人|分配给|assignee)\*\*:\s*(.+)/i);
    const assignee = assigneeMatch ? (assigneeMatch[2] ?? '').trim() : '未分配';

    // Extract blocked_by
    const blockedByMatch = content.match(/blocked_by:\s*\n((?:\s*-\s*\S+\n?)+)/);
    const blockedBy: string[] = [];
    if (blockedByMatch) {
      const lines = (blockedByMatch[1] ?? '').match(/-\s*(\S+)/g) || [];
      for (const line of lines) {
        const dep = line.replace(/^-\s*/, '').trim();
        if (dep) blockedBy.push(dep);
      }
    }

    // Extract last updated (from file mtime as fallback)
    const mtime = fs.statSync(filePath).mtime;
    const lastUpdated = mtime.toISOString();
    const minutesSinceUpdate = Math.floor((Date.now() - mtime.getTime()) / 60000);

    // Extract execution timestamps
    const startedAt = parseTimestamp(content, 'started_at');
    const completedAt = parseTimestamp(content, 'completed_at');

    return { id, title, status, priority, assignee, lastUpdated, minutesSinceUpdate, blockedBy, startedAt, completedAt };
  } catch {
    return null;
  }
}

function findTickets(ticketsDir: string): TicketSummary[] {
  if (!fs.existsSync(ticketsDir)) return [];

  const tickets: TicketSummary[] = [];
  try {
    const entries = fs.readdirSync(ticketsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.md') || entry.startsWith('README') || entry.startsWith('BACKLOG')) {
        continue;
      }
      const filePath = path.join(ticketsDir, entry);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const ticket = parseTicketFile(filePath);
      if (ticket) tickets.push(ticket);
    }
  } catch {
    // ignore read errors
  }
  return tickets;
}

// ============================================================================
// Inbox Parsing
// ============================================================================

function parseInbox(projectRoot: string): InboxStatus {
  const humanInputPath = path.join(projectRoot, 'inbox', 'human_input.md');
  const feedbackDir = path.join(projectRoot, 'inbox', 'human_feedback');

  let hasHumanInput = false;
  let humanInputLines = 0;
  const p0Instructions: string[] = [];
  let p1Instructions = 0;

  if (fs.existsSync(humanInputPath)) {
    const content = fs.readFileSync(humanInputPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    hasHumanInput = lines.length > 0;
    humanInputLines = lines.length;

    // Detect P0/P1 instructions
    for (const line of lines) {
      if (line.includes('[P0-旨意]') || line.includes('[P0]')) {
        p0Instructions.push(line.trim());
      } else if (line.includes('[P1-谕令]') || line.includes('[P1]')) {
        p1Instructions++;
      }
    }
  }

  let pendingFeedbackFiles = 0;
  if (fs.existsSync(feedbackDir)) {
    try {
      pendingFeedbackFiles = fs
        .readdirSync(feedbackDir)
        .filter((f) => f.endsWith('.md')).length;
    } catch {
      // ignore
    }
  }

  return { hasHumanInput, humanInputLines, pendingFeedbackFiles, p0Instructions, p1Instructions };
}

// ============================================================================
// Report Generation
// ============================================================================

export function generateReport(projectRoot: string): HeartbeatReport {
  const timestamp = new Date().toISOString();
  const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
  const tickets = findTickets(ticketsDir);
  const inbox = parseInbox(projectRoot);

  // ── Q1: Task Queue ────────────────────────────────────────────────────────
  const byStatus: Record<string, number> = {};
  for (const t of tickets) {
    const s = t.status.toLowerCase();
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  const activeStatuses = new Set(['backlog', 'analysis', 'ready', 'gate_review', 'in_progress', 'test', 'pr_review']);
  const activeTickets = tickets.filter((t) => activeStatuses.has(t.status.toLowerCase()));

  const priorityGroups: Record<string, TicketSummary[]> = { p0: [], p1: [], p2: [], p3: [], unscheduled: [] };
  for (const t of activeTickets) {
    const p = t.priority.toUpperCase();
    if (p === 'P0') priorityGroups['p0']!.push(t);
    else if (p === 'P1') priorityGroups['p1']!.push(t);
    else if (p === 'P2') priorityGroups['p2']!.push(t);
    else if (p === 'P3') priorityGroups['p3']!.push(t);
    else priorityGroups['unscheduled']!.push(t);
  }

  // ── Q2: Slaver Status ─────────────────────────────────────────────────────
  const STALE_MINUTES = 30;
  const inFlightTickets = tickets.filter((t) =>
    ['in_progress', 'analysis', 'test'].includes(t.status.toLowerCase())
  );

  const activeSlavers: SlaverStatus[] = inFlightTickets.map((t) => ({
    id: t.assignee,
    ticketId: t.id,
    status: t.status,
    minutesSinceUpdate: t.minutesSinceUpdate,
    stale: (t.minutesSinceUpdate ?? 0) > STALE_MINUTES,
  }));

  const staleSlavers = activeSlavers.filter((s) => s.stale);
  const waitingOnMaster = tickets.filter((t) =>
    ['pr_review', 'gate_review'].includes(t.status.toLowerCase())
  );

  // ── Q3: Progress ──────────────────────────────────────────────────────────
  const doneTickets = tickets.filter((t) =>
    ['done', 'completed', '✅'].includes(t.status.toLowerCase())
  );
  const doneCount = doneTickets.length;
  const inFlightCount = inFlightTickets.length;
  const gateReviewCount = tickets.filter((t) => t.status.toLowerCase() === 'gate_review').length;
  const blockedTickets = tickets.filter((t) => t.blockedBy.length > 0);
  const completionRate =
    tickets.length > 0 ? Math.round((doneCount / tickets.length) * 100) : 0;

  // 慢任务检测
  const now = Date.now();
  const slowTasks = inFlightTickets.filter((t) => {
    if (!t.startedAt) return false;
    return (now - t.startedAt.getTime()) / 60000 > SLOW_TASK_THRESHOLD_MINUTES;
  });

  // 平均执行时长（只统计有完整时间戳的 done ticket）
  const completedWithTiming = doneTickets.filter((t) => t.startedAt && t.completedAt);
  const avgExecutionMinutes =
    completedWithTiming.length > 0
      ? completedWithTiming.reduce(
          (sum: number, t: TicketSummary) => sum + (t.completedAt!.getTime() - t.startedAt!.getTime()) / 60000,
          0
        ) / completedWithTiming.length
      : null;

  const riskItems: string[] = [];
  if (staleSlavers.length > 0) {
    riskItems.push(`${staleSlavers.length} 个 Slaver 超过 ${STALE_MINUTES} 分钟无更新`);
  }
  if (gateReviewCount > 0) {
    riskItems.push(`${gateReviewCount} 个 ticket 等待 gate_review`);
  }
  if (blockedTickets.length > 0) {
    riskItems.push(`${blockedTickets.length} 个 ticket 存在依赖阻塞`);
  }
  if (slowTasks.length > 0) {
    riskItems.push(`${slowTasks.length} 个任务超过 ${SLOW_TASK_THRESHOLD_MINUTES} 分钟未完成`);
  }

  // ── Q4: Blocked Issues ────────────────────────────────────────────────────
  const blockedIssueItems: BlockedIssue[] = blockedTickets.map((t) => ({
    ticketId: t.id,
    reason: `依赖未完成: ${t.blockedBy.join(', ')}`,
    minutesBlocked: t.minutesSinceUpdate,
  }));

  // Add stale slavers as blocked issues
  for (const s of staleSlavers) {
    blockedIssueItems.push({
      ticketId: s.ticketId,
      reason: `Slaver ${s.id} 超过 ${s.minutesSinceUpdate ?? '?'} 分钟无响应`,
      minutesBlocked: s.minutesSinceUpdate,
    });
  }

  const requiresImmediateAttention =
    inbox.p0Instructions.length > 0 || staleSlavers.length > 0;

  // ── Health Score ──────────────────────────────────────────────────────────
  const healthReasons: string[] = [];
  const recommendations: string[] = [];
  let health: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

  if (inbox.p0Instructions.length > 0) {
    health = 'RED';
    healthReasons.push(`P0 旨意未处理: ${inbox.p0Instructions.length} 条`);
    recommendations.push('立即停止当前工作，处理 inbox/human_input.md 中的 P0 旨意');
  }

  if (staleSlavers.length > 0) {
    if (health !== 'RED') health = 'YELLOW';
    healthReasons.push(`${staleSlavers.length} 个 Slaver 超时无响应`);
    recommendations.push(
      `检查以下 ticket 的 Slaver 状态: ${staleSlavers.map((s) => s.ticketId).join(', ')}`
    );
  }

  if (slowTasks.length > 0) {
    if (health !== 'RED') health = 'YELLOW';
    healthReasons.push(`${slowTasks.length} 个任务超过 ${SLOW_TASK_THRESHOLD_MINUTES} 分钟未完成`);
    recommendations.push(
      `检查以下慢任务进展: ${slowTasks.map((t) => t.id).join(', ')}`
    );
  }

  if (waitingOnMaster.length > 0) {
    if (health === 'GREEN') health = 'YELLOW';
    healthReasons.push(`${waitingOnMaster.length} 个 ticket 等待 Master 操作`);
    recommendations.push(
      `处理等待 Master 的 ticket: ${waitingOnMaster.map((t) => t.id).join(', ')}`
    );
  }

  if ((priorityGroups['p0'] ?? []).length > 0) {
    if (health === 'GREEN') health = 'YELLOW';
    healthReasons.push(`${priorityGroups['p0']!.length} 个 P0 ticket 待执行`);
    recommendations.push(`优先处理 P0 ticket: ${priorityGroups['p0']!.map((t) => t.id).join(', ')}`);
  }

  if (health === 'GREEN') {
    healthReasons.push('所有指标正常');
    if (activeTickets.length === 0) {
      recommendations.push('暂无活跃 ticket，可从 backlog 选取下一个任务');
    }
  }

  return {
    timestamp,
    projectRoot,
    taskQueue: {
      total: activeTickets.length,
      byStatus,
      p0: priorityGroups['p0'] ?? [],
      p1: priorityGroups['p1'] ?? [],
      p2: priorityGroups['p2'] ?? [],
      p3: priorityGroups['p3'] ?? [],
      unscheduled: priorityGroups['unscheduled'] ?? [],
    },
    slaverStatus: {
      active: activeSlavers,
      stale: staleSlavers,
      waitingOnMaster,
    },
    progress: {
      doneCount,
      inFlightCount,
      blockedCount: blockedTickets.length,
      gateReviewCount,
      completionRate,
      riskItems,
      slowTasks,
      avgExecutionMinutes,
    },
    blockedIssues: {
      items: blockedIssueItems,
      requiresImmediateAttention,
    },
    inbox,
    health,
    healthReasons,
    recommendations,
  };
}

// ============================================================================
// Display
// ============================================================================

const HEALTH_ICON: Record<string, string> = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' };

function printReport(report: HeartbeatReport): void {
  const icon = HEALTH_ICON[report.health] ?? '⚪';
  console.log('');
  console.log(`${icon} Master Heartbeat — ${report.timestamp}`);
  console.log(`   健康度: ${report.health}`);
  for (const r of report.healthReasons) {
    console.log(`   • ${r}`);
  }

  console.log('');
  console.log('── Q1: 任务队列 ─────────────────────────────────────');
  console.log(`   活跃 ticket: ${report.taskQueue.total}  (${JSON.stringify(report.taskQueue.byStatus)})`);
  if (report.taskQueue.p0.length > 0) {
    console.log(`   [P0] ${report.taskQueue.p0.map((t) => `${t.id}(${t.status})`).join(', ')}`);
  }
  if (report.taskQueue.p1.length > 0) {
    console.log(`   [P1] ${report.taskQueue.p1.map((t) => `${t.id}(${t.status})`).join(', ')}`);
  }
  if (report.inbox.p0Instructions.length > 0) {
    console.log(`   ⚠️  inbox P0 旨意: ${report.inbox.p0Instructions.length} 条 → 立即处理`);
  }

  console.log('');
  console.log('── Q2: Slaver 状态 ──────────────────────────────────');
  if (report.slaverStatus.active.length === 0) {
    console.log('   无活跃 Slaver');
  } else {
    for (const s of report.slaverStatus.active) {
      const staleFlag = s.stale ? ' ⚠️ 超时' : '';
      console.log(`   ${s.id || '未知'} → ${s.ticketId}(${s.status}) [${s.minutesSinceUpdate ?? '?'}min]${staleFlag}`);
    }
  }
  if (report.slaverStatus.waitingOnMaster.length > 0) {
    console.log(`   等待 Master: ${report.slaverStatus.waitingOnMaster.map((t) => `${t.id}(${t.status})`).join(', ')}`);
  }

  console.log('');
  console.log('── Q3: 项目进度 ─────────────────────────────────────');
  console.log(
    `   完成: ${report.progress.doneCount}  进行中: ${report.progress.inFlightCount}  ` +
      `阻塞: ${report.progress.blockedCount}  完成率: ${report.progress.completionRate}%`
  );
  if (report.progress.riskItems.length > 0) {
    for (const r of report.progress.riskItems) {
      console.log(`   ⚠️  ${r}`);
    }
  }

  console.log('');
  console.log('── Q4: 需要决策的问题 ───────────────────────────────');
  if (report.blockedIssues.items.length === 0) {
    console.log('   无需立即决策的阻塞问题');
  } else {
    for (const b of report.blockedIssues.items) {
      console.log(`   ❌ ${b.ticketId}: ${b.reason}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log('');
    console.log('── 推荐操作 ─────────────────────────────────────────');
    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`   ${i + 1}. ${report.recommendations[i]}`);
    }
  }
  console.log('');
}

function printBrief(report: HeartbeatReport): void {
  const icon = HEALTH_ICON[report.health] ?? '⚪';
  const stale = report.slaverStatus.stale.length;
  const waiting = report.slaverStatus.waitingOnMaster.length;
  const p0 = report.inbox.p0Instructions.length;
  console.log(
    `${icon} ${report.health} | active:${report.taskQueue.total} done:${report.progress.doneCount} ` +
      `inFlight:${report.progress.inFlightCount} stale:${stale} waitMaster:${waiting} p0inbox:${p0}`
  );
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerMasterHeartbeat(program: Command): void {
  program
    .command('master:heartbeat')
    .description(
      'Master 心跳自检 — 检查任务队列、Slaver 状态、项目进度、阻塞问题，输出结构化报告'
    )
    .option('--json', '输出纯 JSON（机器可读）')
    .option('--brief', '单行摘要输出')
    .option('--project-root <path>', '项目根目录（默认: 当前目录）', process.cwd())
    .action(
      (options: { json?: boolean; brief?: boolean; projectRoot: string }) => {
        try {
          const projectRoot = path.resolve(options.projectRoot);

          if (!fs.existsSync(projectRoot)) {
            printError({
              code: EketErrorCode.UNKNOWN_ERROR,
              message: `项目根目录不存在: ${projectRoot}`,
            });
            process.exit(1);
          }

          const report = generateReport(projectRoot);

          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
          } else if (options.brief) {
            printBrief(report);
          } else {
            printReport(report);
          }

          // Exit with non-zero if RED (P0 inbox or stale slavers)
          if (report.health === 'RED') {
            process.exit(2);
          }
        } catch (e: unknown) {
          const err = e as { message?: string };
          printError({
            code: EketErrorCode.UNKNOWN_ERROR,
            message: `master:heartbeat 执行失败: ${err.message ?? String(e)}`,
          });
          process.exit(1);
        }
      }
    );
}
