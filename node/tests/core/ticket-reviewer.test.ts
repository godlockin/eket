/**
 * Tests for ticket-reviewer.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { reviewTicket } from '../../src/core/ticket-reviewer.js';

// Helper: create a temp project with a ticket file
function createTempProject(ticketId: string, ticketContent: string): { projectRoot: string; ticketPath: string } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
  const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  const ticketPath = path.join(ticketsDir, `${ticketId}.md`);
  fs.writeFileSync(ticketPath, ticketContent, 'utf-8');
  return { projectRoot, ticketPath };
}

function cleanup(projectRoot: string): void {
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

describe('reviewTicket', () => {
  it('完整 ticket → passed=true', async () => {
    const content = `# TASK-TEST-1

## 详细描述

这是一个非常详细的描述，超过三十个汉字，描述了功能实现的所有细节和要求。

## 验收标准

- [ ] 功能正常运行
- [ ] 单元测试通过
`;
    const { projectRoot, ticketPath } = createTempProject('TASK-TEST-1', content);
    try {
      const result = await reviewTicket(ticketPath);
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    } finally {
      cleanup(projectRoot);
    }
  });

  it('详细描述 <30 字 → issue', async () => {
    const content = `# TASK-TEST-2

## 详细描述

太短了。

## 验收标准

- [ ] 功能正常
`;
    const { projectRoot, ticketPath } = createTempProject('TASK-TEST-2', content);
    try {
      const result = await reviewTicket(ticketPath);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('详细描述不足'))).toBe(true);
    } finally {
      cleanup(projectRoot);
    }
  });

  it('验收标准缺失 → issue', async () => {
    const content = `# TASK-TEST-3

## 详细描述

这是一个非常详细的描述，超过三十个汉字，描述了功能实现的所有细节和要求，确保够长。
`;
    const { projectRoot, ticketPath } = createTempProject('TASK-TEST-3', content);
    try {
      const result = await reviewTicket(ticketPath);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('验收标准缺失'))).toBe(true);
    } finally {
      cleanup(projectRoot);
    }
  });

  it('未完成依赖 → issue', async () => {
    // Create project root + dep ticket (not done)
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
    const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });

    // Dep ticket in_progress
    fs.writeFileSync(
      path.join(ticketsDir, 'TASK-DEP-1.md'),
      '# TASK-DEP-1\n**状态**: in_progress\n',
      'utf-8'
    );

    const mainContent = `# TASK-TEST-4

依赖: TASK-DEP-1

## 详细描述

这是一个非常详细的描述，超过三十个汉字，描述了功能实现的所有细节和要求。

## 验收标准

- [ ] 功能正常
`;
    const ticketPath = path.join(ticketsDir, 'TASK-TEST-4.md');
    fs.writeFileSync(ticketPath, mainContent, 'utf-8');

    try {
      const result = await reviewTicket(ticketPath);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('TASK-DEP-1') && i.includes('未完成'))).toBe(true);
    } finally {
      cleanup(projectRoot);
    }
  });

  it('依赖已完成 → 不产生 issue', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
    const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });

    // Dep ticket done
    fs.writeFileSync(
      path.join(ticketsDir, 'TASK-DEP-2.md'),
      '# TASK-DEP-2\n**状态**: done\n',
      'utf-8'
    );

    const mainContent = `# TASK-TEST-5

依赖: TASK-DEP-2

## 详细描述

这是一个非常详细的描述，超过三十个汉字，描述了功能实现的所有细节和要求。

## 验收标准

- [ ] 功能正常
`;
    const ticketPath = path.join(ticketsDir, 'TASK-TEST-5.md');
    fs.writeFileSync(ticketPath, mainContent, 'utf-8');

    try {
      const result = await reviewTicket(ticketPath);
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    } finally {
      cleanup(projectRoot);
    }
  });
});
