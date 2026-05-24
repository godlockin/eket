# Task Analysis Report: TASK-Z02

**Slaver**: backend_dev
**Analysis Time**: 2026-05-24 13:12
**Estimated Hours**: 4 hours

## 1. Requirements Understanding
The objective is to implement high-throughput native pub/sub message bus capabilities in Rust.
- **AC-1 (Native Redis Pub/Sub)**: Utilize background threads / tasks with async I/O listening to Redis channels (e.g. `eket:bus`), broadcasting events to in-process subscribers with sub-millisecond dispatching.
- **AC-2 (Disk Queue Fallback)**: In case of Redis connection drops, degrade gracefully to writing local serialized WAL files at `.eket/data/queue/*.msg` with high performance and no thread locks.
- **AC-3 (WAL Logs Reconciliation)**: Native `StateReconciler` mechanism to scan, process, replay, and delete local fallback `.msg` files when Redis recovers connection.

## 2. Technical Approach
- **In-process Broadcasting**:
  - `EventBus` implemented via Tokio's broadcast channels (`tokio::sync::broadcast`) for extremely high concurrent message dispatching.
  - Dedicated channels per event type to avoid lock contention.
  - Built-in retry and dead-letter queue (LRU backed).
- **WAL Fallback & Replay**:
  - Thread-safe serialization of `DomainEvent` (with id, type, source, timestamp, payload, retry).
  - Robust local disk-backed WAL persistence.
  - `StateReconciler` background scanner to read, replay (re-publish), and prune the log queue directory on demand.

## 3. Impact Analysis
| Module | Impact Level | Notes |
|--------|-------------|-------|
| `eket-engine` | High | High performance `EventBus` handles all system events under `event_bus.rs`. |
| `eket-core` | Low | Integrates with DB and redis adapters. |

## 4. Task Breakdown
| Sub-task | Estimate | Priority |
|----------|----------|----------|
| Design verification & schema validation | 1h | P0 |
| WAL serialization & disk queue fallback | 1h | P0 |
| Reconciler & recovery logic alignment | 2h | P0 |

## 5. Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| IO blockage during high WAL write loads | Low | Medium | Utilize Tokio async file writes (`tokio::fs::write`) to run non-blocking IO. |
| Message out-of-order execution | Medium | Medium | Maintain precise timestamp sorting and serial processing in the WAL recovery loop. |
