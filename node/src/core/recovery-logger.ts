/**
 * Context Overflow Recovery Logger
 * 负责记录 400 错误恢复过程 + 保存 task context
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { readFileSync } from 'fs';

export interface LogEntry {
  errorType: string;
  recoveryStrategy: 'detected' | 'compact_retry' | 'nuclear_restart' | 'none';
  result: 'initiating' | 'recovered' | 'failed' | 'rejected';
  projectRoot: string;
  sessionId?: string;
  taskId?: string;
}

export interface SaveContextOptions {
  projectRoot: string;
  taskId: string;
  prompt: string;
}

/**
 * 记录 context overflow 事件到日志文件
 * @param entry - 日志条目
 */
export async function logContextOverflow(entry: LogEntry): Promise<void> {
  const logPath = path.join(entry.projectRoot, '.eket', 'logs', 'context-overflow.log');

  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });

    const timestamp = new Date().toISOString();
    const sessionId = entry.sessionId || 'unknown';
    const taskId = entry.taskId || readTaskIdFromProfile(entry.projectRoot);

    const logLine = `[${timestamp}] sessionId=${sessionId}, taskId=${taskId}, error_type=${entry.errorType}, recovery=${entry.recoveryStrategy}, result=${entry.result}\n`;

    await fs.appendFile(logPath, logLine);
  } catch (error) {
    // 日志失败不应阻塞恢复流程，仅警告
    console.warn('⚠️  Failed to write context-overflow.log:', error);
  }
}

/**
 * 保存 task context 到恢复目录（Nuclear Option 用）
 * @param opts - context 保存选项
 */
export async function saveTaskContext(opts: SaveContextOptions): Promise<void> {
  const recoveryPath = path.join(
    opts.projectRoot,
    '.eket/recovery',
    `task-${opts.taskId}-context.md`
  );

  try {
    await fs.mkdir(path.dirname(recoveryPath), { recursive: true });

    const content = `# Task Context Recovery

**Task ID**: ${opts.taskId}
**Timestamp**: ${new Date().toISOString()}
**Reason**: Context overflow (200k tokens exceeded)

## Last Prompt
\`\`\`
${opts.prompt}
\`\`\`

## Recovery Instructions
Session was restarted due to context overflow. Previous analysis is lost.

Refer to ticket file for original requirements:
- jira/tickets/EPIC-006/${opts.taskId}/
`;

    await fs.writeFile(recoveryPath, content);
    console.log(`💾 Task context saved: ${recoveryPath}`);
  } catch (error) {
    console.error('❌ Failed to save task context:', error);
    throw error; // Context 保存失败应该抛出，这是关键数据
  }
}

/**
 * 从 agent_profile.yml 读取当前 task ID
 * @param projectRoot - 项目根目录
 * @returns task ID 或 'unknown'
 */
function readTaskIdFromProfile(projectRoot: string): string {
  try {
    const profilePath = path.join(projectRoot, '.eket', 'state', 'agent_profile.yml');
    const content = readFileSync(profilePath, 'utf-8');
    const match = content.match(/^current_ticket:\s*(.+)$/m);
    return match ? match[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}
