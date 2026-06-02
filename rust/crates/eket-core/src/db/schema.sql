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
    id               TEXT PRIMARY KEY,
    role             TEXT NOT NULL,
    skills_json      TEXT NOT NULL DEFAULT '[]',
    status           TEXT NOT NULL DEFAULT 'idle',
    last_seen        INTEGER,
    metadata_json    TEXT NOT NULL DEFAULT '{}',
    completed_count  INTEGER NOT NULL DEFAULT 0,
    failed_count     INTEGER NOT NULL DEFAULT 0,
    total_latency_ms INTEGER NOT NULL DEFAULT 0
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

-- TASK-180: Master election singleton lock (mutual exclusion)
-- Only ONE row ever exists (singleton=1), enforced by CHECK + PRIMARY KEY.
-- INSERT OR IGNORE: first writer wins; subsequent inserts are silently ignored.
CREATE TABLE IF NOT EXISTS master_lock (
    singleton   INTEGER PRIMARY KEY CHECK(singleton = 1),
    master_id   TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);

-- Message History Table for StateReconciler and general message tracing
CREATE TABLE IF NOT EXISTS message_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  TEXT UNIQUE,
    from_agent  TEXT,
    to_agent    TEXT,
    type        TEXT,
    payload     TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_type ON message_history(type);

-- TASK-650: DAG Run Checkpoint Tables for crash recovery
-- dag_runs: Each DAG execution run
CREATE TABLE IF NOT EXISTS dag_runs (
    id           TEXT PRIMARY KEY,
    epic_id      TEXT NOT NULL,
    yaml_content TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending, running, done, failed, aborted
    engine_level INTEGER NOT NULL DEFAULT 3,       -- L1=Rust, L2=Node.js, L3=Shell
    started_at   INTEGER,
    finished_at  INTEGER,
    error_msg    TEXT,
    created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dag_runs_epic ON dag_runs(epic_id);
CREATE INDEX IF NOT EXISTS idx_dag_runs_status ON dag_runs(status);

-- dag_node_states: State of each node in a DAG run
CREATE TABLE IF NOT EXISTS dag_node_states (
    run_id      TEXT NOT NULL,
    node_id     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending, ready, dispatched, running, done, failed, skipped
    started_at  INTEGER,
    finished_at INTEGER,
    exit_code   INTEGER,
    error_msg   TEXT,
    attempt     INTEGER NOT NULL DEFAULT 0,       -- TASK-656: Idempotency key component
    PRIMARY KEY (run_id, node_id),
    FOREIGN KEY (run_id) REFERENCES dag_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dag_node_states_status ON dag_node_states(status);
CREATE INDEX IF NOT EXISTS idx_dag_node_states_run ON dag_node_states(run_id);

