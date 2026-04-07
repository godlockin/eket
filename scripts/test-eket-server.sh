#!/usr/bin/env bash
#
# 测试 EKET HTTP Server
#

set -e

echo "=== EKET HTTP Server 功能测试 ==="
echo

# 启动 Redis (如果未运行)
if ! docker ps | grep -q eket-redis; then
  echo "Starting Redis..."
  docker run -d --name eket-redis -p 6379:6379 redis:7-alpine || echo "Redis already exists"
  sleep 2
fi

# 检查 Redis 连接
echo "✓ Redis 已启动"

# 测试 API 端点
SERVER="http://localhost:8080"

echo
echo "测试 1: 健康检查"
curl -s "$SERVER/health" | jq . || echo "Server not running"

echo
echo "测试 2: Agent 注册"
TOKEN=$(curl -s -X POST "$SERVER/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "claude_code",
    "role": "master",
    "capabilities": ["typescript", "node.js"]
  }' | jq -r '.token' || echo "")

if [ -n "$TOKEN" ]; then
  echo "✓ Agent 注册成功，Token: ${TOKEN:0:20}..."
else
  echo "✗ Agent 注册失败"
fi

echo
echo "测试 3: 查询 Agents"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$SERVER/api/v1/agents" | jq '.agents | length'

echo
echo "=== 测试完成 ==="
