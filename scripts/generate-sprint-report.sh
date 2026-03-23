#!/bin/bash
#
# EKET 自动化 Sprint Review 报告生成器 v0.5.1
# 用途：自动生成 Sprint Review 报告，包含完成的任务、指标和改进建议
#
# 用法：
#   ./scripts/generate-sprint-report.sh <sprint_num> [--output <file>]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
OUTPUT_DIR="$PROJECT_ROOT/outbox/sprint-reports"

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

# 加载配置
load_config() {
    local config_file="$CONFIG_DIR/process.yml"

    if [ -f "$config_file" ]; then
        SPRINT_DURATION_DAYS=$(grep "duration_days:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "7")
        TASKS_PER_SPRINT=$(grep "tasks_per_sprint:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "5")
    else
        SPRINT_DURATION_DAYS=7
        TASKS_PER_SPRINT=5
    fi
}

# 计算 Sprint 日期范围
calculate_sprint_dates() {
    local sprint_num="$1"
    local today=$(date +%s)
    local sprint_duration=$((SPRINT_DURATION_DAYS * 24 * 60 * 60))

    # 计算当前是第几个 Sprint
    local project_start=$(stat -f%m "$PROJECT_ROOT" 2>/dev/null || stat -c%Y "$PROJECT_ROOT" 2>/dev/null || echo "$today")
    local elapsed=$((today - project_start))
    local current_sprint=$((elapsed / sprint_duration + 1))

    # 计算指定 Sprint 的日期
    local sprint_start=$((project_start + (sprint_num - 1) * sprint_duration))
    local sprint_end=$((sprint_start + sprint_duration))

    SPRINT_START_DATE=$(date -d "@$sprint_start" '+%Y-%m-%d' 2>/dev/null || date -r "$sprint_start" '+%Y-%m-%d' 2>/dev/null || echo "N/A")
    SPRINT_END_DATE=$(date -d "@$sprint_end" '+%Y-%m-%d' 2>/dev/null || date -r "$sprint_end" '+%Y-%m-%d' 2>/dev/null || echo "N/A")
}

# 统计完成的任务
count_completed_tasks() {
    local count=0
    local tasks=()

    for ticket_file in "$JIRA_DIR"/*/*.md; do
        if [ -f "$ticket_file" ]; then
            local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
            if [ "$status" = "done" ] || [ "$status" = "completed" ]; then
                ((count++))
                tasks+=("$(basename "$ticket_file" .md)")
            fi
        fi
    done

    COMPLETED_COUNT=$count
    COMPLETED_TASKS="${tasks[*]}"
}

# 统计未完成的任务
count_incomplete_tasks() {
    local count=0
    local tasks=()

    for ticket_file in "$JIRA_DIR"/*/*.md; do
        if [ -f "$ticket_file" ]; then
            local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
            if [ "$status" = "in_progress" ] || [ "$status" = "dev" ] || [ "$status" = "test" ] || [ "$status" = "review" ]; then
                ((count++))
                tasks+=("$(basename "$ticket_file" .md): $status")
            fi
        fi
    done

    INCOMPLETE_COUNT=$count
    INCOMPLETE_TASKS="${tasks[*]}"
}

# 统计代码指标
calculate_code_metrics() {
    local src_dir="$PROJECT_ROOT/src"

    if [ -d "$src_dir" ]; then
        # 统计文件数
        FILE_COUNT=$(find "$src_dir" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" \) 2>/dev/null | wc -l)

        # 统计代码行数
        LINE_COUNT=$(find "$src_dir" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" \) -exec cat {} \; 2>/dev/null | wc -l)

        # 统计提交数
        COMMIT_COUNT=$(git -C "$PROJECT_ROOT" rev-list --count HEAD 2>/dev/null || echo "0")

        # 统计 PR 数
        PR_COUNT=$(find "$PROJECT_ROOT/outbox/review_requests" -name "*.md" 2>/dev/null | wc -l)
    else
        FILE_COUNT=0
        LINE_COUNT=0
        COMMIT_COUNT=0
        PR_COUNT=0
    fi
}

# 统计阻塞问题
count_blockers() {
    local count=0

    for ticket_file in "$JIRA_DIR"/*/*.md; do
        if [ -f "$ticket_file" ]; then
            local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
            local blockers=$(grep -c "^blockers:" "$ticket_file" 2>/dev/null || echo "0")
            if [ "$status" = "blocked" ] || [ "$blockers" -gt 0 ]; then
                ((count++))
            fi
        fi
    done

    BLOCKER_COUNT=$count
}

# 生成 Sprint Review 报告
generate_report() {
    local sprint_num="$1"
    local output_file="$2"

    mkdir -p "$(dirname "$output_file")"

    cat > "$output_file" << EOF
# Sprint $sprint_num Review 报告

**生成时间**: $(date -Iseconds)
**Sprint 周期**: $SPRINT_START_DATE ~ $SPRINT_END_DATE
**预计天数**: $SPRINT_DURATION_DAYS 天

---

## 执行摘要

| 指标 | 数值 | 目标 |
|------|------|------|
| 完成任务数 | $COMPLETED_COUNT | $TASKS_PER_SPRINT |
| 进行中任务 | $INCOMPLETE_COUNT | - |
| 阻塞任务 | $BLOCKER_COUNT | 0 |
| 代码文件数 | $FILE_COUNT | - |
| 代码行数 | $LINE_COUNT | - |
| 提交次数 | $COMMIT_COUNT | - |
| PR 数量 | $PR_COUNT | - |

**完成率**: $(awk "BEGIN {printf \"%.1f\", ($COMPLETED_COUNT / $TASKS_PER_SPRINT) * 100}")%

---

## 完成的任务

EOF

    if [ $COMPLETED_COUNT -gt 0 ]; then
        for ticket_file in "$JIRA_DIR"/*/*.md; do
            if [ -f "$ticket_file" ]; then
                local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
                if [ "$status" = "done" ] || [ "$status" = "completed" ]; then
                    local ticket_id=$(basename "$ticket_file" .md)
                    local title=$(head -1 "$ticket_file" 2>/dev/null | sed 's/^# //' || echo "$ticket_id")
                    echo "- [x] **$ticket_id**: $title" >> "$output_file"
                fi
            fi
        done
    else
        echo "*本 Sprint 无完成任务*" >> "$output_file"
    fi

    cat >> "$output_file" << EOF

---

## 未完成的任务

EOF

    if [ $INCOMPLETE_COUNT -gt 0 ]; then
        for ticket_file in "$JIRA_DIR"/*/*.md; do
            if [ -f "$ticket_file" ]; then
                local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
                if [ "$status" = "in_progress" ] || [ "$status" = "dev" ] || [ "$status" = "test" ] || [ "$status" = "review" ]; then
                    local ticket_id=$(basename "$ticket_file" .md)
                    local title=$(head -1 "$ticket_file" 2>/dev/null | sed 's/^# //' || echo "$ticket_id")
                    echo "- [ ] **$ticket_id**: $title (状态：$status)" >> "$output_file"
                fi
            fi
        done
    else
        echo "*无进行中任务*" >> "$output_file"
    fi

    cat >> "$output_file" << EOF

---

## 代码质量指标

### 代码统计

- **文件总数**: $FILE_COUNT
- **代码行数**: $LINE_COUNT
- **平均每文件行数**: $(awk "BEGIN {if ($FILE_COUNT > 0) printf \"%.1f\", $LINE_COUNT / $FILE_COUNT; else print \"0\"}")

### 版本控制

- **总提交数**: $COMMIT_COUNT
- **PR 数量**: $PR_COUNT

---

## 问题与改进

### 阻塞问题

EOF

    if [ $BLOCKER_COUNT -gt 0 ]; then
        echo "**发现 $BLOCKER_COUNT 个阻塞任务**，需要优先处理。" >> "$output_file"
    else
        echo "无阻塞问题。" >> "$output_file"
    fi

    cat >> "$output_file" << EOF

### 改进建议

EOF

    # 根据指标生成改进建议
    if [ $COMPLETED_COUNT -lt $TASKS_PER_SPRINT ]; then
        echo "1. **任务完成率不足**: 目标 $TASKS_PER_SPRINT 个，实际完成 $COMPLETED_COUNT 个" >> "$output_file"
        echo "   - 建议：减少 Sprint 任务数量或增加并发 Slaver" >> "$output_file"
    fi

    if [ $BLOCKER_COUNT -gt 0 ]; then
        echo "2. **存在阻塞任务**: $BLOCKER_COUNT 个任务被阻塞" >> "$output_file"
        echo "   - 建议：优先解决依赖问题，创建依赖澄清任务" >> "$output_file"
    fi

    if [ $INCOMPLETE_COUNT -gt 3 ]; then
        echo "3. **进行中任务过多**: $INCOMPLETE_COUNT 个任务进行中" >> "$output_file"
        echo "   - 建议：限制并发任务数，先完成再开始新任务" >> "$output_file"
    fi

    cat >> "$output_file" << EOF

---

## 下一步计划

### Sprint $((sprint_num + 1)) 目标

- [ ] 完成 Sprint $sprint_num 未完成的任务
- [ ] 解决所有阻塞问题
- [ ] 目标完成 $TASKS_PER_SPRINT 个新任务

### 重点改进

1. 任务完成率提升至 100%
2. 减少阻塞问题
3. 提高代码质量

---

**报告生成者**: EKET Sprint Review Generator v0.5.1
**下次 Review**: Sprint $((sprint_num + 1)) 结束后
EOF

    log_info "报告已生成：$output_file"
}

# 主函数
main() {
    local sprint_num="${1:-1}"
    local output_file=""

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --output|-o)
                output_file="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    log_info "生成 Sprint $sprint_num Review 报告..."

    # 加载配置
    load_config

    # 计算日期
    calculate_sprint_dates "$sprint_num"

    # 统计数据
    count_completed_tasks
    count_incomplete_tasks
    calculate_code_metrics
    count_blockers

    # 生成报告
    if [ -z "$output_file" ]; then
        output_file="$OUTPUT_DIR/sprint-${sprint_num}-review-$(date +%Y%m%d_%H%M%S).md"
    fi

    generate_report "$sprint_num" "$output_file"

    log_info "✅ Sprint Review 报告生成完成"
}

main "$@"
