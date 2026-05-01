/**
 * Tests for EnvelopeManager (TASK-118)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { EnvelopeManager } from '../../src/core/envelope-manager.js';
import type { TaskEnvelope } from '../../src/types/index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envelope-manager-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('EnvelopeManager', () => {
  test('write envelope creates JSON file in envelopes dir', async () => {
    const manager = new EnvelopeManager(tmpDir);
    const envelope: TaskEnvelope = {
      ticketId: 'TASK-118',
      mode: 'default',
      requiredSkills: ['git-master', 'typescript-expert'],
      dispatchedAt: 1700000000000,
    };

    await manager.writeEnvelope(envelope);

    const filePath = path.join(tmpDir, 'envelopes', 'TASK-118.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TaskEnvelope;
    expect(parsed.ticketId).toBe('TASK-118');
    expect(parsed.mode).toBe('default');
    expect(parsed.requiredSkills).toEqual(['git-master', 'typescript-expert']);
  });

  test('read envelope returns written envelope', async () => {
    const manager = new EnvelopeManager(tmpDir);
    const envelope: TaskEnvelope = {
      ticketId: 'TASK-200',
      mode: 'ultrawork',
      requiredSkills: ['security-review'],
      contextSnapshot: 'some context',
      dispatchedAt: 1700000001000,
    };

    await manager.writeEnvelope(envelope);
    const result = await manager.readEnvelope('TASK-200');

    expect(result).not.toBeNull();
    expect(result?.ticketId).toBe('TASK-200');
    expect(result?.mode).toBe('ultrawork');
    expect(result?.contextSnapshot).toBe('some context');
  });

  test('read returns null for missing envelope', async () => {
    const manager = new EnvelopeManager(tmpDir);
    const result = await manager.readEnvelope('TASK-999');
    expect(result).toBeNull();
  });

  test('write overwrites existing envelope', async () => {
    const manager = new EnvelopeManager(tmpDir);
    const envelope1: TaskEnvelope = {
      ticketId: 'TASK-300',
      mode: 'default',
      requiredSkills: ['skill-a'],
      dispatchedAt: 1000,
    };
    const envelope2: TaskEnvelope = {
      ticketId: 'TASK-300',
      mode: 'debug',
      requiredSkills: ['skill-b'],
      dispatchedAt: 2000,
    };

    await manager.writeEnvelope(envelope1);
    await manager.writeEnvelope(envelope2);
    const result = await manager.readEnvelope('TASK-300');

    expect(result?.mode).toBe('debug');
    expect(result?.requiredSkills).toEqual(['skill-b']);
    expect(result?.dispatchedAt).toBe(2000);
  });
});
