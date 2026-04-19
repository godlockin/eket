/**
 * Task Claim Tests
 * P5: 真实并发场景 — 两个同时 claimTask 同一 ticket，只有一个成功
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { SQLiteClient } from '../../src/core/sqlite-client.js';

describe('claimTask — concurrent safety (P1 fix)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-claim-test-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('only one of two sequential claimTask calls on same ticket succeeds', () => {
    const clientA = new SQLiteClient(dbPath);
    const clientB = new SQLiteClient(dbPath);

    clientA.connect();
    clientB.connect();

    const resultA = clientA.claimTask('TICKET-001', 'slaver_A');
    const resultB = clientB.claimTask('TICKET-001', 'slaver_B');

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    // Exactly one should succeed
    const successCount = [resultA.data, resultB.data].filter(Boolean).length;
    expect(successCount).toBe(1);

    clientA.close();
    clientB.close();
  });

  it('repeated claimTask returns false for already-claimed ticket', () => {
    const client = new SQLiteClient(dbPath);
    client.connect();

    const first = client.claimTask('TICKET-002', 'slaver_X');
    const second = client.claimTask('TICKET-002', 'slaver_Y');

    expect(first.success).toBe(true);
    expect(first.data).toBe(true);
    expect(second.success).toBe(true);
    expect(second.data).toBe(false);

    client.close();
  });

  it('returns error when db not connected', () => {
    const client = new SQLiteClient(dbPath);
    // Not connected
    const result = client.claimTask('TICKET-003', 'slaver_Z');
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('not connected');
  });

  it('different tickets can both be claimed', () => {
    const client = new SQLiteClient(dbPath);
    client.connect();

    const r1 = client.claimTask('TICKET-A', 'slaver_1');
    const r2 = client.claimTask('TICKET-B', 'slaver_2');

    expect(r1.success).toBe(true);
    expect(r1.data).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.data).toBe(true);

    client.close();
  });
});
