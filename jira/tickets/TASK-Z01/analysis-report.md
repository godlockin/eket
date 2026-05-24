# Task Analysis Report: TASK-Z01

**Slaver**: backend_dev
**Analysis Time**: 2026-05-24 13:10
**Estimated Hours**: 4 hours

## 1. Requirements Understanding
The objective is to implement a robust, production-grade native Master Election & Slaver Registry in Rust.
- **AC-1 (Native Election Lock)**: Elect a single active Master among multiple eket instances. The election must support three levels of fallback (Redis SETNX distributed lock -> SQLite database lease -> physical file lock). The Rust implementation uses database transactions and file locking to prevent split-brain.
- **AC-2 (Atomic Lease Renewal)**: Master lease must renew periodically (TTL/2 = 15s). If a renewal fails repeatedly (3 times), the current Master must resign and release the locks so that standby instances can take over within 1s.
- **AC-3 (Slaver Registry & Heartbeat)**: Slaves register themselves and send heartbeats to update the SQLite `slaver_instances` table, keeping status accurate and response times ultra-low (< 2ms).

## 2. Technical Approach
- **Election Levels**:
  - `Redis`: Attempt to set `eket:master:lock` with `instance_id` and TTL using `setnx`. Bumps the `eket:master:epoch` via atomic increment on success.
  - `SQLite`: Execute transaction to insert/ignore in `master_lock` table. The singleton constraint (`singleton = 1`) ensures exactly one winner.
  - `File`: Write `.eket/state/master.lock` containing `{pid}:{instance_id}:{expires_at_unix}`. Checks for dead PIDs or expired leases to handle stale locks gracefully.
- **Renewal & Resignation**:
  - Utilize background loops (Tokio intervals) to renew leases.
  - Lua CAS script for Redis to verify ownership before extending expiration.
  - sqlite `update_heartbeat` to extend SQLite expiration time.
  - Stop signals via oneshot channels to ensure clean teardown upon resignation.
- **Slaver Registry**:
  - SQLite table `slaver_instances` records `id`, `role`, `skills_json`, `status`, `last_seen`, `metadata_json`.
  - Atomicity in `set_status` using CAS-like updates (e.g., verifying `busy` state before setting to `idle`).
  - Redis replication/cache mapping for slaver instances to provide sub-millisecond query latency.

## 3. Impact Analysis
| Module | Impact Level | Notes |
|--------|-------------|-------|
| `eket-core` | Medium | New features for robust master election and slaver registration, already structured in `election.rs` and `registry.rs`. |
| `eket-engine` | Low | Uses standard DB structures and event mechanisms. |

## 4. Task Breakdown
| Sub-task | Estimate | Priority |
|----------|----------|----------|
| Design verification & schema validation | 1h | P0 |
| Implementation check & code alignment | 1h | P0 |
| Verification test suites execution | 2h | P0 |

## 5. Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SQLite concurrency lock contention | Low | Medium | Throttled SQLite concurrent accesses using a shared tokio semaphore. |
| Redis temporary network partition | Medium | High | Automatic level-by-level graceful degradation (Redis -> SQLite -> File lock). |
