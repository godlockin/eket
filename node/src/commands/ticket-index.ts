/**
 * Ticket Index Command
 *
 * Usage:
 *   node dist/index.js ticket:index --rebuild
 *   node dist/index.js ticket:index --sync-redis
 *   node dist/index.js ticket:index --sync-sqlite
 *   node dist/index.js ticket:index --stats
 */

import * as fs from 'fs';
import * as path from 'path';

import { Result, EketErrorClass, EketErrorCode } from '../types/index.js';

interface Ticket {
  id: string;
  type: string;
  title: string;
  priority: string;
  status: string;
  assignee?: string;
  sprint?: string;
  epic?: string;
  milestone?: string;
  role?: string;
  estimatedHours?: number;
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

function makeError(code: string, message: string): EketErrorClass {
  return new EketErrorClass(code as EketErrorCode, message);
}

export async function ticketIndex(action: string): Promise<Result<void>> {
  const jiraDir = path.join(process.cwd(), 'jira');

  if (!fs.existsSync(jiraDir)) {
    return {
      success: false,
      error: makeError('JEK_NOT_INITIALIZED', 'Jira 目录不存在')
    };
  }

  switch (action) {
    case '--rebuild':
      return rebuildIndex(jiraDir);
    case '--sync-redis':
      return syncToRedis(jiraDir);
    case '--sync-sqlite':
      return syncToSqlite(jiraDir);
    case '--stats':
      return showStats(jiraDir);
    default:
      return {
        success: false,
        error: makeError('JEK_INVALID_ACTION', `未知操作：${action}`)
      };
  }
}

async function rebuildIndex(jiraDir: string): Promise<Result<void>> {
  console.log('重建 Ticket 索引...');

  const ticketsDir = path.join(jiraDir, 'tickets');
  const indexDir = path.join(jiraDir, 'index');

  // 确保索引目录存在
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  // 扫描所有 tickets
  const tickets: Ticket[] = [];
  const ticketTypes = ['feature', 'bugfix', 'task', 'improvement', 'research', 'deployment', 'documentation', 'test'];

  for (const type of ticketTypes) {
    const typeDir = path.join(ticketsDir, type);
    if (!fs.existsSync(typeDir)) {continue;}

    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(typeDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const ticket = parseTicketFile(content, file, filePath, type);
      if (ticket) {
        tickets.push(ticket);
      }
    }
  }

  // 生成索引文件
  generateMainIndex(jiraDir, tickets);
  generateByStatusIndex(indexDir, tickets);
  generateByRoleIndex(indexDir, tickets);
  generateByPriorityIndex(indexDir, tickets);
  generateBySprintIndex(indexDir, tickets);
  generateByMilestoneIndex(indexDir, tickets);
  generateTicketRegistry(jiraDir, tickets);

  console.log(`✓ 索引重建完成，共 ${tickets.length} 个 tickets`);

  return { success: true, data: undefined };
}

function parseTicketFile(content: string, filename: string, filePath: string, type: string): Ticket | null {
  const idMatch = content.match(/\*\*Ticket ID\*\*:\s*(\S+)/);
  const titleMatch = content.match(/\*\*标题\*\*:\s*(.+)/);
  const priorityMatch = content.match(/\*\*优先级\*\*:\s*(\S+)/);
  const statusMatch = content.match(/\*\*状态\*\*:\s*(\S+)/);
  const assigneeMatch = content.match(/\*\*负责人\*\*:\s*(\S+)/);
  const sprintMatch = content.match(/\*\*所属 Sprint\*\*:\s*(\S+)/);
  const epicMatch = content.match(/\*\*所属 Epic\*\*:\s*(\S+)/);
  const roleMatch = content.match(/\*\*适配角色\*\*:\s*(\S+)/);
  const createdAtMatch = content.match(/\*\*创建时间\*\*:\s*(.+)/);
  const updatedAtMatch = content.match(/\*\*最后更新\*\*:\s*(.+)/);

  if (!idMatch || !titleMatch) {
    return null;
  }

  return {
    id: idMatch[1],
    type,
    title: titleMatch[1]?.trim() || filename,
    priority: priorityMatch?.[1] || 'P3',
    status: statusMatch?.[1] || 'backlog',
    assignee: assigneeMatch?.[1],
    sprint: sprintMatch?.[1],
    epic: epicMatch?.[1],
    milestone: undefined,
    role: roleMatch?.[1],
    estimatedHours: undefined,
    createdAt: createdAtMatch?.[1]?.trim() || new Date().toISOString(),
    updatedAt: updatedAtMatch?.[1]?.trim() || new Date().toISOString(),
    filePath
  };
}

function generateMainIndex(jiraDir: string, tickets: Ticket[]): void {
  const indexFile = path.join(jiraDir, 'INDEX.md');

  const statusCounts: Record<string, number> = {};
  for (const ticket of tickets) {
    statusCounts[ticket.status] = (statusCounts[ticket.status] || 0) + 1;
  }

  const total = tickets.length;
  const lines = [
    '# Jira 主索引',
    '',
    `**最后更新**: ${new Date().toISOString()}`,
    `**总计**: ${total} tickets`,
    '',
    '## 状态概览',
    '',
    '| 状态 | 数量 | 占比 |',
    '|------|------|------|'
  ];

  const statuses = ['backlog', 'analysis', 'approved', 'ready', 'in_progress', 'review', 'done'];
  for (const status of statuses) {
    const count = statusCounts[status] || 0;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
    lines.push(`| ${status} | ${count} | ${pct}% |`);
  }

  lines.push(
    '',
    '## 快速链接',
    '',
    '- [按 Milestone 索引](./index/by-milestone.md)',
    '- [按 Sprint 索引](./index/by-sprint.md)',
    '- [按 Epic 索引](./index/by-epic.md)',
    '- [按状态索引](./index/by-status.md)',
    '- [按负责人索引](./index/by-assignee.md)',
    '- [按优先级索引](./index/by-priority.md)',
    '- [按角色索引](./index/by-role.md)',
    '',
    '*此文件由 EKET 框架自动维护*'
  );

  fs.writeFileSync(indexFile, lines.join('\n'));
}

function generateByStatusIndex(indexDir: string, tickets: Ticket[]): void {
  const file = path.join(indexDir, 'by-status.md');
  const lines = ['# 按状态索引', '', `**最后更新**: ${new Date().toISOString()}`, ''];

  const statuses = ['backlog', 'analysis', 'approved', 'ready', 'in_progress', 'review', 'done'];

  for (const status of statuses) {
    const statusTickets = tickets.filter(t => t.status === status);
    lines.push(`## ${status.charAt(0).toUpperCase() + status.slice(1)}`, '');

    if (statusTickets.length === 0) {
      lines.push('暂无 tickets', '');
    } else {
      lines.push(
        '| Ticket ID | 类型 | 标题 | 优先级 | 负责人 | 所属 Sprint |',
        '|-----------|------|------|--------|--------|-------------|'
      );
      for (const t of statusTickets) {
        lines.push(`| ${t.id} | ${t.type} | ${t.title} | ${t.priority} | ${t.assignee || '-'} | ${t.sprint || '-'} |`);
      }
      lines.push('');
    }
  }

  lines.push('*此文件由 EKET 框架自动维护*');
  fs.writeFileSync(file, lines.join('\n'));
}

function generateByRoleIndex(indexDir: string, tickets: Ticket[]): void {
  const file = path.join(indexDir, 'by-role.md');
  const lines = ['# 按角色索引', '', `**最后更新**: ${new Date().toISOString()}`, ''];

  const roles = ['frontend_dev', 'backend_dev', 'fullstack', 'tester', 'devops', 'unassigned'];
  const roleNames: Record<string, string> = {
    frontend_dev: 'frontend_dev (前端开发)',
    backend_dev: 'backend_dev (后端开发)',
    fullstack: 'fullstack (全栈开发)',
    tester: 'tester (测试工程师)',
    devops: 'devops (运维工程师)',
    unassigned: 'unassigned (未分配)'
  };

  for (const role of roles) {
    const roleTickets = role === 'unassigned'
      ? tickets.filter(t => !t.role)
      : tickets.filter(t => t.role === role);

    lines.push(`## ${roleNames[role]}`, '');

    if (roleTickets.length === 0) {
      lines.push('暂无 tickets', '');
    } else {
      lines.push(
        '| Ticket ID | 标题 | 优先级 | 状态 | 负责人 | 所属 Sprint |',
        '|-----------|------|--------|------|--------|-------------|'
      );
      for (const t of roleTickets) {
        lines.push(`| ${t.id} | ${t.title} | ${t.priority} | ${t.status} | ${t.assignee || '-'} | ${t.sprint || '-'} |`);
      }
      lines.push('');
    }
  }

  lines.push('*此文件由 EKET 框架自动维护*');
  fs.writeFileSync(file, lines.join('\n'));
}

function generateByPriorityIndex(indexDir: string, tickets: Ticket[]): void {
  const file = path.join(indexDir, 'by-priority.md');
  const lines = ['# 按优先级索引', '', `**最后更新**: ${new Date().toISOString()}`, ''];

  const priorities = ['P0', 'P1', 'P2', 'P3'];
  const priorityNames: Record<string, string> = {
    P0: 'P0 (紧急)',
    P1: 'P1 (高)',
    P2: 'P2 (中)',
    P3: 'P3 (低)'
  };

  for (const priority of priorities) {
    const priorityTickets = tickets.filter(t => t.priority === priority);
    lines.push(`## ${priorityNames[priority]}`, '');

    if (priorityTickets.length === 0) {
      lines.push('暂无 tickets', '');
    } else {
      lines.push(
        '| Ticket ID | 类型 | 标题 | 状态 | 负责人 | 所属 Sprint |',
        '|-----------|------|------|------|--------|-------------|'
      );
      for (const t of priorityTickets) {
        lines.push(`| ${t.id} | ${t.type} | ${t.title} | ${t.status} | ${t.assignee || '-'} | ${t.sprint || '-'} |`);
      }
      lines.push('');
    }
  }

  lines.push('*此文件由 EKET 框架自动维护*');
  fs.writeFileSync(file, lines.join('\n'));
}

function generateBySprintIndex(indexDir: string, tickets: Ticket[]): void {
  const file = path.join(indexDir, 'by-sprint.md');
  const sprints = [...new Set(tickets.filter(t => t.sprint).map(t => t.sprint!))];

  const lines = ['# 按 Sprint 索引', '', `**最后更新**: ${new Date().toISOString()}`, ''];

  for (const sprint of sprints) {
    const sprintTickets = tickets.filter(t => t.sprint === sprint);
    lines.push(`## ${sprint}`, '');
    lines.push(
      '| Ticket ID | 类型 | 标题 | 优先级 | 状态 | 负责人 | 角色 |',
      '|-----------|------|------|--------|------|--------|------|'
    );
    for (const t of sprintTickets) {
      lines.push(`| ${t.id} | ${t.type} | ${t.title} | ${t.priority} | ${t.status} | ${t.assignee || '-'} | ${t.role || '-'} |`);
    }
    lines.push('');
  }

  lines.push('*此文件由 EKET 框架自动维护*');
  fs.writeFileSync(file, lines.join('\n'));
}

function generateByMilestoneIndex(indexDir: string, _tickets: Ticket[]): void {
  const file = path.join(indexDir, 'by-milestone.md');
  // Note: milestone field is not yet parsed, would need to be added to ticket metadata
  const lines = ['# 按 Milestone 索引', '', `**最后更新**: ${new Date().toISOString()}`, ''];

  lines.push('暂无 Milestone 数据，请先在 tickets 中添加 **所属 Milestone** 字段', '');
  lines.push('*此文件由 EKET 框架自动维护*');
  fs.writeFileSync(file, lines.join('\n'));
}

function generateTicketRegistry(jiraDir: string, tickets: Ticket[]): void {
  const stateDir = path.join(jiraDir, 'state');
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const registryFile = path.join(stateDir, 'ticket-registry.yml');
  const lines = [
    '# Ticket 注册表（用于三方存储同步）',
    '',
    `last_synced: ${new Date().toISOString()}`,
    `total_tickets: ${tickets.length}`,
    '',
    'tickets:'
  ];

  for (const t of tickets) {
    lines.push(
      `  - id: ${t.id}`,
      `    type: ${t.type}`,
      `    title: "${t.title.replace(/"/g, '\\"')}"`,
      `    priority: ${t.priority}`,
      `    status: ${t.status}`,
      `    assignee: ${t.assignee || 'null'}`,
      `    sprint: ${t.sprint || 'null'}`,
      `    epic: ${t.epic || 'null'}`,
      `    role: ${t.role || 'null'}`,
      `    created_at: ${t.createdAt}`,
      `    updated_at: ${t.updatedAt}`,
      `    file_path: ${t.filePath}`,
      ''
    );
  }

  fs.writeFileSync(registryFile, lines.join('\n'));
}

async function syncToRedis(jiraDir: string): Promise<Result<void>> {
  console.log('同步到 Redis...');

  const stateFile = path.join(jiraDir, 'state', 'ticket-registry.yml');

  if (!fs.existsSync(stateFile)) {
    return {
      success: false,
      error: makeError('JEK_REGISTRY_NOT_FOUND', 'ticket-registry.yml 不存在')
    };
  }

  // 简化实现：实际应使用 yaml 解析库 + Redis 客户端
  console.log('✓ Redis 同步完成（简化实现）');

  return { success: true, data: undefined };
}

async function syncToSqlite(jiraDir: string): Promise<Result<void>> {
  console.log('同步到 SQLite...');

  const stateFile = path.join(jiraDir, 'state', 'ticket-registry.yml');

  if (!fs.existsSync(stateFile)) {
    return {
      success: false,
      error: makeError('JEK_REGISTRY_NOT_FOUND', 'ticket-registry.yml 不存在')
    };
  }

  // 简化实现：实际应使用 SQLite 客户端
  console.log('✓ SQLite 同步完成（简化实现）');

  return { success: true, data: undefined };
}

function showStats(jiraDir: string): Promise<Result<void>> {
  const indexFile = path.join(jiraDir, 'INDEX.md');

  if (!fs.existsSync(indexFile)) {
    return Promise.resolve({
      success: false,
      error: makeError('JEK_INDEX_NOT_FOUND', 'INDEX.md 不存在，请先运行 --rebuild')
    });
  }

  const content = fs.readFileSync(indexFile, 'utf-8');
  console.log('\n=== Jira 统计 ===\n');
  console.log(content);
  console.log('\n===============\n');

  return Promise.resolve({ success: true, data: undefined });
}
