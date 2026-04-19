/**
 * Tests for master-heartbeat generateReport() with canProceed() integration
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateReport } from '../../src/commands/master-heartbeat.js';

// Helper: create a temporary jira/tickets directory with ticket files
function makeTestDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-hb-test-'));
  fs.mkdirSync(path.join(dir, 'jira', 'tickets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'inbox'), { recursive: true });
  return dir;
}

function writeTicket(dir: string, id: string, status: string, blockedBy: string[], triggerRule?: string): void {
  const ticketPath = path.join(dir, 'jira', 'tickets', `${id}.md`);
  const blockedSection =
    blockedBy.length > 0
      ? `blocked_by:\n${blockedBy.map((b) => `  - ${b}`).join('\n')}\n`
      : '';
  const triggerSection = triggerRule ? `**trigger_rule**: ${triggerRule}\n` : '';
  fs.writeFileSync(
    ticketPath,
    `# ${id}: Test ticket\n**状态**: ${status}\n**优先级**: P1\n**负责人**: Slaver-1\n${blockedSection}${triggerSection}`
  );
}

describe('generateReport canProceed integration', () => {
  let dir: string;

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('one_success: 1 dep done → unlockable', () => {
    dir = makeTestDir();
    writeTicket(dir, 'TASK-001', 'done', []);
    writeTicket(dir, 'TASK-002', 'blocked', ['TASK-001'], 'one_success');

    const report = generateReport(dir);
    expect(report.progress.unlockableCount).toBe(1);
  });

  it('all_done: 1 dep failed → unlockable', () => {
    dir = makeTestDir();
    writeTicket(dir, 'TASK-003', 'failed', []);
    writeTicket(dir, 'TASK-004', 'blocked', ['TASK-003'], 'all_done');

    const report = generateReport(dir);
    expect(report.progress.unlockableCount).toBe(1);
  });

  it('all_success (default): dep still in_progress → NOT unlockable', () => {
    dir = makeTestDir();
    writeTicket(dir, 'TASK-005', 'in_progress', []);
    writeTicket(dir, 'TASK-006', 'blocked', ['TASK-005']);

    const report = generateReport(dir);
    expect(report.progress.unlockableCount).toBe(0);
  });

  it('all_success: all deps done → unlockable', () => {
    dir = makeTestDir();
    writeTicket(dir, 'TASK-007', 'done', []);
    writeTicket(dir, 'TASK-008', 'done', []);
    writeTicket(dir, 'TASK-009', 'blocked', ['TASK-007', 'TASK-008']);

    const report = generateReport(dir);
    expect(report.progress.unlockableCount).toBe(1);
  });

  it('all_done: dep with FAILED (uppercase) status → unlockable (normalize fix)', () => {
    dir = makeTestDir();
    writeTicket(dir, 'TASK-014', 'FAILED', []);
    writeTicket(dir, 'TASK-015', 'blocked', ['TASK-014'], 'all_done');

    const report = generateReport(dir);
    expect(report.progress.unlockableCount).toBe(1);
  });

  it('canProceed returns true when blockedBy is empty', () => {
    dir = makeTestDir();
    writeTicket(dir, 'TASK-016', 'in_progress', []);

    const report = generateReport(dir);
    // ticket with no blockedBy should not appear in unlockable (it's not blocked)
    // and blockedCount should be 0
    expect(report.progress.blockedCount).toBe(0);
  });
});
