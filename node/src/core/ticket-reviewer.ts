/**
 * Ticket Reviewer - Slaver 自主 ticket 完整性 review
 * 在 task:claim 成功后、开始执行前，校验 ticket 质量
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ReviewResult {
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

/**
 * 从 Markdown 内容中提取指定章节的正文（行扫描法，可靠）
 */
function extractSection(content: string, sectionName: string): string | null {
  const lines = content.split('\n');
  const headingRe = new RegExp(`^#{1,4}\\s+${sectionName}\\s*$`);
  const anyHeadingRe = /^#{1,4}\s+/;

  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (!inSection) {
      if (headingRe.test(line.trim())) {
        inSection = true;
      }
    } else {
      if (anyHeadingRe.test(line)) {
        break;
      }
      sectionLines.push(line);
    }
  }

  if (!inSection) return null;
  return sectionLines.join('\n').trim();
}

/**
 * 解析依赖 ticket ID 列表
 */
function parseDependencies(content: string): string[] {
  const ids: string[] = [];
  const depLineRegex = /\*{0,2}依赖\*{0,2}\s*[:：]\s*(.+)/gi;
  let m: RegExpExecArray | null;
  while ((m = depLineRegex.exec(content)) !== null) {
    const raw = m[1];
    const idRegex = /[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+[a-z]*/g;
    let id: RegExpExecArray | null;
    while ((id = idRegex.exec(raw)) !== null) {
      ids.push(id[0]);
    }
  }
  return [...new Set(ids)];
}

/**
 * 在 jira/tickets 目录下寻找 ticket 文件
 */
function findTicketFile(projectRoot: string, ticketId: string): string | null {
  const base = path.join(projectRoot, 'jira', 'tickets');
  const dirs = ['', 'feature', 'bugfix', 'task', 'improvement'];
  for (const dir of dirs) {
    const p = dir ? path.join(base, dir, `${ticketId}.md`) : path.join(base, `${ticketId}.md`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 判断 ticket 状态是否为已完成
 */
function isTicketDone(content: string): boolean {
  return /\*{0,2}状态\*{0,2}\s*[:：]\s*(done|completed|✅)/i.test(content);
}

/**
 * 校验验收标准章节：
 * - 章节缺失/空 → fail
 * - 有至少一个 checklist 项（- [ ] 或 - [x]）→ pass
 * - 或有 ≥50 chars 的非标题正文 → pass
 * - 否则 → fail
 */
export function checkAcceptanceCriteria(content: string): { pass: boolean; issue?: string } {
  const section = extractSection(content, '验收标准') ?? extractSection(content, 'Acceptance Criteria');

  if (section === null) {
    return { pass: false, issue: '验收标准章节缺失' };
  }

  const trimmed = section.trim();
  if (trimmed.length === 0) {
    return { pass: false, issue: '验收标准章节为空' };
  }

  // Check for checklist items
  if (/^-\s+\[[ xX]\]/m.test(trimmed)) {
    return { pass: true };
  }

  // Strip heading lines, check remaining text length
  const nonHeadingText = trimmed
    .split('\n')
    .filter((line) => !/^#{1,4}\s/.test(line))
    .join('\n')
    .trim();

  if (nonHeadingText.length >= 50) {
    return { pass: true };
  }

  return { pass: false, issue: '验收标准内容不足（需要 checklist 项或 ≥50 字描述）' };
}

/**
 * 主校验函数：读取 ticket Markdown，执行完整性检查
 */
export async function reviewTicket(ticketPath: string): Promise<ReviewResult> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  let content: string;
  try {
    content = fs.readFileSync(ticketPath, 'utf-8');
  } catch (e: unknown) {
    const err = e as { message?: string };
    return {
      passed: false,
      issues: [`无法读取 ticket 文件: ${err.message ?? ticketPath}`],
      suggestions: [],
    };
  }

  // 1. 检查「详细描述」章节
  const description = extractSection(content, '详细描述');
  if (description === null) {
    issues.push('详细描述不足（<30字），无法实现');
  } else if (description.replace(/\s/g, '').length < 30) {
    issues.push('详细描述不足（<30字），无法实现');
  }

  // 2. 检查「验收标准」章节
  const acResult = checkAcceptanceCriteria(content);
  if (!acResult.pass) {
    issues.push(acResult.issue ?? '验收标准缺失，无法验收');
  }

  // 3. 检查依赖 ticket 完成状态
  const depIds = parseDependencies(content);
  if (depIds.length > 0) {
    const projectRoot = path.resolve(ticketPath, '..', '..', '..');
    for (const depId of depIds) {
      const depFile = findTicketFile(projectRoot, depId);
      if (!depFile) {
        issues.push(`依赖 ${depId} 未完成`);
        continue;
      }
      const depContent = fs.readFileSync(depFile, 'utf-8');
      if (!isTicketDone(depContent)) {
        issues.push(`依赖 ${depId} 未完成`);
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    suggestions,
  };
}
