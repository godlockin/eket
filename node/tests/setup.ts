import fs from 'fs';
import path from 'path';

// When running tests from /node directory, cwd is /node
const NODE_DIR = process.cwd();
const REPO_ROOT = path.resolve(NODE_DIR, '..');

// Setup runs ONCE before all test suites
beforeAll(() => {
  // .eket directory exists as symlink, ensure subdirectories
  const eketTestInboxes = path.join(NODE_DIR, '.eket', 'test-inboxes');
  if (!fs.existsSync(eketTestInboxes)) {
    fs.mkdirSync(eketTestInboxes, { recursive: true });
  }

  // Create test-fixtures directory IN REPO ROOT (for hooks)
  const fixturesDir = path.join(REPO_ROOT, 'test-fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Create valid ticket fixture
  const validTicketPath = path.join(fixturesDir, 'valid-ticket.md');
  if (!fs.existsSync(validTicketPath)) {
    const validTicket = `---
id: TEST-001
status: ready
title: Test Ticket
assignee: slaver-qa-001
pr_url: https://github.com/test/repo/pull/123
---

# Test Ticket

PR: https://github.com/test/repo/pull/123

Test ticket content for hook validation.

## Test Output

Tests passed with 100% coverage.

## Acceptance Criteria
- [ ] Test criteria 1
- [ ] Test criteria 2

## Notes
Test notes here.
`;
    fs.writeFileSync(validTicketPath, validTicket);
  }

  // Create invalid ticket fixture (missing PR URL)
  const invalidTicketPath = path.join(fixturesDir, 'invalid-ticket-no-pr.md');
  if (!fs.existsSync(invalidTicketPath)) {
    const invalidTicket = `---
id: TEST-002
status: ready
title: Invalid Ticket - Missing PR URL
assignee: slaver-qa-001
---

# Invalid Ticket

This ticket is missing pr_url field.
`;
    fs.writeFileSync(invalidTicketPath, invalidTicket);
  }

  // Create task-split test fixtures
  const taskSplitDir = path.join(fixturesDir, 'task-split');
  if (!fs.existsSync(taskSplitDir)) {
    fs.mkdirSync(taskSplitDir, { recursive: true });
  }
});

// NO cleanup - let CI handle it to avoid race conditions

