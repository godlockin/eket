/**
 * task:create Command
 * Socratic-guided ticket creation with rule-based field inference
 * TASK-110a
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { Command } from 'commander';

import { findProjectRoot } from '../utils/process-cleanup.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketType = 'bug' | 'refactor' | 'chore' | 'feature';
export type TicketPriority = 'P0' | 'P1' | 'P2';

export interface InferredFields {
  title: string;
  type: TicketType;
  priority: TicketPriority;
  background: string;
  detail: string;
  acceptanceCriteria: string;
  clarifications: Array<{ question: string; answer: string }>;
}

// ─── Inference ────────────────────────────────────────────────────────────────

export function inferType(description: string): TicketType {
  const lower = description.toLowerCase();
  if (/bug|fix|错误|修复|crash|崩溃|报错/.test(lower)) return 'bug';
  if (/重构|refactor|cleanup|clean up/.test(lower)) return 'refactor';
  if (/文档|doc|readme|changelog|注释/.test(lower)) return 'chore';
  return 'feature';
}

export function inferPriority(description: string): TicketPriority {
  const lower = description.toLowerCase();
  if (/紧急|p0|生产|production|urgent|critical|线上/.test(lower)) return 'P0';
  if (/重要|p1|important/.test(lower)) return 'P1';
  return 'P2';
}

// ─── Completeness check ───────────────────────────────────────────────────────

export interface CompletenessGaps {
  needsDetail: boolean;
  needsAcceptance: boolean;
}

export function checkCompleteness(detail: string, acceptanceCriteria: string): CompletenessGaps {
  const hasChecklist = /^-\s+\[[ xX]\]/m.test(acceptanceCriteria);
  const nonHeadingLen = acceptanceCriteria
    .split('\n')
    .filter((l) => !/^#{1,4}\s/.test(l))
    .join('\n')
    .trim().length;
  const validAcceptance = hasChecklist || nonHeadingLen >= 50;
  return {
    needsDetail: detail.trim().length < 50,
    needsAcceptance: !validAcceptance,
  };
}

// ─── Next ticket number ───────────────────────────────────────────────────────

export function getNextTicketNumber(ticketsDir: string): number {
  if (!fs.existsSync(ticketsDir)) return 1;
  const files = fs.readdirSync(ticketsDir);
  let max = 0;
  for (const f of files) {
    const m = f.match(/^TASK-(\d+)\.md$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

// ─── Ticket writer ────────────────────────────────────────────────────────────

export function formatTicket(fields: InferredFields, taskId: string): string {
  const typeLabel =
    fields.type === 'bug' ? 'Bug Fix' :
    fields.type === 'refactor' ? 'Refactor' :
    fields.type === 'chore' ? 'Chore' : 'Feature';

  const clarificationSection = fields.clarifications.length > 0
    ? '\n## 澄清记录\n\n' + fields.clarifications
        .map((c, i) => `**Q${i + 1}**: ${c.question}\n**A${i + 1}**: ${c.answer}`)
        .join('\n\n') + '\n'
    : '';

  return `# ${taskId}: ${fields.title}

## 元数据
- **状态**: todo
- **类型**: ${fields.type}
- **优先级**: ${fields.priority}
- **负责人**: 待领取
- **创建时间**: ${new Date().toISOString().slice(0, 10)}
- **依赖**: 无

## 背景

${fields.background}

## 详细描述

${fields.detail}

## 验收标准

${fields.acceptanceCriteria}
${clarificationSection}
---

**类型**: ${typeLabel}
**技能要求**: TypeScript
**依赖**: 无
`;
}

export function writeTicketFile(fields: InferredFields, taskId: string, ticketsDir: string): string {
  fs.mkdirSync(ticketsDir, { recursive: true });
  const filePath = path.join(ticketsDir, `${taskId}.md`);
  fs.writeFileSync(filePath, formatTicket(fields, taskId), 'utf-8');
  return filePath;
}

// ─── Readline helper ──────────────────────────────────────────────────────────

export function createRlInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ─── Main interactive flow ────────────────────────────────────────────────────

export async function runTaskCreate(description: string, rl: readline.Interface, ticketsDir: string): Promise<string> {
  const type = inferType(description);
  const priority = inferPriority(description);

  console.log('\n[推断结果]');
  console.log(`Title: ${description}`);
  console.log(`Type: ${type} | Priority: ${priority}\n`);

  const fields: InferredFields = {
    title: description,
    type,
    priority,
    background: description,
    detail: description,
    acceptanceCriteria: '',
    clarifications: [],
  };

  const gaps = checkCompleteness(fields.detail, fields.acceptanceCriteria);

  if (gaps.needsDetail || gaps.needsAcceptance) {
    console.log('[检测到缺口]');
    let qNum = 1;

    if (gaps.needsDetail) {
      const q = '请描述详细的实现需求（当前描述不足50字）';
      const answer = await question(rl, `Q${qNum}: ${q}：\n> `);
      fields.detail = answer;
      fields.clarifications.push({ question: q, answer });
      qNum++;
    }

    if (gaps.needsAcceptance) {
      const q = '请提供验收标准（至少1条可验证的标准）';
      const answer = await question(rl, `Q${qNum}: ${q}：\n> `);
      fields.acceptanceCriteria = answer;
      fields.clarifications.push({ question: q, answer });
    }
  } else {
    fields.acceptanceCriteria = '- 功能实现完整，通过基本验证';
  }

  // If detail was filled in but acceptance still empty (edge case)
  if (!fields.acceptanceCriteria) {
    fields.acceptanceCriteria = '- 功能实现完整，通过基本验证';
  }

  const nextNum = getNextTicketNumber(ticketsDir);
  const taskId = `TASK-${nextNum}`;
  const filePath = writeTicketFile(fields, taskId, ticketsDir);

  console.log(`\n[生成 ${taskId}]`);
  console.log(`✅ ${filePath} 已创建`);

  return filePath;
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerTaskCreate(program: Command): void {
  program
    .command('task:create <description>')
    .description('AI-guided ticket creation with Socratic completion (rule-based inference)')
    .action(async (description: string) => {
      const projectRoot = (await findProjectRoot()) ?? process.cwd();
      const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
      const rl = createRlInterface();

      try {
        await runTaskCreate(description, rl, ticketsDir);
      } finally {
        rl.close();
      }
    });
}
