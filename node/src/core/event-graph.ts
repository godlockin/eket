/**
 * EKET Framework - SDLC Event Graph (TASK-044)
 * Fire-and-forget event recording + hotspot/timeline queries.
 */

import Database from 'better-sqlite3';

export interface SdlcEvent {
  ticketId: string;
  eventType: 'transition' | 'hook_blocked' | 'hook_passed' | 'completed';
  fromStatus?: string;
  toStatus?: string;
  errorCode?: string;
  slaverId?: string;
}

export interface BlockedHotspot {
  fromStatus: string;
  toStatus: string;
  errorCode: string;
  count: number;
  tickets: string[];
}

export interface TicketTimelineEvent {
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  errorCode?: string;
  createdAt: string;
}

export function initEventGraphSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sdlc_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      error_code TEXT,
      slaver_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sdlc_ticket ON sdlc_events(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_sdlc_event_type ON sdlc_events(event_type);
  `);
}

export function recordEvent(db: Database.Database, event: SdlcEvent): void {
  db.prepare(`
    INSERT INTO sdlc_events (ticket_id, event_type, from_status, to_status, error_code, slaver_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.ticketId,
    event.eventType,
    event.fromStatus ?? null,
    event.toStatus ?? null,
    event.errorCode ?? null,
    event.slaverId ?? null,
  );
}

export function queryBlockedHotspots(db: Database.Database, limit = 3): BlockedHotspot[] {
  type Row = { from_status: string; to_status: string; error_code: string; cnt: number; ticket_ids: string };
  const rows = db.prepare(`
    SELECT from_status, to_status, error_code, COUNT(*) as cnt,
           GROUP_CONCAT(ticket_id) as ticket_ids
    FROM sdlc_events WHERE event_type = 'hook_blocked'
    GROUP BY from_status, to_status, error_code
    ORDER BY cnt DESC LIMIT ?
  `).all(limit) as Row[];
  return rows.map((r) => ({
    fromStatus: r.from_status,
    toStatus: r.to_status,
    errorCode: r.error_code,
    count: r.cnt,
    tickets: r.ticket_ids ? r.ticket_ids.split(',') : [],
  }));
}

export function queryTicketTimeline(db: Database.Database, ticketId: string): TicketTimelineEvent[] {
  type Row = { event_type: string; from_status: string | null; to_status: string | null; error_code: string | null; created_at: string };
  const rows = db.prepare(`
    SELECT event_type, from_status, to_status, error_code, created_at
    FROM sdlc_events WHERE ticket_id = ? ORDER BY created_at ASC
  `).all(ticketId) as Row[];
  return rows.map((r) => ({
    eventType: r.event_type,
    fromStatus: r.from_status ?? undefined,
    toStatus: r.to_status ?? undefined,
    errorCode: r.error_code ?? undefined,
    createdAt: r.created_at,
  }));
}
