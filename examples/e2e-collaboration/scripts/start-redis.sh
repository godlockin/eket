#!/bin/bash
##
# 启动 Redis (Docker)
##

set -e

echo "=== Starting Redis for EKET Demo ==="

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "   Please start Docker and try again"
    exit 1
fi

# 检查是否已存在 eket-redis 容器
if docker ps -a | grep -q eket-redis; then
    echo "ℹ️  eket-redis container already exists"

    # 检查是否运行中
    if docker ps | grep -q eket-redis; then
        echo "✅ Redis is already running"
        exit 0
    else
        echo "🔄 Starting existing container..."
        docker start eket-redis
        echo "✅ Redis started"
        exit 0
    fi
fi

# 创建新容器
echo "🚀 Creating new Redis container..."
docker run -d \
    --name eket-redis \
    -p 6379:6379 \
    --restart unless-stopped \
    redis:7-alpine

# 等待 Redis 启动
echo "⏳ Waiting for Redis to start..."
sleep 2

# 验证 Redis
if docker ps | grep -q eket-redis; then
    echo "✅ Redis started successfully on port 6379"

    # 测试连接
    if command -v redis-cli > /dev/null; then
        if redis-cli ping > /dev/null 2>&1; then
            echo "✅ Redis connection verified"
        fi
    fi
else
    echo "❌ Failed to start Redis"
    exit 1
fi

echo ""
echo "Redis is ready for EKET demo!"
echo "  Container: eket-redis"
echo "  Port: 6379"
echo "  Stop: docker stop eket-redis"
echo "  Remove: docker rm -f eket-redis"
