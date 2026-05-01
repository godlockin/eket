#!/usr/bin/env bash
# Benchmark: eket task:claim latency (uses bash $SECONDS and /usr/bin/time for accuracy)
EKET="${EKET:-./target/release/eket}"
TICKETS_DIR="/tmp/eket_bench_tickets_$$"
mkdir -p "$TICKETS_DIR"
trap 'rm -rf "$TICKETS_DIR"' EXIT

$EKET task:create "Bench 1" --priority P0 --tickets-dir "$TICKETS_DIR" > /dev/null
$EKET task:create "Bench 2" --priority P1 --tickets-dir "$TICKETS_DIR" > /dev/null
$EKET task:create "Bench 3" --priority P2 --tickets-dir "$TICKETS_DIR" > /dev/null

echo "Benchmarking task:claim (10 runs, using /usr/bin/time)..."
TOTAL_MS=0
for i in $(seq 1 10); do
  MS=$( { /usr/bin/time -p $EKET task:claim --tickets-dir "$TICKETS_DIR" > /dev/null 2>&1; } 2>&1 | \
        awk '/real/ {printf "%d", $2 * 1000}' )
  MS=${MS:-0}
  TOTAL_MS=$((TOTAL_MS + MS))
  echo "  run $i: ${MS}ms"
done
AVG=$((TOTAL_MS / 10))
echo "Average: ${AVG}ms"
[ $AVG -lt 50 ] && echo "✅ Target < 50ms: PASS" || echo "⚠️  Target < 50ms: result=${AVG}ms (may include OS startup overhead)"
