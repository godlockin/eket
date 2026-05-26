#!/usr/bin/env bash
#
# check-memory-format.sh - Memory 文件格式验证脚本
#
# 检查 confluence/memory/ 下文件的格式规范性：
# 1. Frontmatter 完整性（name, type, created, source）
# 2. 必要章节存在（根据 type 不同有不同要求）
# 3. Source 字段有效性
#
# 用法：
#   ./scripts/check-memory-format.sh                    # 检查所有文件
#   ./scripts/check-memory-format.sh --strict           # 严格模式（警告也报错）
#   ./scripts/check-memory-format.sh --fix              # 显示修复建议
#   ./scripts/check-memory-format.sh <path>             # 检查指定文件/目录
#
# 退出码：
#   0 - 所有检查通过
#   1 - 有错误
#   2 - 仅有警告（非严格模式下视为通过）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MEMORY_DIR="$PROJECT_ROOT/confluence/memory"

# 颜色输出
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 统计
ERRORS=0
WARNINGS=0
CHECKED=0
SKIPPED=0

# 选项
STRICT_MODE=false
SHOW_FIX=false
TARGET_PATH=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --fix)
            SHOW_FIX=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--strict] [--fix] [path]"
            echo ""
            echo "Options:"
            echo "  --strict    Treat warnings as errors"
            echo "  --fix       Show fix suggestions"
            echo "  path        Check specific file or directory"
            exit 0
            ;;
        *)
            TARGET_PATH="$1"
            shift
            ;;
    esac
done

# 必填 frontmatter 字段
REQUIRED_FIELDS=("name" "type" "created" "source")

# 可选 frontmatter 字段
OPTIONAL_FIELDS=("tags" "confidence" "review_status" "reviewed_at")

# 有效的 type 值
VALID_TYPES=("pattern" "pitfall" "lesson" "glossary")

# 有效的 confidence 值
VALID_CONFIDENCE=("high" "medium" "low")

# 获取 type 对应的必须章节
get_required_sections() {
    local type="$1"
    case "$type" in
        pattern) echo "场景|方案|示例" ;;
        pitfall) echo "症状|根因|方案" ;;
        lesson)  echo "场景|教训|示例" ;;
        glossary) echo "定义" ;;
        *) echo "" ;;
    esac
}

# 辅助函数
log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ERRORS++)) || true
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++)) || true
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# 检查文件是否有 frontmatter
has_frontmatter() {
    local file="$1"
    head -1 "$file" | grep -q "^---$"
}

# 提取 frontmatter
extract_frontmatter() {
    local file="$1"
    sed -n '1,/^---$/p' "$file" | sed '1d;$d'
}

# 获取 frontmatter 字段值
get_field() {
    local frontmatter="$1"
    local field="$2"
    echo "$frontmatter" | grep -E "^${field}:" | sed "s/^${field}:[[:space:]]*//" | tr -d '"' | tr -d "'" || true
}

# 检查 source 字段是否有效（格式为 TASK-XXX 或 EPIC-XXX）
is_valid_source() {
    local source="$1"
    [[ "$source" =~ ^(TASK|EPIC|manual)-[A-Z0-9-]+$ ]] || [[ "$source" == "manual" ]]
}

# 检查日期格式
is_valid_date() {
    local date="$1"
    [[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

# 检查单个文件
check_file() {
    local file="$1"
    local rel_path="${file#$PROJECT_ROOT/}"
    local has_error=false
    local has_warning=false

    ((CHECKED++)) || true

    # 跳过非 md 文件
    if [[ ! "$file" =~ \.md$ ]]; then
        ((SKIPPED++)) || true
        return
    fi

    # 跳过索引文件和特殊文件
    local basename=$(basename "$file")
    if [[ "$basename" == "memory-index.md" ]] || \
       [[ "$basename" == "README.md" ]] || \
       [[ "$basename" == "MEMORY.md" ]] || \
       [[ "$basename" == "codebase-map.md" ]]; then
        ((SKIPPED++)) || true
        return
    fi

    # 检查 frontmatter 存在
    if ! has_frontmatter "$file"; then
        log_warning "$rel_path: Missing frontmatter (legacy format)"
        has_warning=true
        if $SHOW_FIX; then
            echo "  Fix: Add frontmatter block at the beginning of the file"
            echo "  ---"
            echo "  name: $(basename "$file" .md)"
            echo "  type: pitfall"
            echo "  created: $(date +%Y-%m-%d)"
            echo "  source: TASK-XXX"
            echo "  ---"
        fi
        return
    fi

    local frontmatter
    frontmatter=$(extract_frontmatter "$file")

    # 检查必填字段
    for field in "${REQUIRED_FIELDS[@]}"; do
        local value
        value=$(get_field "$frontmatter" "$field")
        if [[ -z "$value" ]]; then
            log_error "$rel_path: Missing required field '$field'"
            has_error=true
        fi
    done

    # 检查 type 有效性
    local type_value
    type_value=$(get_field "$frontmatter" "type")
    if [[ -n "$type_value" ]]; then
        local valid=false
        for valid_type in "${VALID_TYPES[@]}"; do
            if [[ "$type_value" == "$valid_type" ]]; then
                valid=true
                break
            fi
        done
        if ! $valid; then
            log_error "$rel_path: Invalid type '$type_value' (valid: ${VALID_TYPES[*]})"
            has_error=true
        fi
    fi

    # 检查 created 日期格式
    local created
    created=$(get_field "$frontmatter" "created")
    if [[ -n "$created" ]] && ! is_valid_date "$created"; then
        log_warning "$rel_path: Invalid date format '$created' (expected: YYYY-MM-DD)"
        has_warning=true
    fi

    # 检查 source 有效性
    local source
    source=$(get_field "$frontmatter" "source")
    if [[ -n "$source" ]] && ! is_valid_source "$source"; then
        log_warning "$rel_path: Invalid source format '$source' (expected: TASK-XXX or EPIC-XXX)"
        has_warning=true
    fi

    # 检查 confidence 有效性（如果存在）
    local confidence
    confidence=$(get_field "$frontmatter" "confidence")
    if [[ -n "$confidence" ]]; then
        local valid=false
        for valid_conf in "${VALID_CONFIDENCE[@]}"; do
            if [[ "$confidence" == "$valid_conf" ]]; then
                valid=true
                break
            fi
        done
        if ! $valid; then
            log_warning "$rel_path: Invalid confidence '$confidence' (valid: ${VALID_CONFIDENCE[*]})"
            has_warning=true
        fi
    fi

    # 检查必要章节（根据 type）
    if [[ -n "$type_value" ]]; then
        local required_pattern
        required_pattern=$(get_required_sections "$type_value")
        if [[ -n "$required_pattern" ]]; then
            local file_content
            file_content=$(cat "$file")

            IFS='|' read -ra sections <<< "$required_pattern"
            for section in "${sections[@]}"; do
                if ! echo "$file_content" | grep -qE "^##.*($section)"; then
                    log_warning "$rel_path: Missing recommended section containing '$section' for type '$type_value'"
                    has_warning=true
                fi
            done
        fi
    fi

    if ! $has_error && ! $has_warning; then
        log_success "$rel_path"
    fi
}

# 主逻辑
main() {
    echo "========================================"
    echo "  Memory Format Checker v1.0"
    echo "========================================"
    echo ""

    local search_path="$MEMORY_DIR"
    if [[ -n "$TARGET_PATH" ]]; then
        if [[ -f "$TARGET_PATH" ]]; then
            search_path="$TARGET_PATH"
        elif [[ -d "$TARGET_PATH" ]]; then
            search_path="$TARGET_PATH"
        else
            log_error "Path not found: $TARGET_PATH"
            exit 1
        fi
    fi

    if [[ -f "$search_path" ]]; then
        check_file "$search_path"
    else
        # 遍历目录
        while IFS= read -r -d '' file; do
            check_file "$file"
        done < <(find "$search_path" -type f -name "*.md" -print0 2>/dev/null)
    fi

    echo ""
    echo "========================================"
    echo "  Summary"
    echo "========================================"
    echo "  Checked: $CHECKED"
    echo "  Skipped: $SKIPPED (index/readme files)"
    echo "  Errors:  $ERRORS"
    echo "  Warnings: $WARNINGS"
    echo ""

    if [[ $ERRORS -gt 0 ]]; then
        echo -e "${RED}Check failed with $ERRORS error(s)${NC}"
        exit 1
    elif [[ $WARNINGS -gt 0 ]]; then
        if $STRICT_MODE; then
            echo -e "${RED}Check failed with $WARNINGS warning(s) (strict mode)${NC}"
            exit 2
        else
            echo -e "${YELLOW}Check passed with $WARNINGS warning(s)${NC}"
            exit 0
        fi
    else
        echo -e "${GREEN}All checks passed!${NC}"
        exit 0
    fi
}

main
