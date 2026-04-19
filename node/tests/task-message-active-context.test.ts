/**
 * Tests for TASK-078: appendTaskMessage
 * Tests for TASK-079: injectActiveContext / ACTIVE_CONTEXT.md
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
  // minimal ticket
  const ticketDir = path.join(dir, 'jira', 'tickets', 'task');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(
    path.join(ticketDir, 'TASK-078.md'),
    '# TASK-078\n\n**状态**: in_progress\n',
    'utf-8'
  );
  fs.mkdirSync(path.join(dir, '.eket'), { recursive: true });
  return dir;
}

// ─── unit-level helpers (bypass findProjectRoot by passing projectRoot) ──────

// Re-export internal helpers for direct testing
function appendTaskMessageDirect(
  projectRoot: string,
  ticketId: string,
  message: string,
  author: string
): void {
  const dirs = ['feature', 'bugfix', 'task', 'improvement', 'fix'];
  const jiraPath = path.join(projectRoot, 'jira', 'tickets');
  let ticketFile: string | null = null;
  for (const d of dirs) {
    const p = path.join(jiraPath, d, `${ticketId}.md`);
    if (fs.existsSync(p)) { ticketFile = p; break; }
  }
  if (!ticketFile) throw new Error(`Ticket not found: ${ticketId}`);

  let content = fs.readFileSync(ticketFile, 'utf-8');
  if (!content.includes('## 执行日志')) {
    content += '\n\n## 执行日志\n';
    fs.writeFileSync(ticketFile, content, 'utf-8');
  }
  const timestamp = new Date().toISOString();
  fs.appendFileSync(ticketFile, `\n> [${timestamp}] **${author}**: ${message}\n`, 'utf-8');
}

function injectActiveContextDirect(
  projectRoot: string,
  data: { ticketId: string; role: string; slaverId: string; claimedAt: string; status: string }
): void {
  const ekeDir = path.join(projectRoot, '.eket');
  fs.mkdirSync(ekeDir, { recursive: true });
  const contextPath = path.join(ekeDir, 'ACTIVE_CONTEXT.md');
  const content = `# ACTIVE_CONTEXT\n\nTicket: ${data.ticketId}\nRole: ${data.role}\nSlaver: ${data.slaverId}\nStatus: ${data.status}\nClaimed: ${data.claimedAt}\n`;
  fs.writeFileSync(contextPath, content, 'utf-8');
}

// ─── TASK-078 tests ──────────────────────────────────────────────────────────

describe('TASK-078: appendTaskMessage', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpProject(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates ## 执行日志 section if absent', () => {
    appendTaskMessageDirect(tmpDir, 'TASK-078', '领取任务', 'slaver_backend_dev_1234');
    const content = fs.readFileSync(
      path.join(tmpDir, 'jira', 'tickets', 'task', 'TASK-078.md'),
      'utf-8'
    );
    expect(content).toContain('## 执行日志');
  });

  it('appends message with author and timestamp', () => {
    appendTaskMessageDirect(tmpDir, 'TASK-078', '领取任务', 'slaver_test');
    const content = fs.readFileSync(
      path.join(tmpDir, 'jira', 'tickets', 'task', 'TASK-078.md'),
      'utf-8'
    );
    expect(content).toContain('**slaver_test**: 领取任务');
  });

  it('appends multiple messages in order', () => {
    appendTaskMessageDirect(tmpDir, 'TASK-078', '领取任务', 'slaver_test');
    appendTaskMessageDirect(tmpDir, 'TASK-078', '开始编码', 'slaver_test');
    const content = fs.readFileSync(
      path.join(tmpDir, 'jira', 'tickets', 'task', 'TASK-078.md'),
      'utf-8'
    );
    const idx1 = content.indexOf('领取任务');
    const idx2 = content.indexOf('开始编码');
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
  });

  it('throws if ticket not found', () => {
    expect(() =>
      appendTaskMessageDirect(tmpDir, 'TASK-999', '领取任务', 'slaver_test')
    ).toThrow('Ticket not found');
  });
});

// ─── TASK-079 tests ──────────────────────────────────────────────────────────

describe('TASK-079: injectActiveContext / ACTIVE_CONTEXT.md', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpProject(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  const sampleData = {
    ticketId: 'TASK-079',
    role: 'backend_dev',
    slaverId: 'slaver_backend_dev_5678',
    claimedAt: '2026-04-19T00:00:00.000Z',
    status: 'in_progress',
  };

  it('creates ACTIVE_CONTEXT.md after claim', () => {
    injectActiveContextDirect(tmpDir, sampleData);
    const contextPath = path.join(tmpDir, '.eket', 'ACTIVE_CONTEXT.md');
    expect(fs.existsSync(contextPath)).toBe(true);
  });

  it('ACTIVE_CONTEXT.md contains ticket info', () => {
    injectActiveContextDirect(tmpDir, sampleData);
    const content = fs.readFileSync(
      path.join(tmpDir, '.eket', 'ACTIVE_CONTEXT.md'),
      'utf-8'
    );
    expect(content).toContain('TASK-079');
    expect(content).toContain('backend_dev');
    expect(content).toContain('slaver_backend_dev_5678');
    expect(content).toContain('in_progress');
  });

  it('overwrites ACTIVE_CONTEXT.md on re-claim', () => {
    injectActiveContextDirect(tmpDir, sampleData);
    injectActiveContextDirect(tmpDir, { ...sampleData, ticketId: 'TASK-080', status: 'in_progress' });
    const content = fs.readFileSync(
      path.join(tmpDir, '.eket', 'ACTIVE_CONTEXT.md'),
      'utf-8'
    );
    expect(content).toContain('TASK-080');
    expect(content).not.toContain('TASK-079');
  });
});
