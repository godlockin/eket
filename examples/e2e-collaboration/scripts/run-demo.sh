#!/bin/bash
##
# 运行完整 E2E 演示
##

set -e

echo "========================================"
echo "  EKET End-to-End Collaboration Demo"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ============================================================================
# 1. 检查环境
# ============================================================================

echo "=== Step 1: Checking environment ==="

# 检查 Node.js
if ! command -v node > /dev/null; then
    echo "❌ Error: Node.js not found"
    echo "   Please install Node.js >= 18"
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# 检查 Python
if ! command -v python3 > /dev/null; then
    echo "❌ Error: Python3 not found"
    echo "   Please install Python >= 3.8"
    exit 1
fi
echo "✅ Python: $(python3 --version)"

# 检查 Docker
if ! command -v docker > /dev/null; then
    echo "❌ Error: Docker not found"
    echo "   Please install Docker"
    exit 1
fi
echo "✅ Docker: $(docker --version)"

echo ""

# ============================================================================
# 2. 启动 Redis
# ============================================================================

echo "=== Step 2: Starting Redis ==="

if ! docker ps | grep -q eket-redis; then
    "$SCRIPT_DIR/start-redis.sh"
else
    echo "✅ Redis is already running"
fi

echo ""

# ============================================================================
# 3. 构建 EKET Server (如果需要)
# ============================================================================

echo "=== Step 3: Building EKET Server ==="

cd "$PROJECT_ROOT/node"

if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    echo "📦 Installing dependencies..."
    npm install > /dev/null

    echo "🔨 Building..."
    npm run build > /dev/null

    echo "✅ EKET Server built"
else
    echo "✅ EKET Server already built"
fi

echo ""

# ============================================================================
# 4. 启动 EKET Server
# ============================================================================

echo "=== Step 4: Starting EKET Server ==="

export OPENCLAW_API_KEY="demo-secret-key-1234567890"
export EKET_SERVER_PORT=8080

# 停止已存在的服务器
if [ -f /tmp/eket-server.pid ]; then
    OLD_PID=$(cat /tmp/eket-server.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "🛑 Stopping old server (PID: $OLD_PID)..."
        kill $OLD_PID 2> /dev/null || true
        sleep 2
    fi
fi

# 启动新服务器
"$SCRIPT_DIR/start-server.sh"

echo ""

# ============================================================================
# 5. 安装 Master Agent 依赖
# ============================================================================

echo "=== Step 5: Setting up Master Agent ==="

cd "$SCRIPT_DIR/../master"

if [ ! -d "node_modules" ]; then
    echo "📦 Installing Master Agent dependencies..."
    npm install > /dev/null
    echo "✅ Master Agent dependencies installed"
else
    echo "✅ Master Agent dependencies already installed"
fi

echo ""

# ============================================================================
# 6. 安装 Slaver Agent 依赖
# ============================================================================

echo "=== Step 6: Setting up Slaver Agent ==="

cd "$SCRIPT_DIR/../slaver"

# 安装 Python SDK
if ! python3 -c "import eket_sdk" 2> /dev/null; then
    echo "📦 Installing EKET Python SDK..."
    pip3 install -e "$PROJECT_ROOT/sdk/python" > /dev/null
    echo "✅ EKET Python SDK installed"
else
    echo "✅ EKET Python SDK already installed"
fi

# 安装其他依赖
echo "📦 Installing Slaver Agent dependencies..."
pip3 install -r requirements.txt > /dev/null 2>&1 || true
echo "✅ Slaver Agent dependencies installed"

echo ""

# ============================================================================
# 7. 运行演示
# ============================================================================

echo "=== Step 7: Running Demo ==="
echo ""
echo "========================================"
echo "  Demo Starting in 3 seconds..."
echo "========================================"
echo ""

sleep 3

# 启动 Master (后台)
echo "🚀 Starting Master Agent..."
cd "$SCRIPT_DIR/../master"
npm start > /tmp/eket-master.log 2>&1 &
MASTER_PID=$!

echo "✅ Master Agent started (PID: $MASTER_PID)"
echo "   Logs: /tmp/eket-master.log"

# 等待 Master 完成初始化
echo "⏳ Waiting for Master to initialize..."
sleep 5

# 启动 Slaver (前台)
echo ""
echo "🚀 Starting Slaver Agent..."
echo ""
cd "$SCRIPT_DIR/../slaver"
python3 slaver-agent.py

SLAVER_EXIT_CODE=$?

echo ""
echo "========================================"
echo "  Demo Completed"
echo "========================================"
echo ""

# ============================================================================
# 8. 清理
# ============================================================================

echo "=== Cleanup ==="

# 停止 Master
if ps -p $MASTER_PID > /dev/null 2>&1; then
    echo "🛑 Stopping Master Agent..."
    kill $MASTER_PID 2> /dev/null || true
    sleep 1
fi

echo "✅ Demo finished"
echo ""
echo "Logs:"
echo "  Master: /tmp/eket-master.log"
echo "  Server: (check server output)"
echo ""
echo "To clean up everything:"
echo "  ./scripts/cleanup.sh"
echo ""

exit $SLAVER_EXIT_CODE
