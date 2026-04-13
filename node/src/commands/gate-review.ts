/**
 * Gate Review Command
 *
 * 执行前关卡审查：校验 ticket 可执行性，输出 APPROVE / VETO 报告
 *
 * Usage:
 *   node dist/index.js gate:review <ticket-id>
 *   node dist/index.js gate:review <ticket-id> --auto-approve
 *   node dist/index.js gate:review <ticket-id> --force-veto "缺少技术方案"
 *   node dist/index.js gate:review                # 扫描所有 gate_review 状态的 tickets
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { Command } from 'commander';

import { EketErrorClass, EketErrorCode, type Result } from '../types/index.js';
import { printError } from '../utils/error-handler.js';

// ============================================================================
// Types
// ============================================================================

export type GateReviewDecision = 'APPROVE' | 'VETO';

export interface GateReviewDimension {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  note: string;
}

export interface GateReviewReport {
  ticketId: string;
  reviewTime: string;
  decision: GateReviewDecision;
  vetoCount: number; // current count after this review
  maxVetoCount: number; // 2 = soft limit, 3rd auto-approves
  forcedApprove: boolean; // true if veto count exceeded limit
  dimensions: GateReviewDimension[];
  vetoDetails?: {
    defects: string[];
    resubmitConditions: string[];
  };
  approveRisks?: string[];
}

interface TicketParseResult {
  id: string;
  status: string;
  title: string;
  acceptanceCriteria: boolean; // has non-empty acceptance criteria section
  technicalDesign: boolean; // has non-empty technical design section
  dependencies: string[];
  vetoCount: number;
  filePath: string;
  content: string;
}

// ============================================================================
// Ticket parsing helpers
// ============================================================================

function parseField(content: string, pattern: RegExp): string {
  const m = content.match(pattern);
  return m ? (m[1] ?? '').trim() : '';
}

function parseTicket(filePath: string): Result<TicketParseResult> {
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: new EketErrorClass(EketErrorCode.TICKET_NOT_FOUND, `Ticket file not found: ${filePath}`),
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  const idMatch = content.match(/\*\*Ticket ID\*\*:\s*(\S+)/);
  const idFromFilename = path.basename(filePath, '.md');
  const id = idMatch ? (idMatch[1] ?? idFromFilename) : idFromFilename;

  const status = parseField(content, /\*\*状态\*\*:\s*(\S+)/);
  const title =
    parseField(content, /\*\*标题\*\*:\s*(.+)/) ||
    (content.match(/^#\s+.+?:\s+(.+)/m) ?? [])[1] ||
    id;

  // Check if acceptance criteria section has content
  const acSection = content.match(/##\s*(?:验收标准|acceptance.criteria)[^\n]*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i);
  const acceptanceCriteria =
    acSection !== null && acSection !== undefined
      ? (acSection[1] ?? '').trim().length > 20
      : false;

  // Check if technical design section has content
  const tdSection = content.match(/##\s*(?:技术方案|technical.design)[^\n]*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i);
  const technicalDesign =
    tdSection !== null && tdSection !== undefined
      ? (tdSection[1] ?? '').trim().length > 20
      : false;

  // Parse dependencies
  const depsMatch = content.match(/blocked_by:\s*\n((?:\s*-\s*\S+\n?)+)/);
  const dependencies: string[] = [];
  if (depsMatch) {
    const depLines = (depsMatch[1] ?? '').match(/-\s*(\S+)/g) || [];
    for (const line of depLines) {
      const dep = line.replace(/^-\s*/, '').trim();
      if (dep) dependencies.push(dep);
    }
  }

  // Parse veto count (gate_review_veto_count field)
  const vetoCountMatch = content.match(/\*\*gate_review_veto_count\*\*:\s*(\d+)/);
  const vetoCount = vetoCountMatch ? parseInt(vetoCountMatch[1] ?? '0', 10) : 0;

  return {
    success: true,
    data: {
      id,
      status,
      title,
      acceptanceCriteria,
      technicalDesign,
      dependencies,
      vetoCount,
      filePath,
      content,
    },
  };
}

// ============================================================================
// Find ticket file by ID
// ============================================================================

function findTicketFile(projectRoot: string, ticketId: string): string | null {
  const jiraDir = path.join(projectRoot, 'jira');
  if (!fs.existsSync(jiraDir)) return null;

  // Search common locations
  const searchDirs = [
    jiraDir,
    path.join(jiraDir, 'tickets'),
    path.join(jiraDir, 'tickets', 'feature'),
    path.join(jiraDir, 'tickets', 'task'),
    path.join(jiraDir, 'tickets', 'bugfix'),
    path.join(jiraDir, 'tickets', 'improvement'),
    path.join(jiraDir, 'tickets', 'research'),
    path.join(jiraDir, 'tickets', 'deployment'),
    path.join(jiraDir, 'tickets', 'documentation'),
    path.join(jiraDir, 'tickets', 'test'),
  ];

  const upper = ticketId.toUpperCase();
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const candidate = path.join(dir, `${upper}.md`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ============================================================================
// Find all tickets in gate_review status
// ============================================================================

function findGateReviewTickets(projectRoot: string): string[] {
  const jiraDir = path.join(projectRoot, 'jira');
  if (!fs.existsSync(jiraDir)) return [];

  const results: string[] = [];

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scanDir(path.join(dir, entry.name));
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(dir, entry.name);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (/\*\*状态\*\*:\s*gate_review/.test(content)) {
          results.push(filePath);
        }
      }
    }
  }

  scanDir(jiraDir);
  return results;
}

// ============================================================================
// Core review logic
// ============================================================================

function runGateReview(
  ticket: TicketParseResult,
  options: { autoApprove?: boolean; forceVetoReason?: string }
): GateReviewReport {
  const reviewTime = new Date().toISOString();
  const dimensions: GateReviewDimension[] = [];
  const vetoReasons: string[] = [];

  // 1. Acceptance criteria completeness
  if (ticket.acceptanceCriteria) {
    dimensions.push({ name: '验收标准完整性', status: 'pass', note: '验收标准存在且有内容' });
  } else {
    dimensions.push({ name: '验收标准完整性', status: 'fail', note: '验收标准缺失或为空' });
    vetoReasons.push('验收标准缺失或不足 — 无法判断任务是否完成');
  }

  // 2. Technical design completeness
  if (ticket.technicalDesign) {
    dimensions.push({ name: '技术方案完整性', status: 'pass', note: '技术方案存在且有内容' });
  } else {
    dimensions.push({
      name: '技术方案完整性',
      status: 'warn',
      note: '技术方案部分缺失 — 建议补充后执行',
    });
    // Technical design is soft-block (warn, not hard fail)
  }

  // 3. Dependency status check
  if (ticket.dependencies.length === 0) {
    dimensions.push({ name: '依赖状态', status: 'pass', note: '无前置依赖' });
  } else {
    // We can't easily check other tickets' status from here without scanning,
    // so flag as warning with the dependency IDs listed
    dimensions.push({
      name: '依赖状态',
      status: 'warn',
      note: `存在前置依赖（${ticket.dependencies.join(', ')}）— 请确认已完成`,
    });
  }

  // 4. TBD/TODO detection in acceptance criteria / technical design
  const hasTBD = /TBD|TODO|待定|待填/.test(ticket.content);
  if (hasTBD) {
    dimensions.push({
      name: 'TBD/TODO 检测',
      status: 'fail',
      note: 'ticket 中存在 TBD/TODO/待定 标记',
    });
    vetoReasons.push('ticket 中存在未填充的 TBD/TODO — 必须填充后再执行');
  } else {
    dimensions.push({ name: 'TBD/TODO 检测', status: 'pass', note: '无 TBD/TODO' });
  }

  // 5. Force veto override
  if (options.forceVetoReason) {
    dimensions.push({
      name: '手动强制否决',
      status: 'fail',
      note: options.forceVetoReason,
    });
    vetoReasons.push(options.forceVetoReason);
  }

  // Decision logic
  let decision: GateReviewDecision;
  let forcedApprove = false;
  const newVetoCount = ticket.vetoCount + (vetoReasons.length > 0 ? 1 : 0);

  if (options.autoApprove) {
    decision = 'APPROVE';
  } else if (vetoReasons.length > 0) {
    if (ticket.vetoCount >= 2) {
      // 3rd veto — force approve to prevent deadlock
      decision = 'APPROVE';
      forcedApprove = true;
    } else {
      decision = 'VETO';
    }
  } else {
    decision = 'APPROVE';
  }

  const report: GateReviewReport = {
    ticketId: ticket.id,
    reviewTime,
    decision,
    vetoCount: decision === 'VETO' ? newVetoCount : ticket.vetoCount,
    maxVetoCount: 2,
    forcedApprove,
    dimensions,
  };

  if (decision === 'VETO') {
    report.vetoDetails = {
      defects: vetoReasons,
      resubmitConditions: vetoReasons.map((r) => `修复：${r}`),
    };
  } else {
    const risks = dimensions
      .filter((d) => d.status === 'warn')
      .map((d) => `${d.name}: ${d.note}`);
    if (risks.length > 0) {
      report.approveRisks = risks;
    }
  }

  return report;
}

// ============================================================================
// Persist: write report file + update ticket status
// ============================================================================

function writeReviewReport(
  projectRoot: string,
  _ticket: TicketParseResult,
  report: GateReviewReport
): string {
  const reviewsDir = path.join(projectRoot, 'jira', 'gate-reviews');
  if (!fs.existsSync(reviewsDir)) {
    fs.mkdirSync(reviewsDir, { recursive: true });
  }

  const statusIcon = (s: 'pass' | 'warn' | 'fail') => {
    if (s === 'pass') return '✅';
    if (s === 'warn') return '⚠️';
    return '❌';
  };

  const lines = [
    `# Gate Review Report`,
    ``,
    `**Ticket ID**: ${report.ticketId}`,
    `**审查时间**: ${report.reviewTime}`,
    `**审查员**: gate_reviewer`,
    `**本次否决计数**: ${report.vetoCount} / ${report.maxVetoCount}（超过 ${report.maxVetoCount} 次强制通过）`,
    ``,
    `## 结论`,
    ``,
    `> **[${report.decision}]**${report.forcedApprove ? ' ⚠️ 第 3 次强制降级通过' : ''}`,
    ``,
    `## 审查维度`,
    ``,
    `| 维度 | 状态 | 问题描述 |`,
    `|------|------|---------|`,
    ...report.dimensions.map(
      (d) => `| ${d.name} | ${statusIcon(d.status)} | ${d.note} |`
    ),
    ``,
  ];

  if (report.decision === 'VETO' && report.vetoDetails) {
    lines.push(
      `## VETO 详情`,
      ``,
      `**具体缺陷**:`,
      ...report.vetoDetails.defects.map((d, i) => `${i + 1}. ${d}`),
      ``,
      `**重新提交条件**:`,
      ...report.vetoDetails.resubmitConditions.map((c, i) => `${i + 1}. ${c}`),
      ``
    );
  } else if (report.approveRisks && report.approveRisks.length > 0) {
    lines.push(
      `## APPROVE 风险摘要`,
      ``,
      `**已识别风险**（已评估为可接受）:`,
      ...report.approveRisks.map((r) => `- ${r}`),
      ``
    );
  }

  if (report.forcedApprove) {
    lines.push(
      `## 降级通过说明`,
      ``,
      `⚠️ 本次为第 3 次审查，强制降级通过。执行中遇到预期外问题请优先报告 Master。`,
      ``
    );
  }

  const dateStr = report.reviewTime.slice(0, 10);
  const reportFile = path.join(reviewsDir, `${report.ticketId}-${dateStr}.md`);
  fs.writeFileSync(reportFile, lines.join('\n'));
  return reportFile;
}

function updateTicketStatus(ticket: TicketParseResult, report: GateReviewReport): void {
  let content = ticket.content;

  // Update status field
  const newStatus = report.decision === 'APPROVE' ? 'in_progress' : 'analysis';
  content = content.replace(/(\*\*状态\*\*:\s*)\S+/, `$1${newStatus}`);

  // Update or insert veto count
  if (content.includes('**gate_review_veto_count**:')) {
    content = content.replace(
      /\*\*gate_review_veto_count\*\*:\s*\d+/,
      `**gate_review_veto_count**: ${report.vetoCount}`
    );
  } else if (report.vetoCount > 0) {
    // Insert after status line
    content = content.replace(
      /(\*\*状态\*\*:\s*\S+)/,
      `$1\n**gate_review_veto_count**: ${report.vetoCount}`
    );
  }

  // Append veto_reason if vetoed
  if (report.decision === 'VETO' && report.vetoDetails) {
    const vetoBlock = [
      ``,
      `<!-- Gate Review: ${report.reviewTime} -->`,
      `**veto_reason**: ${report.vetoDetails.defects.join('; ')}`,
      `**resubmit_conditions**: ${report.vetoDetails.resubmitConditions.join('; ')}`,
    ].join('\n');

    // Remove previous veto block if present
    content = content.replace(/\n<!-- Gate Review:.*?-->\n.*?resubmit_conditions.*?\n/gs, '');
    content = content.trimEnd() + '\n' + vetoBlock + '\n';
  }

  fs.writeFileSync(ticket.filePath, content);
}

function appendAuditLog(projectRoot: string, report: GateReviewReport): void {
  const auditDir = path.join(projectRoot, 'confluence', 'audit');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }

  const logFile = path.join(auditDir, 'gate-review-log.jsonl');

  // Build log entry
  const entry = {
    ticket: report.ticketId,
    ts: report.reviewTime,
    decision: report.decision,
    veto_count: report.vetoCount,
    forced: report.forcedApprove,
    defects: report.vetoDetails?.defects ?? [],
  };

  // SHA256 hash chain: include previous hash if log exists
  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
  if (fs.existsSync(logFile)) {
    const existing = fs.readFileSync(logFile, 'utf-8').trim();
    if (existing) {
      const lastLine = existing.split('\n').pop() ?? '';
      prevHash = crypto.createHash('sha256').update(lastLine).digest('hex');
    }
  }

  const hashLine = JSON.stringify({ ...entry, prev_hash: prevHash });
  const lineHash = crypto.createHash('sha256').update(hashLine).digest('hex');
  const finalLine = JSON.stringify({ ...entry, prev_hash: prevHash, hash: lineHash });

  fs.appendFileSync(logFile, finalLine + '\n');
}

// ============================================================================
// Print report to console
// ============================================================================

function printReport(report: GateReviewReport): void {
  const icon = report.decision === 'APPROVE' ? '✅' : '❌';
  const forcedNote = report.forcedApprove ? ' (强制降级通过 — 第 3 次审查)' : '';

  console.log(`\n${icon} [${report.decision}]${forcedNote}  ${report.ticketId}`);
  console.log(`   审查时间: ${report.reviewTime}`);
  console.log(`   否决计数: ${report.vetoCount} / ${report.maxVetoCount}`);
  console.log(`\n   审查维度:`);

  for (const d of report.dimensions) {
    const sym = d.status === 'pass' ? '✓' : d.status === 'warn' ? '!' : '✗';
    console.log(`     [${sym}] ${d.name}: ${d.note}`);
  }

  if (report.decision === 'VETO' && report.vetoDetails) {
    console.log(`\n   否决原因:`);
    report.vetoDetails.defects.forEach((d, i) => console.log(`     ${i + 1}. ${d}`));
    console.log(`\n   重新提交条件:`);
    report.vetoDetails.resubmitConditions.forEach((c, i) =>
      console.log(`     ${i + 1}. ${c}`)
    );
  } else if (report.approveRisks && report.approveRisks.length > 0) {
    console.log(`\n   已知风险（可接受）:`);
    report.approveRisks.forEach((r) => console.log(`     - ${r}`));
  }

  if (report.decision === 'APPROVE') {
    console.log(`\n   → Ticket 状态更新为: in_progress`);
  } else {
    console.log(`\n   → Ticket 状态更新为: analysis（打回修改）`);
  }
}

// ============================================================================
// Main review handler
// ============================================================================

export async function gateReview(
  ticketId: string | undefined,
  options: { autoApprove?: boolean; forceVeto?: string; dryRun?: boolean; scanAll?: boolean }
): Promise<Result<GateReviewReport[]>> {
  const projectRoot = process.cwd();

  // Scan mode: find all gate_review tickets
  if (options.scanAll || !ticketId) {
    const files = findGateReviewTickets(projectRoot);
    if (files.length === 0) {
      console.log('没有处于 gate_review 状态的 tickets');
      return { success: true, data: [] };
    }
    console.log(`找到 ${files.length} 个待审查 tickets:`);
    for (const f of files) {
      console.log(`  - ${path.basename(f, '.md')}`);
    }
    return { success: true, data: [] };
  }

  // Single ticket review
  const filePath = findTicketFile(projectRoot, ticketId);
  if (!filePath) {
    const err = new EketErrorClass(
      EketErrorCode.TICKET_NOT_FOUND,
      `Ticket not found: ${ticketId}`
    );
    printError({ code: err.code, message: err.message });
    return { success: false, error: err };
  }

  const parseResult = parseTicket(filePath);
  if (!parseResult.success) {
    printError({ code: parseResult.error.code, message: parseResult.error.message });
    return { success: false, error: parseResult.error };
  }

  const ticket = parseResult.data;

  // Warn if ticket isn't in gate_review state
  if (ticket.status !== 'gate_review' && !options.autoApprove && !options.forceVeto) {
    console.warn(
      `⚠️  警告：Ticket ${ticket.id} 当前状态为 "${ticket.status}"，不是 "gate_review"。`
    );
    console.warn(`   继续审查（--auto-approve 跳过状态检查，或先将状态更新为 gate_review）`);
  }

  const report = runGateReview(ticket, {
    autoApprove: options.autoApprove,
    forceVetoReason: options.forceVeto,
  });

  printReport(report);

  if (!options.dryRun) {
    const reportFile = writeReviewReport(projectRoot, ticket, report);
    updateTicketStatus(ticket, report);
    appendAuditLog(projectRoot, report);
    console.log(`\n   报告已写入: ${path.relative(projectRoot, reportFile)}`);
    console.log(`   审计日志: confluence/audit/gate-review-log.jsonl`);
  } else {
    console.log(`\n   [DRY RUN] 未写入文件`);
  }

  return { success: true, data: [report] };
}

// ============================================================================
// CLI registration
// ============================================================================

export function registerGateReview(program: Command): void {
  program
    .command('gate:review [ticket-id]')
    .description('执行前关卡审查：校验 ticket 可执行性，输出 APPROVE / VETO 决定')
    .option('--auto-approve', '强制批准（跳过审查逻辑，用于测试或紧急通过）')
    .option('--force-veto <reason>', '强制否决并指定原因')
    .option('--dry-run', '试运行：只输出审查报告，不修改文件')
    .option('--scan-all', '扫描所有处于 gate_review 状态的 tickets')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli gate:review FEAT-001              # 审查 FEAT-001
  $ eket-cli gate:review FEAT-001 --dry-run   # 试运行，不修改文件
  $ eket-cli gate:review --scan-all            # 扫描所有待审查 tickets
  $ eket-cli gate:review FEAT-001 --auto-approve  # 强制批准
  $ eket-cli gate:review FEAT-001 --force-veto "技术方案缺少回滚策略"

State Machine:
  ready → gate_review → (APPROVE) → in_progress
                      → (VETO)   → analysis（打回修改）
  ≥3次否决 → 强制降级通过（防死锁）

Audit:
  审查报告写入: jira/gate-reviews/<ticket-id>-<date>.md
  审计日志:     confluence/audit/gate-review-log.jsonl（hash chain，append-only）
`
    )
    .action(async (ticketId: string | undefined, options) => {
      const result = await gateReview(ticketId, {
        autoApprove: options.autoApprove as boolean | undefined,
        forceVeto: options.forceVeto as string | undefined,
        dryRun: options.dryRun as boolean | undefined,
        scanAll: options.scanAll as boolean | undefined,
      });

      if (!result.success) {
        process.exit(1);
      }
    });
}
