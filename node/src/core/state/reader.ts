/**
 * node/src/core/state/reader.ts — 共享状态读取
 *
 * Shell 对应: lib/state/reader.sh
 *
 * 设计: 对于 Markdown ticket 文件，提取 `**Field**: value` 行作为元数据对象。
 * Markdown 正文（`## Requirements` 等）不在 schema 校验范围。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { getEketRoot } from './env.js';
import { validateTicketId } from './schema.js';

export interface TicketMeta {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  importance?: string;
  epic?: string | null;
  assignee?: string | null;
  branch?: string | null;
  createdAt?: string;
  updatedAt?: string;
  estimatedHours?: number;
  tags?: string[];
  [extra: string]: unknown;
}

function ticketsRoot(): string {
  return join(getEketRoot(), 'jira', 'tickets');
}

/**
 * 定位 ticket 文件：先直查 jira/tickets/<id>.md，然后递归查子目录。
 */
export function locateTicketFile(id: string): string {
  validateTicketId(id);

  const direct = join(ticketsRoot(), `${id}.md`);
  if (existsSync(direct)) {
    return direct;
  }

  const hit = _findRecursive(ticketsRoot(), `${id}.md`);
  if (hit) {
    return hit;
  }

  throw new Error(`ticket not found: ${id}`);
}

function _findRecursive(dir: string, filename: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      const hit = _findRecursive(p, filename);
      if (hit) {
        return hit;
      }
    } else if (entry === filename) {
      return p;
    }
  }
  return null;
}

/**
 * 读取 Markdown 元数据块: `**Field Name**: value`
 *
 * 规范: protocol/conventions/ticket-format.md (待建)
 *
 * @param id     Ticket ID
 * @param field  元数据字段名（snake_case，如 `status` / `created_at`）
 * @returns      原始字符串值，未找到时返回 undefined
 */
export function readTicketField(id: string, field: string): string | undefined {
  const file = locateTicketFile(id);
  const content = readFileSync(file, 'utf-8');

  const fieldTitle = _toTitleCase(field);
  const re = new RegExp(`^\\*\\*${_escapeRegExp(fieldTitle)}\\*\\*:\\s*(.+?)\\s*$`, 'im');
  const match = content.match(re);
  return match ? match[1] : undefined;
}

/** 读完整 ticket 元数据对象 */
export function readTicketMeta(id: string): TicketMeta {
  const file = locateTicketFile(id);
  const content = readFileSync(file, 'utf-8');
  const meta: TicketMeta = { id };

  const re = /^\*\*([^*]+)\*\*:\s*(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const key = _fromTitleCase(match[1]);
    meta[key] = match[2];
  }
  return meta;
}

/** 列出所有 tickets（可按状态过滤） */
export function listTickets(filter?: { status?: string }): string[] {
  const ids: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) {
      return;
    }
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else if (entry.endsWith('.md')) {
        const id = entry.replace(/\.md$/, '');
        if (!/^(FEAT|TASK|FIX|TEST|DEPL|T-DESIGN)-/.test(id)) {
          continue;
        }
        if (filter?.status) {
          const status = readTicketField(id, 'status');
          if (status?.toLowerCase() !== filter.status.toLowerCase()) {
            continue;
          }
        }
        ids.push(id);
      }
    }
  };
  walk(ticketsRoot());
  return ids.sort();
}

// ─── helpers ─────────────────────────────────────────────────────────────
function _toTitleCase(snake: string): string {
  return snake
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function _fromTitleCase(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, '_');
}

function _escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
