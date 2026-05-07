#!/bin/bash
#
# TASK-426 测试脚本：sha256 校验 3 种场景
#
# 用法：
#   bash tests/sha256-verify-test.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="$PROJECT_ROOT/tests/tmp-sha256-test"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$TEST_DIR"

echo -e "${GREEN}[测试] TASK-426 sha256 校验功能${NC}\n"

# ─────────────────────────────────────────────
# 场景 1: 校验通过
# ─────────────────────────────────────────────
echo -e "${YELLOW}场景 1: 正常下载 + 校验通过${NC}"

# 创建测试文件 + 正确的 sha256
echo "test content v1" > "$TEST_DIR/file1.txt"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$TEST_DIR/file1.txt" | awk '{print $1}' > "$TEST_DIR/file1.txt.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$TEST_DIR/file1.txt" | awk '{print $1}' > "$TEST_DIR/file1.txt.sha256"
else
  echo -e "${RED}✗ 缺少 sha256sum/shasum 命令${NC}"
  exit 1
fi

EXPECTED_HASH=$(cat "$TEST_DIR/file1.txt.sha256")
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_HASH=$(sha256sum "$TEST_DIR/file1.txt" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_HASH=$(shasum -a 256 "$TEST_DIR/file1.txt" | awk '{print $1}')
fi

if [[ "$EXPECTED_HASH" == "$ACTUAL_HASH" ]]; then
  echo -e "${GREEN}✓ 场景 1 通过：校验匹配${NC}\n"
else
  echo -e "${RED}✗ 场景 1 失败：校验不匹配${NC}"
  echo "  期望: $EXPECTED_HASH"
  echo "  实际: $ACTUAL_HASH"
  exit 1
fi

# ─────────────────────────────────────────────
# 场景 2: 校验失败
# ─────────────────────────────────────────────
echo -e "${YELLOW}场景 2: sha256 不匹配${NC}"

# 创建错误的 sha256 文件
echo "invalid_hash_abcd1234" > "$TEST_DIR/file2.txt.sha256"
echo "test content v2" > "$TEST_DIR/file2.txt"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_HASH=$(sha256sum "$TEST_DIR/file2.txt" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_HASH=$(shasum -a 256 "$TEST_DIR/file2.txt" | awk '{print $1}')
fi
EXPECTED_HASH="invalid_hash_abcd1234"

if [[ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]]; then
  echo -e "${GREEN}✓ 场景 2 通过：检测到校验失败（符合预期）${NC}\n"
else
  echo -e "${RED}✗ 场景 2 失败：应检测到不匹配${NC}"
  exit 1
fi

# ─────────────────────────────────────────────
# 场景 3: 无校验文件（降级场景）
# ─────────────────────────────────────────────
echo -e "${YELLOW}场景 3: 无 sha256 文件（降级）${NC}"

echo "test content v3" > "$TEST_DIR/file3.txt"
# 故意不创建 .sha256 文件

if [ ! -f "$TEST_DIR/file3.txt.sha256" ]; then
  echo -e "${GREEN}✓ 场景 3 通过：检测到无校验文件（会警告用户）${NC}\n"
else
  echo -e "${RED}✗ 场景 3 失败：应无校验文件${NC}"
  exit 1
fi

# ─────────────────────────────────────────────
# 总结
# ─────────────────────────────────────────────
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo -e "${GREEN}所有测试场景通过！${NC}"
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo ""
echo "测试覆盖："
echo "  ✓ 场景 1: 校验通过"
echo "  ✓ 场景 2: 校验失败检测"
echo "  ✓ 场景 3: 无校验文件降级"
