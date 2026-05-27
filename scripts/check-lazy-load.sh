#!/bin/bash
# check-lazy-load.sh - 检查文档是否符合按需加载规范
#
# 用法: ./scripts/check-lazy-load.sh [file|dir]
#
# 规则:
# - >100行 的 .md 文件必须有"快速索引"或"快速参考"
# - >200行 的 .md 文件必须在 SKILL.md 按需加载规则中声明
# - 新增/修改的文档自动检查

set -euo pipefail

# 阈值配置
WARN_THRESHOLD=100   # 警告阈值
ERROR_THRESHOLD=200  # 错误阈值
SKILL_FILE="${HOME}/.claude/skills/eket/SKILL.md"

# 颜色
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# 统计
warnings=0
errors=0
passed=0

check_file() {
    local file="$1"
    local lines
    lines=$(wc -l < "$file" | tr -d ' ')
    local filename
    filename=$(basename "$file")

    # 跳过非 .md 文件
    [[ "$file" != *.md ]] && return 0

    # 跳过 INDEX/README 等索引文件
    [[ "$filename" == "INDEX.md" || "$filename" == "README.md" || "$filename" == "MEMORY-INDEX.md" ]] && return 0

    # 检查是否有快速索引
    local has_quick_index=false
    if grep -qE "^## 快速索引|^## 快速参考|Quick Reference|Quick Index" "$file" 2>/dev/null; then
        has_quick_index=true
    fi

    # 检查是否在 SKILL.md 按需加载规则中
    local in_lazy_load=false
    if [[ -f "$SKILL_FILE" ]] && grep -q "$filename" "$SKILL_FILE" 2>/dev/null; then
        in_lazy_load=true
    fi

    # 规则判定
    if [[ $lines -gt $ERROR_THRESHOLD ]]; then
        if [[ "$has_quick_index" == false ]]; then
            echo -e "${RED}ERROR${NC}: $file ($lines 行) 缺少快速索引"
            echo "       添加 '## 快速索引' 或 '## 快速参考' 章节"
            ((errors++))
            return 1
        fi
        if [[ "$in_lazy_load" == false ]]; then
            echo -e "${RED}ERROR${NC}: $file ($lines 行) 未在 SKILL.md 按需加载规则中声明"
            echo "       添加到 ~/.claude/skills/eket/SKILL.md 的按需加载规则表"
            ((errors++))
            return 1
        fi
        echo -e "${GREEN}PASS${NC}: $file ($lines 行) - 有快速索引，已声明按需加载"
        ((passed++))
    elif [[ $lines -gt $WARN_THRESHOLD ]]; then
        if [[ "$has_quick_index" == false ]]; then
            echo -e "${YELLOW}WARN${NC}: $file ($lines 行) 建议添加快速索引"
            ((warnings++))
            return 0
        fi
        echo -e "${GREEN}PASS${NC}: $file ($lines 行) - 有快速索引"
        ((passed++))
    else
        echo -e "${GREEN}PASS${NC}: $file ($lines 行)"
        ((passed++))
    fi

    return 0
}

# 主逻辑
target="${1:-.}"

if [[ -f "$target" ]]; then
    check_file "$target"
elif [[ -d "$target" ]]; then
    while IFS= read -r -d '' file; do
        check_file "$file" || true
    done < <(find "$target" -name "*.md" -type f -print0 2>/dev/null)
else
    echo "Usage: $0 [file|dir]"
    exit 1
fi

# 汇总
echo ""
echo "========================================"
echo -e "通过: ${GREEN}$passed${NC} | 警告: ${YELLOW}$warnings${NC} | 错误: ${RED}$errors${NC}"
echo "========================================"

if [[ $errors -gt 0 ]]; then
    echo ""
    echo "修复建议:"
    echo "1. 为大文件添加 '## 快速索引' 章节（含 grep 命令）"
    echo "2. 在 SKILL.md 按需加载规则表中声明加载时机"
    echo "3. 或考虑拆分文件"
    exit 1
fi

exit 0
