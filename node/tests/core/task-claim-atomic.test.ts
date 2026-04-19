/**
 * TASK-065: claimTask 原子性测试
 *
 * 验证：同时发起 3 次 claimTask 调用，同一 ticket 只被领取一次。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { SQLiteClient } from '../../src/core/sqlite-client.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-claim-test-'));
  return path.join(dir, 'test.db');
}

function openDb(dbPath: string): SQLiteClient {
  const client = new SQLiteClient(dbPath);
  const res = client.connect();
  if (!res.success) throw new Error('Failed to connect SQLite');
  return client;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('SQLiteClient.claimTask — TASK-065', () => {
  let dbPath: string;
  let client: SQLiteClient;

  beforeEach(() => {
    dbPath = makeTempDb();
    client = openDb(dbPath);
  });

  afterEach(() => {
    client.close();
    try {
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns null when no ready tickets exist', () => {
    const result = client.claimTask('slaver-1');
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('claims a ready ticket and marks it in_progress', () => {
    client.insertTicket({ id: 'TICKET-1', title: 'Test ticket', status: 'ready', priority: 0 });

    const result = client.claimTask('slaver-1');
    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data?.id).toBe('TICKET-1');
    expect(result.data?.status).toBe('in_progress');
    expect(result.data?.assignee).toBe('slaver-1');
    expect(result.data?.claimed_at).not.toBeNull();
  });

  it('prevents double-claim: 3 concurrent claimTask calls get at most 1 winner per ticket', () => {
    // Insert a single ready ticket
    client.insertTicket({ id: 'TICKET-SOLO', title: 'Solo ticket', status: 'ready', priority: 5 });

    // Simulate 3 concurrent claims — in better-sqlite3 (sync), each runs serially
    // but the transaction guard ensures only the first changes=1 wins
    const results = [
      client.claimTask('slaver-A'),
      client.claimTask('slaver-B'),
      client.claimTask('slaver-C'),
    ];

    // Exactly one should succeed with a non-null ticket
    const winners = results.filter((r) => r.success && r.data !== null);
    expect(winners).toHaveLength(1);

    // The others should return null (ticket already taken)
    const losers = results.filter((r) => r.success && r.data === null);
    expect(losers).toHaveLength(2);
  });

  it('picks highest-priority ticket first', () => {
    client.insertTicket({ id: 'LOW', title: 'Low priority', status: 'ready', priority: 0 });
    client.insertTicket({ id: 'HIGH', title: 'High priority', status: 'ready', priority: 10 });

    const result = client.claimTask('slaver-1');
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('HIGH');
  });

  it('does not re-claim a ticket that is already in_progress', () => {
    client.insertTicket({ id: 'TAKEN', title: 'Taken', status: 'in_progress', priority: 0 });

    const result = client.claimTask('slaver-X');
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});
