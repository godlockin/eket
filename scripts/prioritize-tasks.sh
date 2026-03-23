#!/bin/bash
#
# EKET 任务优先级算法 v0.5.1
# 用途：根据多维度加权计算任务优先级
#
# 用法:
#   ./scripts/prioritize-tasks.sh [--auto]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"

AUTO_MODE=false

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

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --auto|-a)
            AUTO_MODE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# 加载配置
load_config() {
    local config_file="$CONFIG_DIR/tasks.yml"

    if [ -f "$config_file" ]; then
        # 读取权重配置
        WEIGHT_BASE_PRIORITY=$(grep -A10 "factors:" "$config_file" 2>/dev/null | grep "base_priority:" | awk '{print $2}' || echo "0.25")
        WEIGHT_DEPENDENCY=$(grep -A10 "factors:" "$config_file" 2>/dev/null | grep "dependency_count:" | awk '{print $2}' || echo "0.20")
        WEIGHT_FUTURE_IMPACT=$(grep -A10 "factors:" "$config_file" 2>/dev/null | grep "future_impact:" | awk '{print $2}' || echo "0.20")
        WEIGHT_PHASE_IMPORTANCE=$(grep -A10 "factors:" "$config_file" 2>/dev/null | grep "phase_importance:" | awk '{print $2}' || echo "0.15")
        WEIGHT_URGENCY=$(grep -A10 "factors:" "$config_file" 2>/dev/null | grep "urgency:" | awk '{print $2}' || echo "0.10")
        WEIGHT_IMPORTANCE=$(grep -A10 "factors:" "$config_file" 2>/dev/null | grep "importance:" | awk '{print $2}' || echo "0.10")
    else
        # 默认权重
        WEIGHT_BASE_PRIORITY=0.25
        WEIGHT_DEPENDENCY=0.20
        WEIGHT_FUTURE_IMPACT=0.20
        WEIGHT_PHASE_IMPORTANCE=0.15
        WEIGHT_URGENCY=0.10
        WEIGHT_IMPORTANCE=0.10
    fi
}

# 基础优先级分数 (P0=100, P1=75, P2=50, P3=25)
calculate_base_priority() {
    local priority="$1"

    case "$priority" in
        P0|0|urgent) echo "100" ;;
        P1|1|high) echo "75" ;;
        P2|2|normal) echo "50" ;;
        P3|3|low) echo "25" ;;
        *) echo "50" ;;
    esac
}

# 计算依赖分数 (被依赖越多，分数越高)
calculate_dependency_score() {
    local ticket_id="$1"
    local dependent_count=0

    # 统计有多少任务依赖当前任务
    for ticket_file in "$JIRA_DIR"/*/*.md; do
        if [ -f "$ticket_file" ]; then
            if grep -q "dependencies:.*$ticket_id" "$ticket_file" 2>/dev/null; then
                ((dependent_count++))
            fi
        fi
    done

    # 分数计算：每个依赖 +10 分，最高 100 分
    local score=$((dependent_count * 10))
    if [ $score -gt 100 ]; then
        score=100
    fi

    echo "$score"
}

# 计算未来影响分数
calculate_future_impact() {
    local ticket_file="$1"
    local score=50

    # 检查是否涉及核心架构
    if grep -qiE "core|architecture|foundation|infrastructure" "$ticket_file" 2>/dev/null; then
        score=$((score + 30))
    fi

    # 检查是否涉及技术债务
    if grep -qiE "tech.?debt|refactor|migration" "$ticket_file" 2>/dev/null; then
        score=$((score + 20))
    fi

    # 检查是否涉及扩展性
    if grep -qiE "scalability|extension|plugin|api" "$ticket_file" 2>/dev/null; then
        score=$((score + 15))
    fi

    # 限制最高 100 分
    if [ $score -gt 100 ]; then
        score=100
    fi

    echo "$score"
}

# 计算 Phase 重要性分数
calculate_phase_importance() {
    local current_phase="$1"
    local ticket_phase="$2"
    local score=50

    # 当前 Phase 的任务优先级最高
    if [ "$current_phase" = "$ticket_phase" ]; then
        score=100
    fi

    echo "$score"
}

# 计算紧急程度分数
calculate_urgency() {
    local ticket_file="$1"
    local score=50

    # 检查是否有紧急标签
    if grep -qiE "urgent|critical|blocker|asap" "$ticket_file" 2>/dev/null; then
        score=100
    # 检查是否是 Bugfix
    elif [[ "$ticket_file" == *"/bugfix/"* ]]; then
        score=75
    fi

    echo "$score"
}

# 计算重要程度分数
calculate_importance() {
    local ticket_file="$1"
    local score=50

    # 检查是否涉及核心功能
    if grep -qiE "core|critical|essential|must-have" "$ticket_file" 2>/dev/null; then
        score=100
    # 检查是否影响用户体验
    elif grep -qiE "user experience|ux|usability|customer" "$ticket_file" 2>/dev/null; then
        score=85
    fi

    echo "$score"
}

# 计算单个任务的优先级
calculate_task_priority() {
    local ticket_file="$1"
    local current_phase="$2"
    local ticket_id=$(basename "$ticket_file" .md)

    # 提取任务信息
    local priority=$(grep "^priority:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "P2")
    local phase=$(grep "^phase:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "phase_1")

    # 计算各维度分数
    local base_score=$(calculate_base_priority "$priority")
    local dep_score=$(calculate_dependency_score "$ticket_id")
    local future_score=$(calculate_future_impact "$ticket_file")
    local phase_score=$(calculate_phase_importance "$current_phase" "$phase")
    local urgency_score=$(calculate_urgency "$ticket_file")
    local importance_score=$(calculate_importance "$ticket_file")

    # 加权计算
    local final_score=$(awk "BEGIN {
        score = ($base_score * $WEIGHT_BASE_PRIORITY) +
                ($dep_score * $WEIGHT_DEPENDENCY) +
                ($future_score * $WEIGHT_FUTURE_IMPACT) +
                ($phase_score * $WEIGHT_PHASE_IMPORTANCE) +
                ($urgency_score * $WEIGHT_URGENCY) +
                ($importance_score * $WEIGHT_IMPORTANCE)
        printf \"%.2f\", score
    }")

    echo "$ticket_id:$final_score:$base_score:$dep_score:$future_score:$phase_score:$urgency_score:$importance_score"
}

# 对所有任务排序
prioritize_all_tasks() {
    log_info "计算任务优先级..."

    # 获取当前 Phase
    local current_phase=$(grep "^stage:" "$PROJECT_ROOT/.eket/config.yml" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "phase_1")

    local results=()

    # 遍历所有任务
    for ticket_file in "$JIRA_DIR"/*/*.md; do
        if [ -f "$ticket_file" ]; then
            local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')

            # 只计算 ready 或 backlog 状态的任务
            if [ "$status" = "ready" ] || [ "$status" = "backlog" ]; then
                local result=$(calculate_task_priority "$ticket_file" "$current_phase")
                results+=("$result")
            fi
        fi
    done

    # 按分数排序
    echo ""
    echo "=== 任务优先级排序 (v0.5.1 多维度算法) ==="
    echo ""
    printf '%s\n' "${results[@]}" | sort -t':' -k2 -rn | while IFS=':' read -r id score base dep future phase urgency importance; do
        printf "%-20s 总分：%-6s (基础：%-3s 依赖：%-3s 未来：%-3s Phase: %-3s 紧急：%-3s 重要：%-3s)\n" \
            "$id" "$score" "$base" "$dep" "$future" "$phase" "$urgency" "$importance"
    done
}

# 主函数
main() {
    log_info "EKET 任务优先级算法 v0.5.1"

    # 加载配置
    load_config

    # 检查 Jira 目录
    if [ ! -d "$JIRA_DIR" ]; then
        log_error "Jira 目录不存在：$JIRA_DIR"
        exit 1
    fi

    # 计算并排序
    prioritize_all_tasks
}

main "$@"
