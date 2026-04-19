import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { SQLiteClient } from '../src/core/sqlite-client.js';
import type { SkillNodeRecord } from '../src/types/index.js';

function makeTmpDb(): { client: SQLiteClient; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-skill-graph-'));
  const dbPath = path.join(dir, 'test.db');
  const client = new SQLiteClient(dbPath);
  client.connect();
  return {
    client,
    cleanup: () => {
      client.close();
      fs.rmSync(dir, { recursive: true });
    },
  };
}

describe('skill_graph: registerSkillNode', () => {
  it('inserts a new skill node and retrieves it', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      const node: SkillNodeRecord = {
        id: 'node-1',
        type: 'skill',
        domain: 'coding',
        level: 2,
        model_hint: 'sonnet',
        triggers: ['code review', 'refactor'],
      };
      await client.registerSkillNode(node);
      const result = await client.getSkillNode('node-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('node-1');
      expect(result!.type).toBe('skill');
      expect(result!.domain).toBe('coding');
      expect(result!.level).toBe(2);
      expect(result!.model_hint).toBe('sonnet');
      expect(result!.triggers).toEqual(['code review', 'refactor']);
    } finally {
      cleanup();
    }
  });

  it('replaces existing node on duplicate id', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      const node: SkillNodeRecord = { id: 'node-2', type: 'skill', domain: 'ops', level: 1 };
      await client.registerSkillNode(node);
      const updated: SkillNodeRecord = { id: 'node-2', type: 'expert', domain: 'devops', level: 3 };
      await client.registerSkillNode(updated);
      const result = await client.getSkillNode('node-2');
      expect(result!.type).toBe('expert');
      expect(result!.domain).toBe('devops');
      expect(result!.level).toBe(3);
    } finally {
      cleanup();
    }
  });
});

describe('skill_graph: getSkillNode', () => {
  it('returns null for non-existent id', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      const result = await client.getSkillNode('no-such-id');
      expect(result).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('handles node with no optional fields', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      const node: SkillNodeRecord = { id: 'bare', type: 'expert', domain: 'infra', level: 1 };
      await client.registerSkillNode(node);
      const result = await client.getSkillNode('bare');
      expect(result!.model_hint).toBeUndefined();
      expect(result!.triggers).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

describe('skill_graph: upsertSkillEdge', () => {
  it('inserts edge on first call', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.upsertSkillEdge('a', 'b');
      const db = client.getDB()!;
      const row = db.prepare('SELECT co_activation_count FROM skill_edges WHERE source_id=? AND target_id=?').get('a', 'b') as { co_activation_count: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.co_activation_count).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('increments co_activation_count on subsequent calls', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.upsertSkillEdge('x', 'y');
      await client.upsertSkillEdge('x', 'y');
      await client.upsertSkillEdge('x', 'y');
      const db = client.getDB()!;
      const row = db.prepare('SELECT co_activation_count FROM skill_edges WHERE source_id=? AND target_id=?').get('x', 'y') as { co_activation_count: number };
      expect(row.co_activation_count).toBe(3);
    } finally {
      cleanup();
    }
  });
});
