/**
 * TASK-042: message-bus tests
 * 6 tests covering BaseMessage validation + sendMessage + readMessage
 */

import { jest } from '@jest/globals';
import { writeFile as _writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BaseMessage } from '../../src/types/messages.js';
import { EketErrorCode } from '../../src/types/index.js';

// ---- helpers ----
function validBase() {
  return {
    type: 'task_completed' as const,
    from: 'slaver-1',
    to: 'master',
    ticketId: 'TASK-042',
    timestamp: new Date().toISOString(),
    payload: { summary: 'done', testsRun: 6, testsPassed: 6 },
  };
}

// ============================================================
// Test 1: valid BaseMessage passes safeParse
// ============================================================
test('valid BaseMessage passes safeParse', () => {
  const result = BaseMessage.safeParse(validBase());
  expect(result.success).toBe(true);
});

// ============================================================
// Test 2: missing required field fails safeParse
// ============================================================
test('missing required field fails safeParse', () => {
  const msg = validBase() as Partial<ReturnType<typeof validBase>>;
  delete msg.ticketId;
  const result = BaseMessage.safeParse(msg);
  expect(result.success).toBe(false);
});

// ============================================================
// Test 3: wrong type enum value fails safeParse
// ============================================================
test('wrong type enum value fails safeParse', () => {
  const msg = { ...validBase(), type: 'invalid_type_xyz' };
  const result = BaseMessage.safeParse(msg);
  expect(result.success).toBe(false);
});

// ============================================================
// Test 4: readMessage returns INVALID_MESSAGE on malformed JSON
// ============================================================
test('readMessage returns INVALID_MESSAGE on malformed JSON', async () => {
  const { readMessage } = await import('../../src/core/message-bus.js');

  const filePath = join(tmpdir(), `eket-test-${randomUUID()}.json`);
  await _writeFile(filePath, '{ not valid json !!!', 'utf-8');

  const result = await readMessage(filePath);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.code).toBe(EketErrorCode.INVALID_MESSAGE);
  }
});

// ============================================================
// Test 5: readMessage returns FILE_READ_ERROR on non-existent file
// ============================================================
test('readMessage returns FILE_READ_ERROR on non-existent file', async () => {
  const { readMessage } = await import('../../src/core/message-bus.js');

  const filePath = join(tmpdir(), `eket-nonexistent-${randomUUID()}.json`);
  const result = await readMessage(filePath);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.code).toBe(EketErrorCode.FILE_READ_ERROR);
  }
});

// ============================================================
// Test 6: sendMessage returns INVALID_MESSAGE on invalid message
// ============================================================
test('sendMessage returns INVALID_MESSAGE on invalid message', async () => {
  const { sendMessage } = await import('../../src/core/message-bus.js');

  // Pass a structurally invalid message (missing required fields)
  const invalidMsg = {
    type: 'task_completed',
    from: '',        // empty string — fails min(1)
    to: '',          // empty string — fails min(1)
    ticketId: '',    // empty string — fails min(1)
    timestamp: 'not-a-datetime',
    payload: {},
  } as Parameters<typeof sendMessage>[1];

  const result = await sendMessage('/tmp/fake-repo', invalidMsg);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.code).toBe(EketErrorCode.INVALID_MESSAGE);
  }
});
