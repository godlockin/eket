#!/bin/bash
# EKET Web Dashboard Launcher
# Phase 5.1 - Web UI 监控面板

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NODE_DIR="$PROJECT_ROOT/node"

cd "$NODE_DIR"

# Check if Node.js modules are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build if needed
if [ ! -f "dist/api/web-server.js" ]; then
    echo "Building TypeScript..."
    npm run build
fi

# Start the dashboard
echo ""
echo "=== EKET Web Dashboard ==="
echo ""

PORT="${EKET_WEB_PORT:-3000}"
HOST="${EKET_WEB_HOST:-localhost}"

node dist/index.js web:dashboard --port "$PORT" --host "$HOST"
