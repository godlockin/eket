#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EKET 文件归属检查脚本
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# 用途: 检查文件是否放置在正确的三仓库位置
# 触发: CI workflow / 手动执行
# 检查规则:
#   - confluence/ 下只能有 .md 文件和 scripts/
#   - jira/ 下只能有 tickets/ 目录和 .md/.yml 文件
#   - 其他代码文件归属 code_repo
#
# 相关文档:
#   - confluence/memory/solutions/eket-architecture-refinement.md
#
# 版本: 1.0.0
# 创建: TASK-624
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 错误计数
ERRORS=0

# 检查 confluence/ 目录
check_confluence() {
  echo "🔍 检查 confluence/ 目录..."

  # 允许的模式：
  # - *.md / *.html 文件 (文档格式)
  # - scripts/ 目录下的任何文件
  # - .gitkeep
  # - .eket_master_marker (Master 标记)

  local invalid_files=$(find confluence -type f \
    ! -name "*.md" \
    ! -name "*.html" \
    ! -path "*/scripts/*" \
    ! -name ".gitkeep" \
    ! -name ".eket_master_marker" \
    2>/dev/null || true)

  if [[ -n "$invalid_files" ]]; then
    echo -e "${RED}❌ confluence/ 下发现非 Markdown 文件:${NC}"
    echo "$invalid_files" | while read -r file; do
      echo "  - $file"
      ((ERRORS++))
    done
  fi
}

# 检查 jira/ 目录
check_jira() {
  echo "🔍 检查 jira/ 目录..."

  # 允许的模式：
  # - tickets/ 目录下的任何文件
  # - *.md / *.yml 文件（根目录）
  # - .gitkeep
  # - .eket_master_marker (Master 标记)

  local invalid_files=$(find jira -type f \
    ! -path "*/tickets/*" \
    ! -name "*.md" \
    ! -name "*.yml" \
    ! -name "*.yaml" \
    ! -name ".gitkeep" \
    ! -name ".eket_master_marker" \
    -maxdepth 1 \
    2>/dev/null || true)

  if [[ -n "$invalid_files" ]]; then
    echo -e "${RED}❌ jira/ 根目录下发现不符合规范的文件:${NC}"
    echo "$invalid_files" | while read -r file; do
      echo "  - $file"
      ((ERRORS++))
    done
  fi
}

# 检查代码文件是否误放
check_code_misplacement() {
  echo "🔍 检查代码文件归属..."

  # 代码文件扩展名
  local code_exts=(
    "js" "ts" "jsx" "tsx"
    "py" "go" "rs" "java"
    "sh" "bash" "zsh"
    "json" "toml" "ini"
  )

  for ext in "${code_exts[@]}"; do
    # 检查 confluence/ 下是否有代码文件（排除 scripts/）
    local misplaced=$(find confluence -type f \
      -name "*.$ext" \
      ! -path "*/scripts/*" \
      2>/dev/null || true)

    if [[ -n "$misplaced" ]]; then
      echo -e "${YELLOW}⚠️  confluence/ 下发现 .$ext 文件（应在 code_repo）:${NC}"
      echo "$misplaced" | while read -r file; do
        echo "  - $file"
        ((ERRORS++))
      done
    fi

    # 检查 jira/ 下是否有代码文件（排除 tickets/ 和 scripts/）
    local misplaced_jira=$(find jira -type f \
      -name "*.$ext" \
      ! -path "*/tickets/*" \
      ! -path "*/scripts/*" \
      2>/dev/null || true)

    if [[ -n "$misplaced_jira" ]]; then
      echo -e "${YELLOW}⚠️  jira/ 下发现 .$ext 文件（应在 code_repo）:${NC}"
      echo "$misplaced_jira" | while read -r file; do
        echo "  - $file"
        ((ERRORS++))
      done
    fi
  done
}

# 主函数
main() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 EKET 文件归属检查"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  check_confluence
  check_jira
  check_code_misplacement

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ $ERRORS -eq 0 ]]; then
    echo -e "${GREEN}✅ 检查通过 - 所有文件归属正确${NC}"
    exit 0
  else
    echo -e "${RED}❌ 检查失败 - 发现 $ERRORS 个文件归属错误${NC}"
    echo ""
    echo "正确归属规则："
    echo "  - confluence/  → 仅 .md 文件（文档）+ scripts/"
    echo "  - jira/        → 仅 tickets/ + 根目录 .md/.yml"
    echo "  - code_repo    → 所有代码文件（.js/.ts/.py/.sh 等）"
    echo ""
    exit 1
  fi
}

main "$@"
