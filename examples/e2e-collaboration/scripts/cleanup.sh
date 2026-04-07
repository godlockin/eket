#!/bin/bash
##
# 清理 EKET 演示环境
##

set -e

echo "=== Cleaning up EKET Demo ==="

# ============================================================================
# 1. 停止 EKET Server
# ============================================================================

echo "🛑 Stopping EKET Server..."

if [ -f /tmp/eket-server.pid ]; then
    PID=$(cat /tmp/eket-server.pid)
    if ps -p $PID > /dev/null 2>&1; then
        kill $PID 2> /dev/null || true
        echo "✅ EKET Server stopped (PID: $PID)"
    fi
    rm -f /tmp/eket-server.pid
fi

# 强制停止所有 node 进程（可选，谨慎使用）
# pkill -f "node dist/index.js" || true

# ============================================================================
# 2. 停止 Master Agent
# ============================================================================

echo "🛑 Stopping Master Agent..."

pkill -f "ts-node master-agent.ts" || true
pkill -f "node.*master-agent" || true

# ============================================================================
# 3. 停止 Slaver Agent
# ============================================================================

echo "🛑 Stopping Slaver Agent..."

pkill -f "python.*slaver-agent.py" || true

# ============================================================================
# 4. 停止 Redis (可选)
# ============================================================================

read -p "Stop Redis container? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🛑 Stopping Redis..."
    docker stop eket-redis 2> /dev/null || true

    read -p "Remove Redis container? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker rm eket-redis 2> /dev/null || true
        echo "✅ Redis container removed"
    fi
else
    echo "ℹ️  Redis container kept running"
fi

# ============================================================================
# 5. 清理日志文件
# ============================================================================

echo "🧹 Cleaning up logs..."

rm -f /tmp/eket-master.log
rm -f /tmp/eket-slaver.log
rm -f /tmp/eket-server.pid

# 清理项目日志目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -d "$PROJECT_ROOT/logs" ]; then
    read -p "Remove logs directory? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$PROJECT_ROOT/logs"
        echo "✅ Logs directory removed"
    fi
fi

# ============================================================================
# 6. 清理临时数据 (可选)
# ============================================================================

read -p "Clear Redis data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if docker ps | grep -q eket-redis; then
        docker exec eket-redis redis-cli FLUSHALL > /dev/null 2>&1 || true
        echo "✅ Redis data cleared"
    fi
fi

# ============================================================================
# 7. 清理构建产物 (可选)
# ============================================================================

read -p "Clean build artifacts? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 清理 Master Agent
    if [ -d "$SCRIPT_DIR/../master/dist" ]; then
        rm -rf "$SCRIPT_DIR/../master/dist"
        echo "✅ Master Agent build cleaned"
    fi

    # 清理 Python 缓存
    find "$SCRIPT_DIR/../slaver" -type d -name "__pycache__" -exec rm -rf {} + 2> /dev/null || true
    echo "✅ Python cache cleaned"
fi

# ============================================================================
# 完成
# ============================================================================

echo ""
echo "✅ Cleanup completed!"
echo ""
echo "Environment status:"
echo "  Redis: $(docker ps | grep -q eket-redis && echo '✅ Running' || echo '❌ Stopped')"
echo "  EKET Server: ❌ Stopped"
echo "  Master Agent: ❌ Stopped"
echo "  Slaver Agent: ❌ Stopped"
echo ""
echo "To restart the demo:"
echo "  ./scripts/run-demo.sh"
