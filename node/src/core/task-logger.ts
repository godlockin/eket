/**
 * EKET Framework - Task Logger
 *
 * 提供两个核心功能：
 * 1. appendTaskMessage — 向 ticket 文件追加执行日志
 * 2. injectActiveContext — 刷新 .eket/ACTIVE_CONTEXT.md 活跃上下文
 */

import * as fs from 'fs';
import * as path from 'path';

import { findProjectRoot } from '../utils/process-cleanup.js';
import {
  parseAssignedExperts,
  loadExpertProfiles,
  formatExpertSection,
} from './expert-loader.js';

// ============================================================================
// appendTaskMessage
// ============================================================================

/**
 * 向 ticket 文件末尾追加一条执行日志消息。
 *
 * @param ticketId - ticket ID（如 TASK-078）
 * @param message  - 日志内容
 * @param author   - 写入者（如 slaver ID 或角色名）
 */
export async function appendTaskMessage(
  ticketId: string,
  message: string,
  author: string
): Promise<void> {
  const projectRoot = await findProjectRoot();
  if (!projectRoot) {return;}

  const ticketFile = findTicketFile(projectRoot, ticketId);
  if (!ticketFile) {
    console.warn(`[TaskLogger] Ticket file not found: ${ticketId}`);
    return;
  }

  const timestamp = new Date().toISOString();
  const logEntry = `\n> [${timestamp}] **${author}**: ${message}`;

  // 确保文件末尾有"## 执行日志"节
  let content = fs.readFileSync(ticketFile, 'utf-8');
  if (!content.includes('## 执行日志')) {
    content += '\n\n## 执行日志\n';
    fs.writeFileSync(ticketFile, content, 'utf-8');
  }

  fs.appendFileSync(ticketFile, logEntry + '\n', 'utf-8');
}

/**
 * 查找 ticket 文件（跨 feature/bugfix/task/improvement 子目录）
 */
function findTicketFile(projectRoot: string, ticketId: string): string | null {
  const jiraPath = path.join(projectRoot, 'jira', 'tickets');
  const dirs = ['feature', 'bugfix', 'task', 'improvement', 'fix'];

  for (const dir of dirs) {
    const filePath = path.join(jiraPath, dir, `${ticketId}.md`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

// ============================================================================
// injectActiveContext
// ============================================================================

export interface ActiveContextData {
  ticketId: string;
  role: string;
  slaverId: string;
  claimedAt: string;
  status: string;
}

/**
 * 刷新 .eket/ACTIVE_CONTEXT.md，写入当前 Slaver 活跃上下文。
 * Slaver 启动时读取该文件，快速恢复工作现场。
 *
 * 若 ticket 中含 assigned_experts 字段，自动加载对应 expert profile，
 * 以 <details> 折叠块注入到上下文底部，Slaver 可直接参照专家视角工作。
 *
 * @param data - 上下文数据
 */
export async function injectActiveContext(data: ActiveContextData): Promise<void> {
  const projectRoot = await findProjectRoot();
  if (!projectRoot) {return;}

  const ekeDir = path.join(projectRoot, '.eket');
  fs.mkdirSync(ekeDir, { recursive: true });

  // ── 读取 ticket，解析 assigned_experts ──
  let expertSection = '';
  try {
    const ticketFile = findTicketFile(projectRoot, data.ticketId);
    if (ticketFile) {
      const ticketContent = fs.readFileSync(ticketFile, 'utf-8');
      const expertIds = parseAssignedExperts(ticketContent);
      if (expertIds.length > 0) {
        const loaded = loadExpertProfiles(expertIds);
        expertSection = formatExpertSection(loaded);
        if (loaded.missing.length > 0) {
          console.warn(`[experts] Profile not found for: ${loaded.missing.join(', ')}`);
        }
        console.log(`[experts] Loaded: [${expertIds.join(', ')}]`);
      }
    }
  } catch {
    // expert loading is best-effort, never block claim
  }

  const contextPath = path.join(ekeDir, 'ACTIVE_CONTEXT.md');
  const content = `# ACTIVE_CONTEXT — Slaver 活跃上下文
> 由 injectActiveContext() 自动生成，每次 claim 后刷新。

## 当前任务

| 字段 | 值 |
|------|----|
| Ticket ID | \`${data.ticketId}\` |
| 角色 | \`${data.role}\` |
| Slaver ID | \`${data.slaverId}\` |
| 领取时间 | ${data.claimedAt} |
| 状态 | \`${data.status}\` |

## 快速导航

- Ticket 文件：\`jira/tickets/**/${data.ticketId}.md\`
- 执行日志：见 ticket 末尾 \`## 执行日志\` 节
- 工作区：\`.eket/worktrees/${data.ticketId}/\`

## 下一步

1. 读取 ticket 文件，确认验收标准
2. 检查依赖（blocked_by 字段）
3. 参照专家 profile（见下方）撰写分析报告后开始编码
${expertSection ? '\n' + expertSection : ''}`;

  fs.writeFileSync(contextPath, content, 'utf-8');
}

/**
 * 读取并返回 ACTIVE_CONTEXT.md 内容（不存在则返回 null）
 */
export function readActiveContext(projectRoot: string): string | null {
  const contextPath = path.join(projectRoot, '.eket', 'ACTIVE_CONTEXT.md');
  if (!fs.existsSync(contextPath)) {return null;}
  return fs.readFileSync(contextPath, 'utf-8');
}
