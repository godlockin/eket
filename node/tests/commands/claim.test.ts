/**
 * Task Claim Concurrent Tests
 * 验证 claimTask 防竞争：两个同时 claimTask 同一 ticket，只有一个成功
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { SQLiteClient } from '../../src/core/sqlite-client.js';

describe('claimTask concurrent safety', () => {
  let dbPath: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-claim-test-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('only one of two concurrent claimTask calls succeeds', () => {
    const clientA = new SQLiteClient(dbPath);
    const clientB = new SQLiteClient(dbPath);

    clientA.connect();
    // Both share same DB file - connect B to same db
    clientB.connect();

    const resultA = clientA.claimTaskById('TICKET-001', 'slaver_A');
    const resultB = clientB.claimTaskById('TICKET-001', 'slaver_B');

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    // Exactly one should have claimed it
    const successCount = [resultA.data, resultB.data].filter(Boolean).length;
    expect(successCount).toBe(1);

    clientA.close();
    clientB.close();
  });

  it('same slaver can detect already-claimed ticket', () => {
    const client = new SQLiteClient(dbPath);
    client.connect();

    const first = client.claimTaskById('TICKET-002', 'slaver_X');
    const second = client.claimTaskById('TICKET-002', 'slaver_Y');

    expect(first.success).toBe(true);
    expect(first.data).toBe(true);
    expect(second.success).toBe(true);
    expect(second.data).toBe(false); // already claimed

    client.close();
  });

  it('claimTask fails gracefully when db not connected', () => {
    const client = new SQLiteClient(dbPath);
    // Not connected
    const result = client.claimTaskById('TICKET-003', 'slaver_Z');
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('not connected');
  });

  it('two different tickets can both be claimed', () => {
    const client = new SQLiteClient(dbPath);
    client.connect();

    const r1 = client.claimTaskById('TICKET-A', 'slaver_1');
    const r2 = client.claimTaskById('TICKET-B', 'slaver_2');

    expect(r1.success).toBe(true);
    expect(r1.data).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.data).toBe(true);

    client.close();
  });
});
