-- EKET SQLite Schema — 对应 TS: sqlite-client.ts initializeDatabase()
-- 使用 IF NOT EXISTS，幂等可重复执行

CREATE TABLE IF NOT EXISTS tickets (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'todo',
    priority    TEXT NOT NULL DEFAULT 'P2',
    type        TEXT NOT NULL DEFAULT 'feature',
    assignee    TEXT,
    dependencies TEXT,   -- JSON array: ["TASK-001", "TASK-002"]
    metadata    TEXT,    -- JSON blob
    content     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_checkpoints (
    ticket_id   TEXT NOT NULL,
    slaver_id   TEXT NOT NULL,
    phase       TEXT NOT NULL,
    session_id  TEXT,
    metadata    TEXT,    -- JSON blob
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (ticket_id, slaver_id)
);

CREATE TABLE IF NOT EXISTS instances (
    id          TEXT PRIMARY KEY,
    role        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    last_seen   TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retros (
    id          TEXT PRIMARY KEY,
    ticket_id   TEXT,
    slaver_id   TEXT,
    content     TEXT NOT NULL,
    tags        TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_spans (
    id          TEXT PRIMARY KEY,
    ticket_id   TEXT,
    slaver_id   TEXT,
    tool        TEXT NOT NULL,
    args        TEXT,    -- JSON
    output      TEXT,    -- JSON
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
    id          TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   BLOB,    -- reserved for future vector search
    indexed_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee);
CREATE INDEX IF NOT EXISTS idx_trace_spans_ticket ON trace_spans(ticket_id);
CREATE INDEX IF NOT EXISTS idx_retros_ticket ON retros(ticket_id);

-- Instance registry (slaver_instances)
CREATE TABLE IF NOT EXISTS slaver_instances (
    id            TEXT PRIMARY KEY,
    role          TEXT NOT NULL,
    skills_json   TEXT NOT NULL DEFAULT '[]',
    status        TEXT NOT NULL DEFAULT 'idle',
    last_seen     INTEGER,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_slaver_instances_role ON slaver_instances(role);
CREATE INDEX IF NOT EXISTS idx_slaver_instances_last_seen ON slaver_instances(last_seen);

-- Execution state for registry (ticket-level, simple JSON blob)
CREATE TABLE IF NOT EXISTS instance_execution_states (
    ticket_id   TEXT PRIMARY KEY,
    slaver_id   TEXT NOT NULL,
    state_json  TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
