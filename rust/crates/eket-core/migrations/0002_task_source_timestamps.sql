-- Migration 0002: TASK-255 + TASK-256
-- Add source column (task origin tracking) and key timestamp columns

ALTER TABLE tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'cli';
ALTER TABLE tickets ADD COLUMN claimed_at   DATETIME;
ALTER TABLE tickets ADD COLUMN blocked_at   DATETIME;
ALTER TABLE tickets ADD COLUMN unblocked_at DATETIME;
ALTER TABLE tickets ADD COLUMN completed_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_tickets_source ON tickets(source);
