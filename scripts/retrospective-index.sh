#!/bin/bash
#
# EKET Retrospective 索引和任务前检查 v0.5.1
# 用途：构建 Retrospective 索引，任务开始前检查类似场景
#
# 用法:
#   ./scripts/retrospective-index.sh build|check [args]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RETRO_DIR="$PROJECT_ROOT/confluence/memory/retrospectives"
STATE_DIR="$PROJECT_ROOT/.eket/state"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 构建 Retrospective 索引
build_index() {
    local index_file="$RETRO_DIR/index.yml"

    log_info "构建 Retrospective 索引..."

    # 创建索引文件头
    cat > "$index_file" << EOF
# Retrospective 索引

# 此文件由 scripts/retrospective-index.sh 自动生成
# 用于任务开始前的类似场景检查

last_updated: $(date -Iseconds)
total_retrospectives: 0

EOF

    local count=0

    # 遍历所有 Retrospective 文件
    for retro_file in "$RETRO_DIR"/*.md; do
        if [ -f "$retro_file" ] && [ "$retro_file" != "$index_file" ]; then
            local filename=$(basename "$retro_file")
            local title=$(head -1 "$retro_file" 2>/dev/null | sed 's/^# //' || echo "$filename")
            local date=$(grep -i "^时间\|^date\|^created" "$retro_file" 2>/dev/null | head -1 | cut -d':' -f2 | tr -d ' ' || echo "unknown")
            local sprint=$(grep -i "^sprint\|^sprint_num" "$retro_file" 2>/dev/null | head -1 | cut -d':' -f2 | tr -d ' ' || echo "unknown")

            # 提取主题标签
            local topics=""
            if grep -q "task_progress" "$retro_file" 2>/dev/null; then
                topics="${topics}task_progress,"
            fi
            if grep -q "review_process" "$retro_file" 2>/dev/null; then
                topics="${topics}review_process,"
            fi
            if grep -q "lessons_learned" "$retro_file" 2>/dev/null; then
                topics="${topics}lessons_learned,"
            fi
            if grep -q "framework_improvements" "$retro_file" 2>/dev/null; then
                topics="${topics}framework_improvements,"
            fi
            if grep -qi "mock\|依赖\|数据接入" "$retro_file" 2>/dev/null; then
                topics="${topics}data_integration,"
            fi
            if grep -qi "测试\|e2e\|unit" "$retro_file" 2>/dev/null; then
                topics="${topics}testing,"
            fi
            if grep -qi "权限\|master\|slaver" "$retro_file" 2>/dev/null; then
                topics="${topics}architecture,"
            fi

            # 添加到索引
            cat >> "$index_file" << EOF
- file: $filename
  title: $title
  date: $date
  sprint: $sprint
  topics: [${topics%,}]
EOF

            ((count++))
        fi
    done

    # 更新总数
    sed -i.bak "s/total_retrospectives: 0/total_retrospectives: $count/" "$index_file"
    rm -f "$index_file.bak"

    log_info "索引已构建：$index_file (共 $count 个 Retrospective)"
}

# 检查类似场景
check_similar_scenarios() {
    local ticket_id="$1"
    local ticket_file="$2"
    local threshold="${3:-0.7}"

    log_info "检查类似场景..."

    local index_file="$RETRO_DIR/index.yml"

    if [ ! -f "$index_file" ]; then
        log_warn "索引文件不存在，先构建索引"
        build_index
    fi

    # 从任务文件中提取关键词
    local keywords=()
    if [ -f "$ticket_file" ]; then
        # 提取标签
        local tags=$(grep "^tags:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' | tr ',' '\n')
        for tag in $tags; do
            keywords+=("$tag")
        done

        # 提取任务类型
        local type=$(grep "^type:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
        if [ -n "$type" ]; then
            keywords+=("$type")
        fi

        # 提取优先级
        local priority=$(grep "^priority:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
        if [ -n "$priority" ]; then
            keywords+=("P$priority")
        fi
    fi

    log_info "关键词：${keywords[*]}"

    # 在索引中搜索类似场景
    local similar_count=0
    local similar_files=()

    for keyword in "${keywords[@]}"; do
        while IFS= read -r line; do
            if [[ "$line" == *"file:"* ]]; then
                local file=$(echo "$line" | cut -d':' -f2 | tr -d ' ')
                if [[ ! " ${similar_files[@]} " =~ " ${file} " ]]; then
                    similar_files+=("$file")
                    ((similar_count++))
                fi
            fi
        done < <(grep -i "$keyword" "$index_file" 2>/dev/null || true)
    done

    echo ""
    if [ $similar_count -gt 0 ]; then
        log_info "发现 $similar_count 个类似场景:"

        for file in "${similar_files[@]}"; do
            local retro_file="$RETRO_DIR/$file"
            if [ -f "$retro_file" ]; then
                echo "  - $file"
            fi
        done

        echo ""
        log_info "建议阅读以上 Retrospective 文件，避免重复问题"

        # 创建任务前阅读建议
        create_pre_task_reading "${similar_files[@]}"
    else
        log_info "未发现类似场景"
    fi

    return 0
}

# 创建任务前阅读建议
create_pre_task_reading() {
    local files=("$@")
    local reading_file="$STATE_DIR/pre-task-reading.yml"

    mkdir -p "$(dirname "$reading_file")"

    cat > "$reading_file" << EOF
# 任务前阅读建议

**生成时间**: $(date -Iseconds)

## 建议阅读的 Retrospective

EOF

    for file in "${files[@]}"; do
        local retro_file="$RETRO_DIR/$file"
        if [ -f "$retro_file" ]; then
            local title=$(head -1 "$retro_file" 2>/dev/null | sed 's/^# //' || echo "$file")
            cat >> "$reading_file" << EOF
### $file

- **标题**: $title
- **位置**: $retro_file
- **建议阅读**: 是

EOF
        fi
    done

    cat >> "$reading_file" << EOF
## 阅读检查清单

- [ ] 已阅读所有建议的 Retrospective
- [ ] 已记录可借鉴的经验
- [ ] 已避免重复的问题

---

**生成者**: EKET Retrospective Indexer v0.5.1
EOF

    log_info "阅读建议已创建：$reading_file"
}

# 审查 Retrospective 行动计划
review_action_items() {
    log_info "审查 Retrospective 行动计划..."

    local completed=0
    local pending=0

    for retro_file in "$RETRO_DIR"/*.md; do
        if [ -f "$retro_file" ]; then
            # 检查行动计划
            local action_done=$(grep -c "^\- \[x\]" "$retro_file" 2>/dev/null || echo "0")
            local action_pending=$(grep -c "^\- \[ \]" "$retro_file" 2>/dev/null || echo "0")

            completed=$((completed + action_done))
            pending=$((pending + action_pending))
        fi
    done

    echo ""
    echo "=== 行动计划状态 ==="
    echo ""
    echo "已完成：$completed"
    echo "待完成：$pending"
    echo ""

    if [ $pending -gt 0 ]; then
        log_warn "有 $pending 个待完成的改进项"
    else
        log_info "所有改进项已完成"
    fi
}

# 主函数
main() {
    local action="${1:-build}"

    case "$action" in
        build)
            build_index
            ;;
        check)
            local ticket_id="${2:-}"
            local ticket_file="${3:-}"
            check_similar_scenarios "$ticket_id" "$ticket_file"
            ;;
        review)
            review_action_items
            ;;
        pre-task)
            local ticket_id="${2:-}"
            local ticket_file="${3:-}"
            check_similar_scenarios "$ticket_id" "$ticket_file"
            ;;
        *)
            echo "用法：$0 <action> [args]"
            echo ""
            echo "动作:"
            echo "  build             - 构建索引"
            echo "  check [id] [file] - 检查类似场景"
            echo "  review            - 审查行动计划"
            echo "  pre-task [id] [file] - 任务前检查"
            ;;
    esac
}

main "$@"
