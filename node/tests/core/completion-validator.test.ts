import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CompletionValidator } from '../../src/core/completion-validator.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-cv-test-'));
}

function setup(root: string, opts: { ticketContent?: string; ticketId?: string } = {}) {
  const ticketId = opts.ticketId ?? 'TASK-001';
  const ticketContent = opts.ticketContent ?? `# ${ticketId}\n- [x] done\n`;
  const jiraDir = path.join(root, 'jira', 'tickets');
  fs.mkdirSync(jiraDir, { recursive: true });
  fs.writeFileSync(path.join(jiraDir, `${ticketId}.md`), ticketContent, 'utf-8');
  return ticketId;
}

describe('CompletionValidator', () => {
  let root: string;
  let origCwd: string;

  beforeEach(() => {
    root = makeTmpDir();
    origCwd = process.cwd();
    // completion-validator uses join(process.cwd(), '..', 'jira/tickets')
    // so set cwd to root/node to make '../jira/tickets' resolve correctly
    const nodeDir = path.join(root, 'node');
    fs.mkdirSync(nodeDir, { recursive: true });
    process.chdir(nodeDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('returns passed=true when all criteria checked', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [x] done\n- [x] also done\n' });
    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion(ticketId, []);
    const ac = report.checks.find(c => c.dimension === 'acceptance-criteria')!;
    expect(ac.passed).toBe(true);
    expect(ac.message).toContain('2');
  });

  test('returns passed=false when unchecked criteria exist', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [ ] undone\n- [x] done\n' });
    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion(ticketId, []);
    const ac = report.checks.find(c => c.dimension === 'acceptance-criteria')!;
    expect(ac.passed).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.summary).toMatch(/failed/);
  });

  test('returns passed=false when ticket file missing', async () => {
    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion('TASK-MISSING', []);
    const ac = report.checks.find(c => c.dimension === 'acceptance-criteria')!;
    expect(ac.passed).toBe(false);
    expect(ac.message).toContain('not found');
  });

  test('architecture check always passes (advisory) and returns source', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [x] done\n' });
    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion(ticketId, ['node/src/core/foo-bar.ts']);
    const arch = report.checks.find(c => c.dimension === 'architecture')!;
    expect(arch.passed).toBe(true);
    expect(arch.source).toBeTruthy();
  });

  test('code-style check counts ts files', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [x] done\n' });
    const validator = new CompletionValidator(root);
    const changed = ['src/foo.ts', 'src/bar.ts', 'README.md'];
    const report = await validator.validateCompletion(ticketId, changed);
    const cs = report.checks.find(c => c.dimension === 'code-style')!;
    expect(cs.passed).toBe(true);
    expect(cs.message).toContain('2 TypeScript files');
  });

  test('all checks pass produces correct summary', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [x] done\n' });
    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion(ticketId, []);
    expect(report.passed).toBe(true);
    expect(report.summary).toMatch(/All 3 validation checks passed/);
    expect(report.checks).toHaveLength(3);
  });

  test('ValidationReport includes source for each check', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [x] done\n' });
    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion(ticketId, ['foo.ts']);
    for (const check of report.checks) {
      expect(check.source).toBeTruthy();
      expect(typeof check.source).toBe('string');
    }
  });

  test('architecture check finds relevant confluence memory file', async () => {
    const ticketId = setup(root, { ticketContent: '# T\n- [x] done\n' });
    // Create a confluence/memory lesson matching the changed file name
    const memDir = path.join(root, 'confluence', 'memory', 'lessons');
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, 'completion-validator.md'), '# lesson\n', 'utf-8');

    const validator = new CompletionValidator(root);
    const report = await validator.validateCompletion(ticketId, ['node/src/core/completion-validator.ts']);
    const arch = report.checks.find(c => c.dimension === 'architecture')!;
    expect(arch.passed).toBe(true);
    expect(arch.message).toBe('Relevant pattern found');
  });
});
