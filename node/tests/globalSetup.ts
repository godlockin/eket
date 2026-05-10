import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

async function globalSetup() {
  // Create .eket directory structure
  const eketDir = path.join(REPO_ROOT, '.eket');
  const inboxDir = path.join(eketDir, 'inbox');
  const logsDir = path.join(eketDir, 'logs');
  const recoveryDir = path.join(eketDir, 'recovery');

  fs.mkdirSync(eketDir, { recursive: true });
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(recoveryDir, { recursive: true });

  // Create test-fixtures directory
  const fixturesDir = path.join(REPO_ROOT, 'test-fixtures');
  fs.mkdirSync(fixturesDir, { recursive: true });

  // Create valid ticket fixture
  const validTicket = `---
id: TEST-001
status: ready
title: Test Ticket
assignee: slaver-qa-001
pr_url: https://github.com/test/repo/pull/123
---

# Test Ticket

Test ticket content for hook validation.

## Acceptance Criteria
- [ ] Test criteria 1
- [ ] Test criteria 2

## Notes
Test notes here.
`;

  fs.writeFileSync(path.join(fixturesDir, 'valid-ticket.md'), validTicket);

  // Create invalid ticket fixture (missing PR URL)
  const invalidTicket = `---
id: TEST-002
status: ready
title: Invalid Ticket - Missing PR URL
assignee: slaver-qa-001
---

# Invalid Ticket

This ticket is missing pr_url field.
`;

  fs.writeFileSync(path.join(fixturesDir, 'invalid-ticket-no-pr.md'), invalidTicket);

  // Create task-split test fixtures
  const taskSplitDir = path.join(fixturesDir, 'task-split');
  fs.mkdirSync(taskSplitDir, { recursive: true });

  console.log('[Global Setup] Created test directories and fixtures:');
  console.log(`  - ${eketDir}`);
  console.log(`  - ${fixturesDir}`);
  console.log(`  - ${taskSplitDir}`);
}

export default globalSetup;
