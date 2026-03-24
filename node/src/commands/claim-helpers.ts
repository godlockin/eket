/**
 * Task Claim Command - Types and Helpers
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 加载项目配置
 */
export async function loadConfig(projectRoot: string): Promise<Record<string, unknown> | null> {
  const configPath = path.join(projectRoot, '.eket', 'config.yml');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  // 简单解析 YAML (实际项目中应使用 yaml 库)
  const content = fs.readFileSync(configPath, 'utf-8');
  // TODO: 使用 yaml.parse(content)
  return { raw: content };
}

/**
 * 获取任务列表
 */
export async function getTickets(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<
  Array<{
    id: string;
    title: string;
    priority: string;
    tags: string[];
    status: string;
  }>
> {
  const jiraPath = path.join(projectRoot, 'jira', 'tickets');
  const tickets: Array<{
    id: string;
    title: string;
    priority: string;
    tags: string[];
    status: string;
  }> = [];

  if (!fs.existsSync(jiraPath)) {
    return [];
  }

  // 读取所有任务文件
  const dirs = ['feature', 'bugfix', 'task', 'improvement'];
  for (const dir of dirs) {
    const ticketDir = path.join(jiraPath, dir);
    if (fs.existsSync(ticketDir)) {
      const files = fs.readdirSync(ticketDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(ticketDir, file), 'utf-8');
        const ticket = parseTicket(file, content);
        if (ticket && ticket.status === 'ready') {
          tickets.push(ticket);
        }
      }
    }
  }

  // 按优先级排序
  tickets.sort((a, b) => {
    const priorityOrder: Record<string, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return tickets;
}

/**
 * 解析任务文件
 */
export function parseTicket(filename: string, content: string): {
  id: string;
  title: string;
  priority: string;
  tags: string[];
  status: string;
} | null {
  // 简单解析 Markdown frontmatter
  const id = filename.replace('.md', '');
  const titleMatch = content.match(/^# (.+)$/m);
  const priorityMatch = content.match(/\*\*优先级\*\*:\s*(\w+)/i);
  const tagsMatch = content.match(/\*\*标签\*\*:\s*([^\n]+)/i);
  const statusMatch = content.match(/\*\*状态\*\*:\s*(\w+)/i);

  if (!titleMatch) {
    return null;
  }

  return {
    id,
    title: titleMatch[1],
    priority: priorityMatch?.[1] || 'normal',
    tags: tagsMatch?.[1].split(',').map((t: string) => t.trim()) || [],
    status: statusMatch?.[1] || 'backlog',
  };
}

/**
 * 匹配角色
 */
export async function matchRole(
  ticket: { id: string; title: string; tags: string[] },
  config: Record<string, unknown>
): Promise<string> {
  // 根据标签匹配角色
  const roleMapping: Record<string, string> = {
    frontend: 'frontend_dev',
    ui: 'frontend_dev',
    react: 'frontend_dev',
    vue: 'frontend_dev',
    backend: 'backend_dev',
    api: 'backend_dev',
    database: 'backend_dev',
    test: 'qa_engineer',
    qa: 'qa_engineer',
    devops: 'devops_engineer',
    deploy: 'devops_engineer',
    docker: 'devops_engineer',
    docs: 'doc_monitor',
    documentation: 'doc_monitor',
  };

  for (const tag of ticket.tags) {
    const tagLower = tag.toLowerCase();
    if (roleMapping[tagLower]) {
      return roleMapping[tagLower];
    }
  }

  // 默认角色
  return 'backend_dev';
}

/**
 * 初始化 Profile
 */
export async function initializeProfile(
  projectRoot: string,
  role: string,
  ticket: { id: string; title: string }
): Promise<void> {
  const profileDir = path.join(projectRoot, '.eket', 'state');
  fs.mkdirSync(profileDir, { recursive: true });

  const profilePath = path.join(profileDir, 'agent_profile.yml');
  const profile = `role: slaver
agent_type: ${role}
current_ticket: ${ticket.id}
current_ticket_title: ${ticket.title}
started_at: ${new Date().toISOString()}
`;

  fs.writeFileSync(profilePath, profile);
}

/**
 * 发送消息到消息队列
 */
export async function sendClaimMessage(
  projectRoot: string,
  ticketId: string,
  role: string
): Promise<void> {
  const queueDir = path.join(projectRoot, '.eket', 'data', 'queue');
  fs.mkdirSync(queueDir, { recursive: true });

  const messageId = `msg_${Date.now()}_${ticketId}`;
  const messageFile = path.join(queueDir, `${messageId}.json`);

  const message = {
    id: messageId,
    timestamp: new Date().toISOString(),
    type: 'task_claimed',
    from: `agent_${role}`,
    to: 'coordinator',
    payload: {
      ticket_id: ticketId,
      role: role,
      status: 'in_progress',
    },
  };

  fs.writeFileSync(messageFile, JSON.stringify(message, null, 2));
}
