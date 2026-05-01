#!/usr/bin/env bash
# dev-up.sh — Start EKET development dependency services
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker/compose.dev.yml"

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and retry."
  exit 1
fi

# Ensure local data directory exists
mkdir -p ~/.eket/data
echo "✅ ~/.eket/data/ ready"

# Start services
echo "🚀 Starting EKET dev services..."
docker compose -f "${COMPOSE_FILE}" up -d

# Wait for healthchecks
echo "⏳ Waiting for services to be healthy..."
for i in $(seq 1 30); do
  REDIS_OK=$(docker inspect --format='{{.State.Health.Status}}' eket-redis 2>/dev/null || echo "missing")
  PG_OK=$(docker inspect --format='{{.State.Health.Status}}' eket-postgres 2>/dev/null || echo "missing")
  if [ "${REDIS_OK}" = "healthy" ] && [ "${PG_OK}" = "healthy" ]; then
    break
  fi
  sleep 1
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  EKET Dev Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Redis      → localhost:6379"
echo "  PostgreSQL → postgres://eket:eket_dev@localhost:5432/eket"
echo "  SQLite     → ~/.eket/data/eket.db"
echo "  SQLite UI  → http://localhost:8080  (optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Dev environment ready."
echo "   Stop with: bash scripts/dev-down.sh"
