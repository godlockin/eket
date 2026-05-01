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

describe('skill_graph: updateEdgeWeight', () => {
  it('inserts edge with clamped weight when not exists', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.updateEdgeWeight('a', 'b', 0.2);
      const db = client.getDB()!;
      const row = db.prepare('SELECT weight, active FROM skill_edges WHERE source_id=? AND target_id=?').get('a', 'b') as { weight: number; active: number };
      expect(row).toBeDefined();
      expect(row.weight).toBeCloseTo(0.7, 5);
      expect(row.active).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('updates weight and soft-deletes when weight < 0.1', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.upsertSkillEdge('c', 'd'); // weight=0.5
      await client.updateEdgeWeight('c', 'd', -0.45); // 0.5 - 0.45 = 0.05 < 0.1
      const db = client.getDB()!;
      const row = db.prepare('SELECT weight, active FROM skill_edges WHERE source_id=? AND target_id=?').get('c', 'd') as { weight: number; active: number };
      expect(row.weight).toBeCloseTo(0.05, 5);
      expect(row.active).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('clamps weight to [0, 1] on large delta', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.upsertSkillEdge('e', 'f');
      await client.updateEdgeWeight('e', 'f', 999);
      const db = client.getDB()!;
      const row = db.prepare('SELECT weight FROM skill_edges WHERE source_id=? AND target_id=?').get('e', 'f') as { weight: number };
      expect(row.weight).toBe(1.0);
    } finally {
      cleanup();
    }
  });
});

describe('skill_graph: getTopCollaborators', () => {
  it('returns active edges for node sorted by weight DESC', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      // Insert edges: n->x weight=0.8, n->y weight=0.3
      await client.updateEdgeWeight('n', 'x', 0.3);  // 0.5+0.3=0.8
      await client.updateEdgeWeight('n', 'y', -0.2); // 0.5-0.2=0.3
      const results = await client.getTopCollaborators('n', 5);
      expect(results.length).toBe(2);
      expect(results[0].target_id).toBe('x');
      expect(results[0].weight).toBeCloseTo(0.8, 5);
    } finally {
      cleanup();
    }
  });

  it('excludes inactive (soft-deleted) edges', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.updateEdgeWeight('m', 'p', 0.3);  // active, weight=0.8
      await client.updateEdgeWeight('m', 'q', -0.45); // active=0, weight=0.05
      const results = await client.getTopCollaborators('m', 5);
      expect(results.length).toBe(1);
      expect(results[0].target_id).toBe('p');
    } finally {
      cleanup();
    }
  });

  it('applies decay for edges older than 30 days', async () => {
    const { client, cleanup } = makeTmpDb();
    try {
      await client.updateEdgeWeight('old', 'node', 0.3); // weight=0.8
      // Manually set last_activated_at to 60 days ago
      const db = client.getDB()!;
      const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE skill_edges SET last_activated_at=? WHERE source_id=? AND target_id=?').run(past, 'old', 'node');
      const results = await client.getTopCollaborators('old', 5);
      expect(results.length).toBe(1);
      // 60 days: overDays=30, periods=1 => 0.8 * 0.95 = 0.76
      expect(results[0].weight).toBeCloseTo(0.8 * 0.95, 3);
    } finally {
      cleanup();
    }
  });
});
