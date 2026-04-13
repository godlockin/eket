/**
 * Gate Review Command 单元测试
 *
 * 测试覆盖：
 * - Ticket 解析（验收标准、技术方案、依赖、否决计数）
 * - 审查逻辑（APPROVE / VETO / 强制降级通过）
 * - TBD/TODO 检测
 * - 强制批准选项
 * - 强制否决选项
 * - 否决计数达上限时强制降级通过
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Import internal functions via the module (pure logic, no CLI side effects)
import { gateReview, type GateReviewReport } from '../../src/commands/gate-review';

// ============================================================================
// Helpers
// ============================================================================

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-gate-review-'));
}

/**
 * Create a minimal jira ticket file in the temp project root.
 */
function createTicket(
  projectRoot: string,
  id: string,
  overrides: {
    status?: string;
    hasAC?: boolean;
    hasTD?: boolean;
    hasTBD?: boolean;
    vetoCount?: number;
    deps?: string[];
  } = {}
): string {
  const { status = 'gate_review', hasAC = true, hasTD = true, hasTBD = false, vetoCount = 0, deps = [] } =
    overrides;

  const jiraDir = path.join(projectRoot, 'jira');
  fs.mkdirSync(jiraDir, { recursive: true });

  const acSection = hasAC
    ? `## 验收标准\n\n- [ ] 测试通过\n- [ ] 代码覆盖率 > 80%\n- [ ] 文档更新\n`
    : `## 验收标准\n\n`;

  const tdSection = hasTD
    ? `## 技术方案\n\n使用 Node.js 实现，采用 Redis 缓存层，支持水平扩展。接口定义如下：...\n`
    : `## 技术方案\n\n`;

  const depsYaml =
    deps.length > 0
      ? `blocked_by:\n${deps.map((d) => `  - ${d}`).join('\n')}\n`
      : '';

  const vetoLine = vetoCount > 0 ? `\n**gate_review_veto_count**: ${vetoCount}` : '';
  const tbdNote = hasTBD ? '\n\n TODO: 待定方案' : '';

  const content = `# Feature Ticket: ${id} - Test Ticket

**创建时间**: 2026-04-14
**状态**: ${status}${vetoLine}
**标题**: Test Ticket for Gate Review

---

## 0. 依赖关系

\`\`\`yaml
${depsYaml}\`\`\`

${acSection}
${tdSection}
${tbdNote}
`;

  const filePath = path.join(jiraDir, `${id}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// ============================================================================
// Tests
// ============================================================================

describe('gate:review command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmpDir();
    // Override process.cwd() is complex; instead we pass projectRoot via process.chdir
    process.chdir(tmpDir);
  });

  afterEach(() => {
    // Restore cwd to something safe
    process.chdir(os.tmpdir());
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------
  // APPROVE path
  // --------------------------------------------------------------------------

  it('should APPROVE a well-formed ticket with AC and TD', async () => {
    createTicket(tmpDir, 'FEAT-001');

    const result = await gateReview('FEAT-001', {});
    expect(result.success).toBe(true);

    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports).toHaveLength(1);
    expect(reports[0]!.decision).toBe('APPROVE');
    expect(reports[0]!.forcedApprove).toBe(false);
    expect(reports[0]!.vetoCount).toBe(0);
  });

  it('should write report file and update ticket status on APPROVE', async () => {
    createTicket(tmpDir, 'FEAT-002');

    await gateReview('FEAT-002', {});

    // Report file exists
    const reportsDir = path.join(tmpDir, 'jira', 'gate-reviews');
    const files = fs.readdirSync(reportsDir);
    expect(files.some((f) => f.startsWith('FEAT-002'))).toBe(true);

    // Ticket status updated to in_progress
    const ticketContent = fs.readFileSync(path.join(tmpDir, 'jira', 'FEAT-002.md'), 'utf-8');
    expect(ticketContent).toMatch(/\*\*状态\*\*:\s*in_progress/);
  });

  it('should APPROVE with --auto-approve regardless of missing AC', async () => {
    createTicket(tmpDir, 'FEAT-003', { hasAC: false });

    const result = await gateReview('FEAT-003', { autoApprove: true });
    expect(result.success).toBe(true);
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports[0]!.decision).toBe('APPROVE');
  });

  // --------------------------------------------------------------------------
  // VETO path
  // --------------------------------------------------------------------------

  it('should VETO when acceptance criteria is missing', async () => {
    createTicket(tmpDir, 'FEAT-010', { hasAC: false });

    const result = await gateReview('FEAT-010', {});
    expect(result.success).toBe(true);
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports[0]!.decision).toBe('VETO');
    expect(reports[0]!.vetoCount).toBe(1);
  });

  it('should VETO when TBD markers are present', async () => {
    createTicket(tmpDir, 'FEAT-011', { hasTBD: true });

    const result = await gateReview('FEAT-011', {});
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports[0]!.decision).toBe('VETO');
    expect(reports[0]!.vetoDetails?.defects.some((d) => /TBD/.test(d))).toBe(true);
  });

  it('should VETO with --force-veto reason', async () => {
    createTicket(tmpDir, 'FEAT-012');

    const result = await gateReview('FEAT-012', { forceVeto: '缺少回滚策略' });
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports[0]!.decision).toBe('VETO');
    expect(reports[0]!.vetoDetails?.defects).toContain('缺少回滚策略');
  });

  it('should set ticket status to analysis on VETO', async () => {
    createTicket(tmpDir, 'FEAT-013', { hasAC: false });

    await gateReview('FEAT-013', {});

    const ticketContent = fs.readFileSync(path.join(tmpDir, 'jira', 'FEAT-013.md'), 'utf-8');
    expect(ticketContent).toMatch(/\*\*状态\*\*:\s*analysis/);
  });

  // --------------------------------------------------------------------------
  // Forced approval (deadlock prevention)
  // --------------------------------------------------------------------------

  it('should force APPROVE on 3rd veto attempt (veto_count already 2)', async () => {
    createTicket(tmpDir, 'FEAT-020', { hasAC: false, vetoCount: 2 });

    const result = await gateReview('FEAT-020', {});
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports[0]!.decision).toBe('APPROVE');
    expect(reports[0]!.forcedApprove).toBe(true);
  });

  it('should NOT force approve on 2nd veto (veto_count = 1)', async () => {
    createTicket(tmpDir, 'FEAT-021', { hasAC: false, vetoCount: 1 });

    const result = await gateReview('FEAT-021', {});
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports[0]!.decision).toBe('VETO');
    expect(reports[0]!.forcedApprove).toBe(false);
    expect(reports[0]!.vetoCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Dry run
  // --------------------------------------------------------------------------

  it('should not write files in dry-run mode', async () => {
    createTicket(tmpDir, 'FEAT-030');

    await gateReview('FEAT-030', { dryRun: true });

    // No report file created
    const reportsDir = path.join(tmpDir, 'jira', 'gate-reviews');
    expect(fs.existsSync(reportsDir)).toBe(false);

    // Ticket status unchanged
    const ticketContent = fs.readFileSync(path.join(tmpDir, 'jira', 'FEAT-030.md'), 'utf-8');
    expect(ticketContent).toMatch(/\*\*状态\*\*:\s*gate_review/);
  });

  // --------------------------------------------------------------------------
  // Audit log
  // --------------------------------------------------------------------------

  it('should write audit log entry on APPROVE', async () => {
    createTicket(tmpDir, 'FEAT-040');

    await gateReview('FEAT-040', {});

    const logFile = path.join(tmpDir, 'confluence', 'audit', 'gate-review-log.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);

    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[lines.length - 1]!);
    expect(entry.ticket).toBe('FEAT-040');
    expect(entry.decision).toBe('APPROVE');
    expect(entry.hash).toBeDefined();
  });

  it('should maintain hash chain across multiple entries', async () => {
    createTicket(tmpDir, 'FEAT-041');
    createTicket(tmpDir, 'FEAT-042');

    await gateReview('FEAT-041', {});
    await gateReview('FEAT-042', {});

    const logFile = path.join(tmpDir, 'confluence', 'audit', 'gate-review-log.jsonl');
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]!);
    const second = JSON.parse(lines[1]!);

    // second.prev_hash must equal sha256 of the raw first line string
    const expectedPrevHash = crypto.createHash('sha256').update(lines[0]!).digest('hex');
    expect(second.prev_hash).toBe(expectedPrevHash);
    expect(first.hash).toBeDefined();
    expect(second.hash).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Ticket not found
  // --------------------------------------------------------------------------

  it('should return failure if ticket file not found', async () => {
    const result = await gateReview('NONEXISTENT-999', {});
    expect(result.success).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Scan all
  // --------------------------------------------------------------------------

  it('should list gate_review tickets in scan-all mode', async () => {
    createTicket(tmpDir, 'FEAT-050', { status: 'gate_review' });
    createTicket(tmpDir, 'FEAT-051', { status: 'ready' });

    const result = await gateReview(undefined, { scanAll: true });
    expect(result.success).toBe(true);
    // scan-all just lists, returns empty array
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    expect(reports).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Dimension checks
  // --------------------------------------------------------------------------

  it('should mark technical design as warn (not fail) when missing', async () => {
    createTicket(tmpDir, 'FEAT-060', { hasTD: false });

    const result = await gateReview('FEAT-060', {});
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    // TD missing is only a warn, not hard fail → should still APPROVE if AC is present
    expect(reports[0]!.decision).toBe('APPROVE');

    const tdDim = reports[0]!.dimensions.find((d) => d.name === '技术方案完整性');
    expect(tdDim?.status).toBe('warn');
  });

  it('should include dependencies in warn dimension when present', async () => {
    createTicket(tmpDir, 'FEAT-061', { deps: ['FEAT-001', 'FEAT-002'] });

    const result = await gateReview('FEAT-061', {});
    const reports = (result as { success: true; data: GateReviewReport[] }).data;
    const depDim = reports[0]!.dimensions.find((d) => d.name === '依赖状态');
    expect(depDim?.status).toBe('warn');
    expect(depDim?.note).toContain('FEAT-001');
  });
});
