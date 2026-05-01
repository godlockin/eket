#!/usr/bin/env bash
# EKET Rust End-to-End Smoke Test
set -euo pipefail

EKET="./target/debug/eket"
DB="/tmp/eket_smoke_test_$$.db"
TICKETS_DIR="/tmp/eket_smoke_tickets_$$"
MAILBOX_DIR="/tmp/eket_smoke_mailbox_$$"
PORT=19877

mkdir -p "$TICKETS_DIR" "$MAILBOX_DIR"
SERVER_PID=""
trap 'rm -rf "$DB" "$TICKETS_DIR" "$MAILBOX_DIR"; [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true' EXIT

echo "=== [1] Start server ==="
EKET_SERVER_PORT=$PORT EKET_DB_PATH=$DB EKET_TICKETS_DIR=$TICKETS_DIR $EKET server &
SERVER_PID=$!
sleep 1

echo "=== [2] Health check ==="
curl -sf "http://localhost:$PORT/health" | grep -q '"ok"'
echo "  ✓ health OK"

echo "=== [3] slaver:register ==="
OUT=$($EKET slaver:register --role backend --skills "rust,python" --db-path "$DB")
echo "$OUT" | grep -q '"registered"'
SLAVER_ID=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['instance_id'])")
echo "  ✓ registered: $SLAVER_ID"

echo "=== [4] task:create ==="
OUT=$($EKET task:create "Smoke test ticket" --priority P1 --tickets-dir "$TICKETS_DIR")
echo "$OUT" | grep -q '"created"'
TICKET_ID=$(echo "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['ticket_id'])")
echo "  ✓ created: $TICKET_ID"

echo "=== [5] GET /api/v1/tasks ==="
curl -sf "http://localhost:$PORT/api/v1/tasks" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'tasks' in d or 'total' in d or isinstance(d, list)"
echo "  ✓ /api/v1/tasks OK"

echo "=== [6] GET /api/v1/dag ==="
curl -sf "http://localhost:$PORT/api/v1/dag" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'nodes' in d and 'edges' in d"
echo "  ✓ /api/v1/dag OK"

echo "=== [7] task:progress ==="
$EKET task:progress --tickets-dir "$TICKETS_DIR" | grep -q '"total"'
echo "  ✓ task:progress OK"

echo "=== [8] team:status ==="
$EKET team:status --db-path "$DB" | grep -q '"agents"'
echo "  ✓ team:status OK"

echo "=== [9] GET /api/v1/agents ==="
curl -sf "http://localhost:$PORT/api/v1/agents" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'agents' in d or isinstance(d, list)"
echo "  ✓ /api/v1/agents OK"

echo ""
echo "✅ All smoke tests passed!"
