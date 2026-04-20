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
import { DependencyInferrer } from '../core/dependency-inferrer.js';

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

export function formatTicket(fields: InferredFields & { deps?: string[] }, taskId: string): string {
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
- **依赖**: ${fields.deps && fields.deps.length > 0 ? fields.deps.join(', ') : '无'}

${fields.background}

## 详细描述

${fields.detail}

## 验收标准

${fields.acceptanceCriteria}
${clarificationSection}
---

**类型**: ${typeLabel}
**技能要求**: TypeScript
**依赖**: ${fields.deps && fields.deps.length > 0 ? fields.deps.join(', ') : '无'}
`;
}

export function writeTicketFile(fields: InferredFields & { deps?: string[] }, taskId: string, ticketsDir: string): string {
  fs.mkdirSync(ticketsDir, { recursive: true });
  const filePath = path.join(ticketsDir, `${taskId}.md`);
  fs.writeFileSync(filePath, formatTicket(fields, taskId), 'utf-8');
  return filePath;
}

// ─── Dependency loader ────────────────────────────────────────────────────────

export async function inferDependencies(
  content: string,
  ticketsDir: string,
): Promise<import('../core/dependency-inferrer.js').DependencyCandidate[]> {
  if (!fs.existsSync(ticketsDir)) return [];
  const files = fs.readdirSync(ticketsDir)
    .filter((f) => /^TASK-\d+\.md$/.test(f))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(ticketsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 50)
    .map(({ name }) => ({
      id: name.replace('.md', ''),
      content: fs.readFileSync(path.join(ticketsDir, name), 'utf-8'),
    }));
  const inferrer = new DependencyInferrer();
  return inferrer.inferDependencies(content, files);
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

  // ─── Dependency inference ────────────────────────────────────────────────────
  const inferredDeps = await inferDependencies(
    [fields.title, fields.background, fields.detail, fields.acceptanceCriteria].join('\n'),
    ticketsDir,
  );
  if (inferredDeps.length > 0) {
    console.log('\n[推断依赖]');
    const confirmedDeps: string[] = [];
    let skipAll = false;
    for (const cand of inferredDeps) {
      if (skipAll) break;
      console.log(`- ${cand.ticketId}（置信度 ${cand.confidence}）：匹配关键词: ${cand.reason}`);
      const ans = await question(rl, `确认加入依赖？[Y/n/s(跳过所有)] `);
      const trimmed = ans.trim().toLowerCase();
      if (trimmed === 's') { skipAll = true; break; }
      if (trimmed === '' || trimmed === 'y') confirmedDeps.push(cand.ticketId);
    }
    if (confirmedDeps.length > 0) {
      // Patch formatTicket result: replace "依赖: 无" with confirmed deps
      fields.background = fields.background; // no-op, deps injected via metadata below
      // Store deps in a custom property we handle in formatTicket
      (fields as InferredFields & { deps?: string[] }).deps = confirmedDeps;
    }
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
