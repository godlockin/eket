/**
 * TASK-069: injectActiveContext + buildActiveContextMd 单元测试
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildActiveContextMd, injectActiveContext } from '../../src/commands/claim.js';

describe('TASK-069: active context injection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-task069-'));
    // Create .eket dir so injectActiveContext can write
    fs.mkdirSync(path.join(tmpDir, '.eket'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildActiveContextMd 包含 ticket ID', () => {
    const md = buildActiveContextMd(
      { id: 'TASK-069', title: '动态注入测试' },
      'slaver_1',
      ['skill_a', 'skill_b'],
      'backend_dev'
    );
    expect(md).toContain('TASK-069');
    expect(md).toContain('slaver_1');
    expect(md).toContain('backend_dev');
    expect(md).toContain('skill_a');
    expect(md).toContain('skill_b');
  });

  it('buildActiveContextMd — 无 skills 显示 (none)', () => {
    const md = buildActiveContextMd({ id: 'TASK-069', title: 'Test' }, 's1', [], 'dev');
    expect(md).toContain('(none)');
  });

  it('injectActiveContext 写入 .eket/ACTIVE_CONTEXT.md', async () => {
    await injectActiveContext(
      tmpDir,
      { id: 'TASK-069', title: '注入测试' },
      'slaver_test',
      'fullstack'
    );
    const filePath = path.join(tmpDir, '.eket', 'ACTIVE_CONTEXT.md');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('TASK-069');
  });

  it('injectActiveContext 幂等 — 第二次调用覆盖第一次', async () => {
    await injectActiveContext(tmpDir, { id: 'TASK-069', title: 'first' }, 's1', 'dev');
    await injectActiveContext(tmpDir, { id: 'TASK-099', title: 'second' }, 's1', 'dev');
    const content = fs.readFileSync(path.join(tmpDir, '.eket', 'ACTIVE_CONTEXT.md'), 'utf-8');
    expect(content).toContain('TASK-099');
    expect(content).not.toContain('TASK-069');
  });
});
