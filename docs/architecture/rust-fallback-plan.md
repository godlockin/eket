# EKET Rust Rewrite — Fallback Plan

Three levels of fallback, activated in order if Rust migration fails at any phase.

---

## F1 — Shell Wrapper (Zero-risk rollback, instant)

Wrap every `eket` binary call to transparently proxy to the TS implementation.

### Implementation

```bash
#!/usr/bin/env bash
# install: ln -sf /path/to/eket-wrapper.sh /usr/local/bin/eket
# ENV: EKET_USE_RUST=1 (opt-in), EKET_USE_RUST=0 (force TS)

RUST_BIN="$(dirname "$0")/../rust/target/release/eket"
TS_BIN="node $(dirname "$0")/node/dist/index.js"

if [[ "${EKET_USE_RUST:-0}" == "1" ]] && [[ -x "$RUST_BIN" ]]; then
  exec "$RUST_BIN" "$@"
else
  exec $TS_BIN "$@"
fi
```

### Activation

```bash
export EKET_USE_RUST=0   # immediate rollback to TS
export EKET_USE_RUST=1   # opt-in to Rust
```

### When to use

- Any Rust binary crash in production
- JSON output format regression detected
- Phase 1-3: default mode (TS is primary)

---

## F2 — Module-level Feature Config (Fine-grained, per-module)

Each Rust module respects `EKET_RUST_MODULE` env prefix. Node.js shim checks before delegating.

### Config format (`~/.eket/config.toml` or env)

```toml
[rust]
enabled = true           # global Rust binary enabled
modules.election = true  # master election via Rust
modules.queue = true     # message queue via Rust
modules.circuit_breaker = true
modules.task_claim = true
modules.task_complete = true
```

### Env overrides

```bash
EKET_RUST_ELECTION=0          # fallback election to TS
EKET_RUST_QUEUE=0             # fallback queue to file mode
EKET_RUST_CIRCUIT_BREAKER=0   # disable circuit breaker entirely
EKET_RUST_TASK_CLAIM=0        # proxy task:claim to TS
```

### Node.js shim pattern

```typescript
// node/src/commands/claim.ts
const useRust = process.env.EKET_RUST_TASK_CLAIM !== '0'
  && existsSync(RUST_BIN_PATH);

if (useRust) {
  const result = await execFile(RUST_BIN_PATH, ['task:claim', ticketId]);
  return JSON.parse(result.stdout);
} else {
  return claimTicketTS(ticketId); // original TS implementation
}
```

### When to use

- Single module regression (e.g., election logic incorrect)
- A/B testing Rust vs TS behavior
- Phase 3-4: incremental module cutover

---

## F3 — Emergency Rollback Script (Nuclear option)

Complete rollback to pre-Rust state: disables Rust binary, restores Node symlinks, clears Rust state from SQLite/Redis.

### Script

```bash
#!/usr/bin/env bash
# usage: ./scripts/emergency-rollback.sh [--confirm]
set -euo pipefail

if [[ "${1:-}" != "--confirm" ]]; then
  echo "EMERGENCY ROLLBACK: This will disable all Rust components and revert to TS."
  echo "Run with --confirm to proceed."
  exit 1
fi

echo "=== EKET Emergency Rollback ==="

# 1. Disable Rust binary
export EKET_USE_RUST=0
echo "EKET_USE_RUST=0" >> ~/.eket/.env

# 2. Remove Rust-specific SQLite tables (if migration added new columns/tables)
sqlite3 ~/.eket/data/sqlite/eket.db "
  DELETE FROM instances WHERE metadata LIKE '%rust%';
  UPDATE instances SET status = 'inactive' WHERE role = 'master';
" 2>/dev/null || true

# 3. Clear Redis Rust lock keys
redis-cli DEL eket:master:lock 2>/dev/null || true
redis-cli DEL eket:queue:* 2>/dev/null || true

# 4. Restore Node.js symlink
ln -sf "$(pwd)/node/dist/index.js" /usr/local/bin/eket-node
ln -sf /usr/local/bin/eket-node /usr/local/bin/eket

# 5. Kill any running Rust processes
pkill -f "eket server" 2>/dev/null || true
pkill -f "eket-engine" 2>/dev/null || true

# 6. Restart Node.js services
node dist/index.js server:start --no-rust &

echo "=== Rollback complete. EKET running on Node.js ==="
echo "Verify with: node dist/index.js system:doctor"
```

### When to use

- Data corruption detected (SQLite/Redis state)
- Rust binary segfault / memory corruption
- Production outage requiring instant recovery
- Phase 5 migration failure

---

## Rollback Decision Matrix

| Symptom | Action | ETA |
|---------|--------|-----|
| Rust binary crash (SIGSEGV) | F1: `EKET_USE_RUST=0` | < 1 min |
| JSON output schema mismatch | F2: disable specific module | < 5 min |
| Election split-brain detected | F2: `EKET_RUST_ELECTION=0` | < 5 min |
| SQLite data corruption | F3 emergency rollback | < 15 min |
| Redis key collision with TS | F2: `EKET_RUST_QUEUE=0` | < 5 min |
| Full system degradation | F3 emergency rollback | < 15 min |

---

## Monitoring / Detection

```bash
# Automated regression check (run in CI after each Rust deploy)
./scripts/compare-output.sh task:claim TASK-001
# Compares Rust JSON output to TS reference output, fails on schema diff

# Health check (30s interval in production)
eket system:doctor --format json | jq '.rust_binary_ok'
```

---

## JSON Output Compatibility Contract

All Rust commands MUST produce JSON-compatible with TS versions.
Reference: `node/src/commands/claim.ts` output schema.

Critical fields that must match exactly:
- `task:claim`: `status`, `ticket_id`, `title`, `assignee`, `type`, `worktree_path`
- `task:complete`: `status`, `ticket_id`, `slaver_id`, `next`
- `system:doctor`: `sqlite`, `redis`, `overall`

Run compatibility test: `cargo test --test json_compat`
