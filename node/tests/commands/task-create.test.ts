/**
 * Tests for task-create command
 * TASK-110a
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  inferType,
  inferPriority,
  checkCompleteness,
  getNextTicketNumber,
  writeTicketFile,
  formatTicket,
  runTaskCreate,
  type InferredFields,
} from '../../src/commands/task-create.js';

// ─── inferType ────────────────────────────────────────────────────────────────

describe('inferType', () => {
  it('returns bug for bug/fix keywords', () => {
    expect(inferType('修复登录bug')).toBe('bug');
    expect(inferType('fix the crash')).toBe('bug');
    expect(inferType('错误处理')).toBe('bug');
  });

  it('returns refactor for refactor keywords', () => {
    expect(inferType('重构用户模块')).toBe('refactor');
    expect(inferType('refactor auth service')).toBe('refactor');
  });

  it('returns chore for doc keywords', () => {
    expect(inferType('更新README文档')).toBe('chore');
    expect(inferType('update doc')).toBe('chore');
  });

  it('returns feature as default', () => {
    expect(inferType('实现用户登录功能')).toBe('feature');
    expect(inferType('add dashboard page')).toBe('feature');
  });
});

// ─── inferPriority ────────────────────────────────────────────────────────────

describe('inferPriority', () => {
  it('returns P0 for urgent/production keywords', () => {
    expect(inferPriority('紧急：生产环境故障')).toBe('P0');
    expect(inferPriority('P0 critical bug')).toBe('P0');
    expect(inferPriority('线上崩溃')).toBe('P0');
  });

  it('returns P1 for important keywords', () => {
    expect(inferPriority('重要功能P1')).toBe('P1');
    expect(inferPriority('important feature')).toBe('P1');
  });

  it('returns P2 as default', () => {
    expect(inferPriority('实现用户登录功能')).toBe('P2');
  });
});

// ─── checkCompleteness ────────────────────────────────────────────────────────

describe('checkCompleteness', () => {
  it('needsDetail when detail < 50 chars', () => {
    const gaps = checkCompleteness('短描述', '- 通过测试');
    expect(gaps.needsDetail).toBe(true);
    expect(gaps.needsAcceptance).toBe(false);
  });

  it('needsAcceptance when acceptance is empty', () => {
    const longDetail = '这是一个超过五十字的详细描述，包含了很多技术细节和实现方案，确保代码质量和功能完整性，需要详细测试覆盖。';
    const gaps = checkCompleteness(longDetail, '');
    expect(gaps.needsDetail).toBe(false);
    expect(gaps.needsAcceptance).toBe(true);
  });

  it('no gaps when both are sufficient', () => {
    const longDetail = '这是一个超过五十字的详细描述，包含了很多技术细节和实现方案，确保代码质量和功能完整性，需要详细测试覆盖。';
    const gaps = checkCompleteness(longDetail, '- POST /api/login 返回200');
    expect(gaps.needsDetail).toBe(false);
    expect(gaps.needsAcceptance).toBe(false);
  });

  it('both gaps when detail short and acceptance empty', () => {
    const gaps = checkCompleteness('短', '');
    expect(gaps.needsDetail).toBe(true);
    expect(gaps.needsAcceptance).toBe(true);
  });
});

// ─── getNextTicketNumber ──────────────────────────────────────────────────────

describe('getNextTicketNumber', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 1 when no tickets exist', () => {
    expect(getNextTicketNumber(tmpDir)).toBe(1);
  });

  it('returns max+1 for existing tickets', () => {
    fs.writeFileSync(path.join(tmpDir, 'TASK-005.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'TASK-012.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'TASK-003.md'), '');
    expect(getNextTicketNumber(tmpDir)).toBe(13);
  });

  it('ignores non-standard filenames', () => {
    fs.writeFileSync(path.join(tmpDir, 'TASK-007.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'TASK-103a.md'), ''); // alpha suffix - ignored
    expect(getNextTicketNumber(tmpDir)).toBe(8);
  });
});

// ─── writeTicketFile ──────────────────────────────────────────────────────────

describe('writeTicketFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates ticket file with correct content', () => {
    const fields: InferredFields = {
      title: '实现用户登录功能',
      type: 'feature',
      priority: 'P2',
      background: '实现用户登录功能',
      detail: '支持邮箱/密码登录，JWT token，7天有效期',
      acceptanceCriteria: '1. POST /auth/login 返回 token',
      clarifications: [],
    };
    const filePath = writeTicketFile(fields, 'TASK-110', tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# TASK-110: 实现用户登录功能');
    expect(content).toContain('**状态**: todo');
    expect(content).toContain('**类型**: feature');
    expect(content).toContain('**优先级**: P2');
  });

  it('includes clarification section when clarifications exist', () => {
    const fields: InferredFields = {
      title: 'Test',
      type: 'bug',
      priority: 'P0',
      background: 'Test background',
      detail: 'Detail here',
      acceptanceCriteria: '- pass tests',
      clarifications: [{ question: 'Q?', answer: 'A!' }],
    };
    const filePath = writeTicketFile(fields, 'TASK-111', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('## 澄清记录');
    expect(content).toContain('**Q1**: Q?');
    expect(content).toContain('**A1**: A!');
  });
});

// ─── runTaskCreate (integration) ──────────────────────────────────────────────

describe('runTaskCreate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMockRl(answers: string[]): any {
    let idx = 0;
    return {
      question: (_prompt: string, cb: (ans: string) => void) => {
        cb(answers[idx++] ?? '');
      },
      close: () => {},
    };
  }

  it('creates ticket without prompts when description is long enough and acceptance provided via clarification flow', async () => {
    // Short description triggers both questions
    const rl = makeMockRl([
      '支持邮箱/密码登录，JWT token，7天有效期，包含记住我功能',
      '1. POST /auth/login 返回 token  2. token 过期后返回401',
    ]);
    const filePath = await runTaskCreate('实现用户登录', rl, tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('TASK-1:');
    expect(content).toContain('## 澄清记录');
  });

  it('infers type and priority correctly in generated file', async () => {
    const longDesc = 'P0 urgent: fix production login API crash causing all users unable to authenticate - critical bug';
    const rl = makeMockRl(['1. 接口恢复正常  2. 错误日志不再出现']);
    const filePath = await runTaskCreate(longDesc, rl, tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('**类型**: bug');
    expect(content).toContain('**优先级**: P0');
  });

  it('skips detail question when description >= 50 chars', async () => {
    // 51 chars to exceed threshold
    const longDesc = 'Implement complete user authentication system with email/password login, JWT tokens, and remember-me';
    const rl = makeMockRl(['1. POST /auth/login returns 200  2. Invalid creds return 401']);
    const filePath = await runTaskCreate(longDesc, rl, tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    // Only acceptance question (Q1) was asked, no Q2
    expect(content).toContain('## 澄清记录');
    expect(content).not.toContain('**Q2**');
  });
});
