/**
 * EKET Framework - Event Graph Tests (TASK-044)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  initEventGraphSchema,
  recordEvent,
  queryBlockedHotspots,
  queryTicketTimeline,
} from '../../src/core/event-graph.js';

describe('event-graph', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initEventGraphSchema(db);
  });

  it('recordEvent writes to sdlc_events', () => {
    recordEvent(db, {
      ticketId: 'TASK-001',
      eventType: 'transition',
      fromStatus: 'ready',
      toStatus: 'in_progress',
    });
    const rows = db.prepare('SELECT * FROM sdlc_events').all();
    expect(rows).toHaveLength(1);
  });

  it('queryBlockedHotspots returns top blocked', () => {
    recordEvent(db, {
      ticketId: 'T1',
      eventType: 'hook_blocked',
      fromStatus: 'ready',
      toStatus: 'pr_review',
      errorCode: 'HOOK_BLOCKED',
    });
    recordEvent(db, {
      ticketId: 'T2',
      eventType: 'hook_blocked',
      fromStatus: 'ready',
      toStatus: 'pr_review',
      errorCode: 'HOOK_BLOCKED',
    });
    const hotspots = queryBlockedHotspots(db);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]!.count).toBe(2);
    expect(hotspots[0]!.tickets).toContain('T1');
  });

  it('queryTicketTimeline returns events in order', () => {
    recordEvent(db, {
      ticketId: 'TASK-042',
      eventType: 'transition',
      fromStatus: 'backlog',
      toStatus: 'ready',
    });
    recordEvent(db, {
      ticketId: 'TASK-042',
      eventType: 'transition',
      fromStatus: 'ready',
      toStatus: 'in_progress',
    });
    const timeline = queryTicketTimeline(db, 'TASK-042');
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.fromStatus).toBe('backlog');
  });

  it('recordEvent does not throw on optional fields omitted', () => {
    expect(() => {
      recordEvent(db, { ticketId: 'T99', eventType: 'completed' });
    }).not.toThrow();
    const rows = db.prepare("SELECT * FROM sdlc_events WHERE ticket_id='T99'").all();
    expect(rows).toHaveLength(1);
  });
});
