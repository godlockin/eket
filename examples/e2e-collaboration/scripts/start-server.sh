#!/bin/bash
##
# 启动 EKET Server
##

set -e

echo "=== Starting EKET Server ==="

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NODE_DIR="$PROJECT_ROOT/node"

# 检查 Node.js 项目是否构建
if [ ! -d "$NODE_DIR/dist" ]; then
    echo "❌ Error: EKET Server not built"
    echo "   Please run: cd $NODE_DIR && npm install && npm run build"
    exit 1
fi

# 检查环境变量
if [ -z "$OPENCLAW_API_KEY" ]; then
    echo "⚠️  Warning: OPENCLAW_API_KEY not set, using demo key"
    export OPENCLAW_API_KEY="demo-secret-key-1234567890"
fi

# 设置默认配置
export EKET_SERVER_PORT="${EKET_SERVER_PORT:-8080}"
export EKET_REDIS_HOST="${EKET_REDIS_HOST:-localhost}"
export EKET_REDIS_PORT="${EKET_REDIS_PORT:-6379}"
export EKET_LOG_LEVEL="${EKET_LOG_LEVEL:-info}"

# 检查端口是否被占用
if lsof -Pi :$EKET_SERVER_PORT -sTCP:LISTEN -t > /dev/null 2>&1; then
    echo "❌ Error: Port $EKET_SERVER_PORT is already in use"
    echo "   Please stop the process or use a different port:"
    echo "   export EKET_SERVER_PORT=8081"
    exit 1
fi

# 检查 Redis 是否运行
if ! nc -z $EKET_REDIS_HOST $EKET_REDIS_PORT > /dev/null 2>&1; then
    echo "❌ Error: Cannot connect to Redis at $EKET_REDIS_HOST:$EKET_REDIS_PORT"
    echo "   Please start Redis first:"
    echo "   ./scripts/start-redis.sh"
    exit 1
fi

echo "✅ Environment ready"
echo "   Server port: $EKET_SERVER_PORT"
echo "   Redis: $EKET_REDIS_HOST:$EKET_REDIS_PORT"
echo "   JWT Secret: ${OPENCLAW_API_KEY:0:20}..."
echo ""

# 启动服务器
echo "🚀 Starting EKET Server..."
cd "$NODE_DIR"

# 使用 Gateway 模式启动（如果可用）
if node dist/index.js gateway:start --help > /dev/null 2>&1; then
    node dist/index.js gateway:start \
        --port "$EKET_SERVER_PORT" \
        --api-key "$OPENCLAW_API_KEY" &
else
    # 降级到基础模式
    echo "⚠️  Gateway not available, starting basic server..."
    node dist/index.js server:start \
        --port "$EKET_SERVER_PORT" &
fi

SERVER_PID=$!

# 等待服务器启动
echo "⏳ Waiting for server to start..."
sleep 3

# 验证服务器
if curl -s "http://localhost:$EKET_SERVER_PORT/health" > /dev/null 2>&1; then
    echo "✅ EKET Server started successfully"
    echo "   URL: http://localhost:$EKET_SERVER_PORT"
    echo "   Health: http://localhost:$EKET_SERVER_PORT/health"
    echo "   API: http://localhost:$EKET_SERVER_PORT/api/v1"
    echo "   PID: $SERVER_PID"
    echo ""
    echo "Server is ready for demo!"
    echo "  Stop: kill $SERVER_PID"
else
    echo "❌ Server health check failed"
    kill $SERVER_PID 2> /dev/null || true
    exit 1
fi

# 保存 PID 用于清理
echo $SERVER_PID > /tmp/eket-server.pid

# 保持脚本运行（可选）
# wait $SERVER_PID
