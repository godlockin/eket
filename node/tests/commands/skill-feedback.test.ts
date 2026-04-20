/**
 * TASK-104b — SkillFeedback Tests
 *
 * Covers:
 * 1. saveSkillFeedback writes correctly
 * 2. getUnprocessedFeedback returns new records
 * 3. markFeedbackProcessed marks correctly
 * 4. updateEdgeWeight called for activated nodes (simulating Master heartbeat)
 * 5. task:claim recommended level logic
 */

import Database from 'better-sqlite3';
import type { SkillFeedback } from '../../src/types/index.js';

// ============================================================================
// Minimal in-memory SQLiteClient stub (mirrors sqlite-client.ts logic)
// ============================================================================

function createInMemoryClient() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      title TEXT,
      status TEXT,
      assigned_to TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      skill_feedback_json TEXT,
      feedback_processed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS skill_edges (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      co_activation_count INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      last_activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_id, target_id)
    );
  `);

  function saveSkillFeedback(ticketId: string, feedback: SkillFeedback): void {
    const json = JSON.stringify(feedback);
    const existing = db.prepare('SELECT id FROM task_history WHERE ticket_id = ?').get(ticketId);
    if (existing) {
      db.prepare('UPDATE task_history SET skill_feedback_json = ?, completed_at = CURRENT_TIMESTAMP WHERE ticket_id = ?').run(json, ticketId);
    } else {
      db.prepare("INSERT INTO task_history (ticket_id, status, skill_feedback_json, completed_at) VALUES (?, 'done', ?, CURRENT_TIMESTAMP)").run(ticketId, json);
    }
  }

  function getUnprocessedFeedback(withinHours = 1): Array<{ id: number; ticketId: string; feedback: SkillFeedback }> {
    const rows = db.prepare(`
      SELECT id, ticket_id, skill_feedback_json
      FROM task_history
      WHERE skill_feedback_json IS NOT NULL
        AND feedback_processed = 0
        AND created_at >= datetime('now', ? || ' hours')
    `).all(`-${withinHours}`) as Array<{ id: number; ticket_id: string; skill_feedback_json: string }>;
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      feedback: JSON.parse(r.skill_feedback_json) as SkillFeedback,
    }));
  }

  function markFeedbackProcessed(id: number): void {
    db.prepare('UPDATE task_history SET feedback_processed = 1 WHERE id = ?').run(id);
  }

  function updateEdgeWeight(sourceId: string, targetId: string, delta: number): void {
    const clamp = (v: number) => Math.min(1.0, Math.max(0.0, v));
    const existing = db.prepare('SELECT weight FROM skill_edges WHERE source_id = ? AND target_id = ?').get(sourceId, targetId) as { weight: number } | undefined;
    if (existing) {
      const newWeight = clamp(existing.weight + delta);
      db.prepare('UPDATE skill_edges SET weight = ?, active = ? WHERE source_id = ? AND target_id = ?').run(newWeight, newWeight < 0.1 ? 0 : 1, sourceId, targetId);
    } else {
      const newWeight = clamp(0.5 + delta);
      db.prepare('INSERT INTO skill_edges (source_id, target_id, weight, active) VALUES (?, ?, ?, ?)').run(sourceId, targetId, newWeight, newWeight < 0.1 ? 0 : 1);
    }
  }

  function getEdge(sourceId: string, targetId: string): { weight: number } | undefined {
    return db.prepare('SELECT weight FROM skill_edges WHERE source_id = ? AND target_id = ?').get(sourceId, targetId) as { weight: number } | undefined;
  }

  return { saveSkillFeedback, getUnprocessedFeedback, markFeedbackProcessed, updateEdgeWeight, getEdge };
}

// ============================================================================
// Test helpers
// ============================================================================

function makeFeedback(overrides: Partial<SkillFeedback> = {}): SkillFeedback {
  return {
    ticketId: 'TASK-104b',
    slaverId: 'slaver_test_001',
    recommendedLevel: 2,
    actualLevel: 2,
    activatedSkills: ['skill-a', 'skill-b', 'skill-c'],
    activatedExperts: ['expert-x'],
    levelChanges: [],
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SkillFeedback — saveSkillFeedback', () => {
  test('writes feedback JSON to task_history', () => {
    const client = createInMemoryClient();
    const fb = makeFeedback();
    client.saveSkillFeedback(fb.ticketId, fb);

    const records = client.getUnprocessedFeedback(24);
    expect(records).toHaveLength(1);
    expect(records[0].ticketId).toBe('TASK-104b');
    expect(records[0].feedback.slaverId).toBe('slaver_test_001');
    expect(records[0].feedback.activatedSkills).toEqual(['skill-a', 'skill-b', 'skill-c']);
  });

  test('upserts feedback when ticketId already exists', () => {
    const client = createInMemoryClient();
    const fb = makeFeedback();
    client.saveSkillFeedback(fb.ticketId, fb);
    client.saveSkillFeedback(fb.ticketId, { ...fb, actualLevel: 3 });

    const records = client.getUnprocessedFeedback(24);
    expect(records).toHaveLength(1);
    expect(records[0].feedback.actualLevel).toBe(3);
  });
});

describe('SkillFeedback — markFeedbackProcessed', () => {
  test('marks record as processed, excluded from next query', () => {
    const client = createInMemoryClient();
    const fb = makeFeedback({ ticketId: 'TASK-200' });
    client.saveSkillFeedback(fb.ticketId, fb);

    const before = client.getUnprocessedFeedback(24);
    expect(before).toHaveLength(1);

    client.markFeedbackProcessed(before[0].id);

    const after = client.getUnprocessedFeedback(24);
    expect(after).toHaveLength(0);
  });
});

describe('Master heartbeat — skill_graph weight update', () => {
  test('updateEdgeWeight called for every node pair in feedback', () => {
    const client = createInMemoryClient();
    const fb = makeFeedback({ activatedSkills: ['s1', 's2'], activatedExperts: ['e1'] });
    client.saveSkillFeedback(fb.ticketId, fb);

    const records = client.getUnprocessedFeedback(24);
    for (const record of records) {
      const nodes = [...record.feedback.activatedSkills, ...record.feedback.activatedExperts];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          client.updateEdgeWeight(nodes[i], nodes[j], 0.1);
          client.updateEdgeWeight(nodes[j], nodes[i], 0.1);
        }
      }
      client.markFeedbackProcessed(record.id);
    }

    // s1<->s2, s1<->e1, s2<->e1 all inserted with weight 0.5 + 0.1 = 0.6
    expect(client.getEdge('s1', 's2')?.weight).toBeCloseTo(0.6, 5);
    expect(client.getEdge('s1', 'e1')?.weight).toBeCloseTo(0.6, 5);
    expect(client.getEdge('s2', 'e1')?.weight).toBeCloseTo(0.6, 5);

    // All processed
    expect(client.getUnprocessedFeedback(24)).toHaveLength(0);
  });

  test('weight clamped to 1.0 after repeated updates', () => {
    const client = createInMemoryClient();
    for (let i = 0; i < 10; i++) {
      client.updateEdgeWeight('a', 'b', 0.1);
    }
    const edge = client.getEdge('a', 'b');
    expect(edge?.weight).toBeLessThanOrEqual(1.0);
    expect(edge?.weight).toBe(1.0);
  });
});

describe('task:claim — recommended level logic', () => {
  test('modelRouteTable lookup returns correct level for known domain', () => {
    const modelRouteTable: Record<string, 1 | 2 | 3> = { task: 2, feat: 3, bug: 1 };
    const ticketId = 'TASK-104b';
    const domain = ticketId.replace(/-\d+.*$/, '').toLowerCase();
    const level = modelRouteTable[domain] ?? 1;
    expect(domain).toBe('task');
    expect(level).toBe(2);
  });

  test('defaults to level 1 when domain not in modelRouteTable', () => {
    const modelRouteTable: Record<string, 1 | 2 | 3> = { feat: 3 };
    const ticketId = 'UNKNOWN-999';
    const domain = ticketId.replace(/-\d+.*$/, '').toLowerCase();
    const level = modelRouteTable[domain] ?? modelRouteTable['default'] ?? 1;
    expect(level).toBe(1);
  });
});
