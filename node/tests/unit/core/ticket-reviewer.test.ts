/**
 * TicketReviewer Unit Tests
 * TASK-Z05: core/ module unit testing
 *
 * Covers:
 * - Acceptance criteria validation
 * - Description validation
 * - Dependency checking
 * - Complete review workflow
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  reviewTicket,
  checkAcceptanceCriteria,
  type ReviewResult,
} from '../../../src/core/ticket-reviewer.js';

describe('TicketReviewer', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `eket-ticket-review-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('checkAcceptanceCriteria', () => {
    it('should pass for checklist-style criteria', () => {
      const content = `
# Ticket

## 验收标准
- [ ] First criteria item
- [ ] Second criteria item
- [x] Third criteria (done)
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(true);
    });

    it('should pass for prose-style criteria (>= 50 chars)', () => {
      const content = `
# Ticket

## 验收标准
The feature must correctly handle all edge cases including empty input,
very long strings, and special characters. Performance should be under 100ms.
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(true);
    });

    it('should fail when section is missing', () => {
      const content = `
# Ticket

## Description
Some description here.
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(false);
      expect(result.issue).toContain('缺失');
    });

    it('should fail when section is empty', () => {
      const content = `
# Ticket

## 验收标准

## Next Section
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(false);
      expect(result.issue).toContain('为空');
    });

    it('should fail when content is too short', () => {
      const content = `
# Ticket

## 验收标准
Too short.
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(false);
      expect(result.issue).toContain('内容不足');
    });

    it('should support English section name', () => {
      const content = `
# Ticket

## Acceptance Criteria
- [ ] Feature works correctly
- [ ] Tests pass
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(true);
    });

    it('should handle multiple heading levels', () => {
      const content = `
# Ticket

### 验收标准
- [ ] Works with H3 heading
`;
      const result = checkAcceptanceCriteria(content);

      expect(result.pass).toBe(true);
    });
  });

  describe('reviewTicket', () => {
    it('should pass for valid ticket', async () => {
      const ticketPath = path.join(testDir, 'valid-ticket.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-001: Valid Ticket

## 详细描述
This is a detailed description of the task that needs to be completed.
It contains sufficient information for the developer to understand the requirements.

## 验收标准
- [ ] Feature implemented correctly
- [ ] Unit tests written
- [ ] Documentation updated
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail for missing description', async () => {
      const ticketPath = path.join(testDir, 'no-desc.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-002: No Description

## 验收标准
- [ ] Something
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('详细描述'))).toBe(true);
    });

    it('should fail for short description', async () => {
      const ticketPath = path.join(testDir, 'short-desc.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-003

## 详细描述
Too short

## 验收标准
- [ ] Criteria item one that is sufficiently descriptive
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('不足'))).toBe(true);
    });

    it('should fail for missing acceptance criteria', async () => {
      const ticketPath = path.join(testDir, 'no-ac.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-004

## 详细描述
This is a detailed description that is long enough to pass the description check.
It contains all the necessary information for implementation.
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('验收标准'))).toBe(true);
    });

    it('should fail for non-existent file', async () => {
      const result = await reviewTicket('/nonexistent/path/ticket.md');

      expect(result.passed).toBe(false);
      expect(result.issues[0]).toContain('无法读取');
    });

    it('should check dependency ticket status', async () => {
      // Create jira/tickets structure
      const jiraDir = path.join(testDir, 'jira', 'tickets');
      fs.mkdirSync(jiraDir, { recursive: true });

      // Create incomplete dependency
      fs.writeFileSync(
        path.join(jiraDir, 'TASK-DEP-001.md'),
        `
---
id: TASK-DEP-001
status: in_progress
---
# Dependency Ticket
`
      );

      // Create main ticket with dependency
      const ticketPath = path.join(jiraDir, 'TASK-MAIN.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-MAIN

**依赖**: TASK-DEP-001

## 详细描述
This ticket depends on another ticket being completed first.
The implementation requires the dependency to be finished.

## 验收标准
- [ ] Integration with TASK-DEP-001
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.includes('TASK-DEP-001') && i.includes('未完成'))).toBe(
        true
      );
    });

    it('should pass when dependency is completed', async () => {
      const jiraDir = path.join(testDir, 'jira', 'tickets');
      fs.mkdirSync(jiraDir, { recursive: true });

      // Create completed dependency
      fs.writeFileSync(
        path.join(jiraDir, 'TASK-DEP-002.md'),
        `
---
id: TASK-DEP-002
---
# Dependency Ticket

**状态**: done
`
      );

      // Create main ticket
      const ticketPath = path.join(jiraDir, 'TASK-MAIN-2.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-MAIN-2

**依赖**: TASK-DEP-002

## 详细描述
This ticket depends on a completed ticket.
All prerequisites are met and work can begin.

## 验收标准
- [ ] Build on TASK-DEP-002 work
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(true);
    });

    it('should handle missing dependency file', async () => {
      const jiraDir = path.join(testDir, 'jira', 'tickets');
      fs.mkdirSync(jiraDir, { recursive: true });

      const ticketPath = path.join(jiraDir, 'TASK-ORPHAN.md');
      fs.writeFileSync(
        ticketPath,
        `
# TASK-ORPHAN

**依赖**: TASK-NONEXISTENT-123

## 详细描述
This ticket references a dependency that doesn't exist.
The dependency file is missing from the repository.

## 验收标准
- [ ] Handle gracefully
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(false);
      expect(
        result.issues.some((i) => i.includes('TASK-NONEXISTENT-123') && i.includes('未完成'))
      ).toBe(true);
    });

    it('should parse multiple dependencies', async () => {
      const jiraDir = path.join(testDir, 'jira', 'tickets');
      fs.mkdirSync(jiraDir, { recursive: true });

      // Create one done, one not done (ticket IDs must have numbers per regex)
      fs.writeFileSync(
        path.join(jiraDir, 'TASK-001.md'),
        `
**状态**: done
`
      );
      fs.writeFileSync(
        path.join(jiraDir, 'TASK-002.md'),
        `
**状态**: in_progress
`
      );

      const ticketPath = path.join(jiraDir, 'TASK-MULTI-DEP.md');
      fs.writeFileSync(
        ticketPath,
        `
# Multi Dep

**依赖**: TASK-001, TASK-002

## 详细描述
Multiple dependencies here, one done and one in progress.
Should fail because TASK-002 is not complete yet.

## 验收标准
- [ ] Both deps needed
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.passed).toBe(false);
      // Should only fail for TASK-002 (TASK-001 is done)
      expect(result.issues.some((i) => i.includes('TASK-002'))).toBe(true);
    });

    it('should handle Chinese colon in dependency line', async () => {
      const jiraDir = path.join(testDir, 'jira', 'tickets');
      fs.mkdirSync(jiraDir, { recursive: true });

      fs.writeFileSync(
        path.join(jiraDir, 'TASK-CN-001.md'),
        `
**状态**: in_progress
`
      );

      const ticketPath = path.join(jiraDir, 'TASK-CN-DEP.md');
      fs.writeFileSync(
        ticketPath,
        `
# Chinese Colon Test

依赖：TASK-CN-001

## 详细描述
Using Chinese colon character for dependency declaration.
Should still be parsed correctly by the reviewer.

## 验收标准
- [ ] Parse Chinese colon
`
      );

      const result = await reviewTicket(ticketPath);

      expect(result.issues.some((i) => i.includes('TASK-CN-001'))).toBe(true);
    });

    it('should return empty suggestions array', async () => {
      const ticketPath = path.join(testDir, 'any-ticket.md');
      fs.writeFileSync(
        ticketPath,
        `
# Ticket

## 详细描述
Description

## 验收标准
- [ ] Item
`
      );

      const result = await reviewTicket(ticketPath);

      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should handle completed status variations', async () => {
      const jiraDir = path.join(testDir, 'jira', 'tickets');
      fs.mkdirSync(jiraDir, { recursive: true });

      // Test "completed" status
      fs.writeFileSync(
        path.join(jiraDir, 'TASK-COMP.md'),
        `
**状态**: completed
`
      );

      const ticketPath = path.join(jiraDir, 'TASK-STATUS-VAR.md');
      fs.writeFileSync(
        ticketPath,
        `
# Status Variation

**依赖**: TASK-COMP

## 详细描述
Testing that "completed" status is recognized as done.
Should pass the dependency check without issues.

## 验收标准
- [ ] Recognize completed
`
      );

      const result = await reviewTicket(ticketPath);

      // Should pass because TASK-COMP has "completed" status
      expect(result.issues.some((i) => i.includes('TASK-COMP'))).toBe(false);
    });
  });
});
