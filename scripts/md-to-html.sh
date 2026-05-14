#!/usr/bin/env bash
#
# EKET MD → HTML 转换脚本
# 用法: bash scripts/md-to-html.sh <file.md>
#

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "❌ 用法: $0 <file.md>" >&2
  exit 1
fi

MD_FILE="$1"

if [[ ! -f "$MD_FILE" ]]; then
  echo "❌ 文件不存在: $MD_FILE" >&2
  exit 1
fi

if [[ "${MD_FILE##*.}" != "md" ]]; then
  echo "❌ 只支持 .md 文件" >&2
  exit 1
fi

# 检查 pandoc
if ! command -v pandoc &>/dev/null; then
  echo "❌ pandoc 未安装" >&2
  echo "   macOS: brew install pandoc" >&2
  echo "   Linux: apt-get install pandoc" >&2
  exit 1
fi

HTML_FILE="${MD_FILE%.md}.html"

# 提取标题（第一行 # 开头）
TITLE=$(head -1 "$MD_FILE" | sed 's/^#* *//' || echo "Document")

echo "🔄 转换: $MD_FILE → $HTML_FILE"

# 转换
pandoc "$MD_FILE" \
  -o "$HTML_FILE" \
  --standalone \
  --metadata title="$TITLE" \
  --metadata charset="UTF-8" \
  || {
    echo "❌ 转换失败" >&2
    exit 1
  }

if [[ -f "$HTML_FILE" ]]; then
  SIZE=$(wc -c < "$HTML_FILE")
  echo "✅ 成功: $HTML_FILE (${SIZE} bytes)"
else
  echo "❌ HTML 文件未生成" >&2
  exit 1
fi
