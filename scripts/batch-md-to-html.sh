#!/usr/bin/env bash
#
# EKET 批量 MD → HTML 转换
# 用法: bash scripts/batch-md-to-html.sh <directory>
#

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "❌ 用法: $0 <directory>" >&2
  exit 1
fi

TARGET_DIR="$1"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "❌ 目录不存在: $TARGET_DIR" >&2
  exit 1
fi

# 检查单文件脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SINGLE_SCRIPT="$SCRIPT_DIR/md-to-html.sh"

if [[ ! -f "$SINGLE_SCRIPT" ]]; then
  echo "❌ 未找到 md-to-html.sh" >&2
  exit 1
fi

echo "📂 扫描目录: $TARGET_DIR"

# 查找所有 .md 文件（兼容 macOS bash 3.x）
SUCCESS=0
FAILED=0
TOTAL=0

while IFS= read -r md_file; do
  [[ -z "$md_file" ]] && continue
  ((TOTAL++))
done < <(find "$TARGET_DIR" -type f -name "*.md")

if [[ $TOTAL -eq 0 ]]; then
  echo "⚠️  未找到 .md 文件" >&2
  exit 0
fi

echo "📄 找到 $TOTAL 个 .md 文件"
echo ""

while IFS= read -r md_file; do
  [[ -z "$md_file" ]] && continue
  if bash "$SINGLE_SCRIPT" "$md_file"; then
    ((SUCCESS++))
  else
    ((FAILED++))
    echo "⚠️  跳过: $md_file"
  fi
done < <(find "$TARGET_DIR" -type f -name "*.md")

echo ""
echo "✅ 成功: $SUCCESS"
if [[ $FAILED -gt 0 ]]; then
  echo "❌ 失败: $FAILED"
fi
echo "📊 总计: $TOTAL"
