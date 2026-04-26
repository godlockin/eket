#!/usr/bin/env bash
# dev-down.sh — Stop EKET development dependency services
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker/compose.dev.yml"

echo "🛑 Stopping EKET dev services..."
docker compose -f "${COMPOSE_FILE}" down
echo "✅ Dev services stopped."
