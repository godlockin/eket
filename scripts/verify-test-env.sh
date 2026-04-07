#!/bin/bash

# 测试环境验证脚本
#
# 用于验证新测试辅助工具是否正常工作

set -e

cd "$(dirname "$0")/../node"

echo "========================================="
echo "EKET 测试环境验证"
echo "========================================="
echo ""

echo "1. 检查依赖安装..."
if npm list ioredis-mock > /dev/null 2>&1; then
  echo "✓ ioredis-mock 已安装"
else
  echo "✗ ioredis-mock 未安装"
  exit 1
fi

echo ""
echo "2. 运行 Redis Mock 测试..."
npm test -- --testPathPattern="helpers/redis-mock.test" --silent 2>&1 | grep -E "(PASS|FAIL)" || true

echo ""
echo "3. 运行 SQLite 测试..."
npm test -- --testPathPattern="helpers/sqlite-test.test" --silent 2>&1 | grep -E "(PASS|FAIL)" || true

echo ""
echo "4. 运行示例集成测试（cache-layer）..."
npm test -- --testPathPattern="cache-layer" --silent 2>&1 | grep -E "(PASS|FAIL|Test Suites:)" | tail -3 || true

echo ""
echo "========================================="
echo "验证完成！"
echo "========================================="
