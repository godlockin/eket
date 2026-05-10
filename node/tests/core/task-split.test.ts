/**
 * Tests for TASK-608: Context Overflow Prevention via Task Split
 */

import * as fs from 'fs';
import * as path from 'path';
import { contextTracker } from '../../src/core/context-tracker.js';
import { shouldReportRisk, reportContextRisk } from '../../src/core/slaver-context-monitor.js';
import { splitTask } from '../../src/commands/task-split.js';

const TEST_ROOT = path.join(process.cwd(), 'test-fixtures', 'task-split');

describe('TASK-608: Context Tracker Risk Check', () => {
  beforeEach(() => {
    contextTracker.clearSession('test-session');
  });

  it('checkRisk() returns correct levels', () => {
    // Simulate token accumulation
    contextTracker.trackToolOutput('test-session', 'x'.repeat(50000 * 4)); // ~50k tokens
    expect(contextTracker.checkRisk('test-session')).toBe('none');

    contextTracker.trackToolOutput('test-session', 'x'.repeat(40000 * 4)); // +40k = 90k
    expect(contextTracker.checkRisk('test-session')).toBe('low');

    contextTracker.trackToolOutput('test-session', 'x'.repeat(40000 * 4)); // +40k = 130k
    expect(contextTracker.checkRisk('test-session')).toBe('high');
  });
});

describe('TASK-608: Slaver Context Monitor', () => {
  beforeEach(() => {
    contextTracker.clearSession('test-session');
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true });
    }
    fs.mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true });
    }
  });

  it('shouldReportRisk() only triggers at high risk', () => {
    contextTracker.trackToolOutput('test-session', 'x'.repeat(100000 * 4)); // 100k tokens
    expect(shouldReportRisk('test-session')).toBe(false);

    contextTracker.trackToolOutput('test-session', 'x'.repeat(30000 * 4)); // +30k = 130k
    expect(shouldReportRisk('test-session')).toBe(true);
  });

  it('reportContextRisk() creates alert file', async () => {
    contextTracker.trackToolOutput('test-session', 'x'.repeat(130000 * 4)); // 130k tokens

    const alertPath = await reportContextRisk(TEST_ROOT, 'TASK-999', 'test-session');

    expect(fs.existsSync(alertPath)).toBe(true);
    const content = fs.readFileSync(alertPath, 'utf-8');
    expect(content).toContain('TASK-999');
    expect(content).toContain('130,000');
    expect(content).toContain('HIGH');
  });
});

describe('TASK-608: Task Split Command', () => {
  const TICKETS_DIR = path.join(TEST_ROOT, 'jira', 'tickets', 'EPIC-006');

  beforeEach(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true });
    }
    fs.mkdirSync(TICKETS_DIR, { recursive: true });

    // Create test ticket
    const ticketContent = `# TASK-999: Test Large Task

**Status**: \`in-progress\`
**Assignee**: slaver-001

## Acceptance Criteria
- [ ] Implement feature A
- [ ] Implement feature B
- [ ] Write tests for A
- [ ] Write tests for B
- [ ] Update documentation

## Description
Large task with 5 ACs.
`;
    fs.writeFileSync(path.join(TICKETS_DIR, 'TASK-999.md'), ticketContent, 'utf-8');
  });

  afterEach(() => {
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true });
    }
  });

  it('splits ticket into sub-tasks based on AC count', async () => {
    await splitTask({
      projectRoot: TEST_ROOT,
      taskId: 'TASK-999',
    });

    // Should create 5 sub-tasks (1 AC per task by default)
    const subTasks = fs.readdirSync(TICKETS_DIR).filter((name) => name.startsWith('TASK-999-SUB-'));
    expect(subTasks.length).toBe(5);

    // Check sub-task content
    const sub1Content = fs.readFileSync(path.join(TICKETS_DIR, 'TASK-999-SUB-1.md'), 'utf-8');
    expect(sub1Content).toContain('TASK-999-SUB-1');
    expect(sub1Content).toContain('Parent**: TASK-999');
    expect(sub1Content).toContain('Implement feature A');

    // Check parent ticket updated
    const parentContent = fs.readFileSync(path.join(TICKETS_DIR, 'TASK-999.md'), 'utf-8');
    expect(parentContent).toContain('Status**: `split`');
    expect(parentContent).toContain('## Sub-Tasks');
    expect(parentContent).toContain('TASK-999-SUB-1');
  });

  it('throws error for tickets not in valid status', async () => {
    // Change status to 'done'
    const ticketPath = path.join(TICKETS_DIR, 'TASK-999.md');
    let content = fs.readFileSync(ticketPath, 'utf-8');
    content = content.replace('in-progress', 'done');
    fs.writeFileSync(ticketPath, content, 'utf-8');

    await expect(splitTask({
      projectRoot: TEST_ROOT,
      taskId: 'TASK-999',
    })).rejects.toThrow('Cannot split ticket in status: done');
  });

  it('throws error for non-existent ticket', async () => {
    await expect(splitTask({
      projectRoot: TEST_ROOT,
      taskId: 'TASK-404',
    })).rejects.toThrow('Ticket not found: TASK-404');
  });
});
