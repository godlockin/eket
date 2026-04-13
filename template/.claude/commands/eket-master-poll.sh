#!/bin/bash
# Master 轮询脚本 - 定期检查 PR、仲裁请求和人类通知
# 版本：v2.1.4
# 用途：Master 实例在空闲/工作期间定期检查系统状态

# 加载公共函数
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_eket_common.sh"

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# 动态路径配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 获取当前实例 ID
INSTANCE_ID=$(get_my_instance_id)
INSTANCE_ROLE=$(get_my_role)

# 配置参数（可通过环境变量覆盖）
POLL_INTERVAL="${EKET_MASTER_POLL_INTERVAL:-10}"  # 默认 10 秒
IDLE_POLL_INTERVAL="${EKET_MASTER_IDLE_POLL_INTERVAL:-600}"  # 空闲时 10 分钟
WORK_POLL_INTERVAL="${EKET_MASTER_WORK_POLL_INTERVAL:-300}"  # 工作中 5 分钟
HEARTBEAT_FILE=".eket/state/master_${INSTANCE_ID}_heartbeat.yml"

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_check() {
    echo -e "${CYAN}[CHECK]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 更新心跳
update_heartbeat() {
    mkdir -p "$(dirname "$HEARTBEAT_FILE")"
    cat > "$HEARTBEAT_FILE" <<EOF
# Master 心跳
instance_id: $INSTANCE_ID
last_check: $(date -Iseconds)
status: $MASTER_STATUS
pending_prs: $PENDING_PR_COUNT
pending_arbitrations: $PENDING_ARBITRATION_COUNT
pending_human_decisions: $PENDING_HUMAN_COUNT
EOF
    # 同时更新公共心跳文件
    update_heartbeat 2>/dev/null || true
}

# 检查 Master 状态
check_master_status() {
    MASTER_STATUS="idle"

    # 检查是否有进行中的 Review
    if [ -d "outbox/review_requests" ] && [ "$(ls -A outbox/review_requests 2>/dev/null)" ]; then
        MASTER_STATUS="working"
    fi

    # 检查是否有等待仲裁的请求
    if [ -d "inbox/blocker_reports" ] && [ "$(ls -A inbox/blocker_reports 2>/dev/null)" ]; then
        MASTER_STATUS="working"
    fi

    # 检查是否有等待人类决策的事项
    if [ -f "inbox/human_feedback/block-".*.md ]; then
        MASTER_STATUS="waiting_human"
    fi
}

# 检查 PR 队列
check_pr_queue() {
    log_check "检查 PR 队列..."
    PENDING_PR_COUNT=0

    if [ -d "outbox/review_requests" ]; then
        PENDING_PR_COUNT=$(find "outbox/review_requests" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

        if [ "$PENDING_PR_COUNT" -gt 0 ]; then
            log_info "发现 $PENDING_PR_COUNT 个待审核 PR"

            # 检查是否有超过 30 分钟未处理的 PR
            for pr_file in outbox/review_requests/*.md; do
                if [ -f "$pr_file" ]; then
                    file_time=$(stat -f %m "$pr_file" 2>/dev/null || stat -c %Y "$pr_file" 2>/dev/null || echo "0")
                    current_time=$(date +%s)
                    age=$((current_time - file_time))

                    if [ "$age" -gt 1800 ]; then  # 30 分钟
                        log_warn "PR $(basename "$pr_file") 已等待 $((age / 60)) 分钟"
                    fi
                fi
            done

            echo ""
            echo "┌──────────────────────────────────────────────────────────────┐"
            echo "│  待审核 PR 列表                                                 │"
            echo "├──────────────────────────────────────────────────────────────┤"

            for pr_file in outbox/review_requests/*.md; do
                if [ -f "$pr_file" ]; then
                    ticket_id=$(basename "$pr_file" .md | sed 's/pr_//' | cut -d'_' -f1)
                    echo "│  ${CYAN}$(basename "$pr_file")${NC}"
                    echo "│    Ticket: $ticket_id"
                fi
            done

            echo "└──────────────────────────────────────────────────────────────┘"
        else
            log_info "PR 队列为空"
        fi
    else
        log_warn "PR 队列目录不存在"
    fi
}

# 检查仲裁请求
check_arbitration_requests() {
    log_check "检查仲裁请求..."
    PENDING_ARBITRATION_COUNT=0

    if [ -d "inbox/blocker_reports" ]; then
        PENDING_ARBITRATION_COUNT=$(find "inbox/blocker_reports" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

        if [ "$PENDING_ARBITRATION_COUNT" -gt 0 ]; then
            log_warn "发现 $PENDING_ARBITRATION_COUNT 个阻塞报告"

            echo ""
            echo "┌──────────────────────────────────────────────────────────────┐"
            echo "│  阻塞报告列表                                                 │"
            echo "├──────────────────────────────────────────────────────────────┤"

            for report_file in inbox/blocker_reports/*.md; do
                if [ -f "$report_file" ]; then
                    report_name=$(basename "$report_file")
                    file_time=$(stat -f %m "$report_file" 2>/dev/null || stat -c %Y "$report_file" 2>/dev/null || echo "0")
                    current_time=$(date +%s)
                    age=$((current_time - file_time))

                    echo "│  ${RED}$report_name${NC}"
                    echo "│    等待时间：$((age / 60)) 分钟"

                    if [ "$age" -gt 1800 ]; then  # 30 分钟
                        echo "│    ${RED}⚠ 超时警告：超过 30 分钟未处理${NC}"
                    fi
                    echo ""
                fi
            done

            echo "└──────────────────────────────────────────────────────────────┘"
        else
            log_info "无阻塞报告"
        fi
    else
        log_info "阻塞报告目录不存在"
    fi
}

# 检查人类反馈
check_human_feedback() {
    log_check "检查人类反馈..."
    PENDING_HUMAN_COUNT=0

    # 检查人类回复
    if [ -d "inbox/human_feedback" ]; then
        # 查找新的反馈文件（人类回复的）
        for feedback_file in inbox/human_feedback/*.md; do
            if [ -f "$feedback_file" ]; then
                # 检查是否有人类回复标记
                if grep -q "## 人类反馈" "$feedback_file" 2>/dev/null; then
                    # 检查是否已处理
                    if ! grep -q "状态：.*processed" "$feedback_file" 2>/dev/null; then
                        PENDING_HUMAN_COUNT=$((PENDING_HUMAN_COUNT + 1))
                        log_info "发现待处理的人类反馈：$(basename "$feedback_file")"
                    fi
                fi
            fi
        done
    fi

    # 检查人类需求输入
    if [ -f "inbox/human_input.md" ]; then
        if grep -q "## 需求描述" "inbox/human_input.md" 2>/dev/null; then
            if ! grep -q "状态：.*processed" "inbox/human_input.md" 2>/dev/null; then
                log_info "发现新的需求输入"
                PENDING_HUMAN_COUNT=$((PENDING_HUMAN_COUNT + 1))
            fi
        fi
    fi

    if [ "$PENDING_HUMAN_COUNT" -eq 0 ]; then
        log_info "无待处理的人类反馈"
    fi
}

# 检查 Slaver 状态
check_slaver_status() {
    log_check "检查 Slaver 状态..."

    if [ -f "jira/state/ticket-index.yml" ]; then
        # 检查是否有空闲 Slaver
        idle_count=$(grep -c "status: idle" jira/state/slavers/*.yml 2>/dev/null || echo "0")
        busy_count=$(grep -c "status: busy" jira/state/slavers/*.yml 2>/dev/null || echo "0")

        if [ "$idle_count" -gt 0 ]; then
            log_warn "发现 $idle_count 个空闲 Slaver"
        fi
        if [ "$busy_count" -gt 0 ]; then
            log_info "有 $busy_count 个 Slaver 正在工作"
        fi

        # 检查是否有超过 30 分钟无更新的 Slaver
        for slaver_file in .eket/state/slavers/*.yml; do
            if [ -f "$slaver_file" ]; then
                file_time=$(stat -f %m "$slaver_file" 2>/dev/null || stat -c %Y "$slaver_file" 2>/dev/null || echo "0")
                current_time=$(date +%s)
                age=$((current_time - file_time))

                if [ "$age" -gt 1800 ]; then  # 30 分钟
                    log_warn "Slaver $(basename "$slaver_file" .yml) 超过 30 分钟无更新"
                fi
            done
        done
    else
        log_info "Slaver 索引文件不存在"
    fi
}

# 项目状态更新（每 10 分钟）
update_project_status() {
    log_check "更新项目状态..."

    mkdir -p jira/state

    # 更新 ticket 索引
    if [ ! -f "jira/state/ticket-index.yml" ]; then
        cat > "jira/state/ticket-index.yml" <<'EOF'
# Ticket 索引文件（Single Source of Truth）
status_index:
  backlog: []
  ready: []
  in_progress: []
  review: []
  done: []
by_id: {}
slaver_workload: {}
last_updated: null
EOF
    fi

    # 更新项目状态报告
    cat > "jira/state/project-status.yml" <<EOF
# 项目状态报告
# 生成于：$(date -Iseconds)

last_updated: $(date -Iseconds)

slavers:
  active: []
  idle: []
  busy: []

cards:
  milestones: []
  sprints: []
  epics: []
  tickets: []

progress:
  sprint_target: null
  deadline: null
  days_remaining: null
  completed: 0
  total: 0
  completion_rate: 0%

risks: []
action_items: []
EOF

    log_info "项目状态已更新"
}

# 显示轮询摘要
show_poll_summary() {
    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  Master 轮询摘要                                      │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  状态：${MASTER_STATUS}"
    echo "│  PR 待审核：$PENDING_PR_COUNT 个"
    echo "│  仲裁请求：$PENDING_ARBITRATION_COUNT 个"
    echo "│  人类反馈：$PENDING_HUMAN_COUNT 个"
    echo "│  轮询间隔：${POLL_INTERVAL}秒"
    echo "└──────────────────────────────────────────────────────────────┘"
}

# 主轮询循环
run_poll() {
    log_info "Master 轮询启动"
    log_info "轮询间隔：${POLL_INTERVAL}秒"
    echo ""

    iteration=0
    project_status_iteration=0

    while true; do
        iteration=$((iteration + 1))
        project_status_iteration=$((project_status_iteration + 1))

        echo ""
        echo "════════════════════════════════════════════════════════════════"
        log_info "轮询 #$iteration 开始"
        echo "════════════════════════════════════════════════════════════════"
        echo ""

        # 检查 Master 状态
        check_master_status

        # 根据状态调整轮询间隔
        case $MASTER_STATUS in
            idle)
                current_interval=$IDLE_POLL_INTERVAL
                ;;
            working)
                current_interval=$WORK_POLL_INTERVAL
                ;;
            waiting_human)
                current_interval=10  # 等待人类时快速响应
                ;;
            *)
                current_interval=$POLL_INTERVAL
                ;;
        esac

        # 核心检查
        check_pr_queue
        echo ""
        check_arbitration_requests
        echo ""
        check_human_feedback
        echo ""

        # Slaver 状态检查
        check_slaver_status
        echo ""

        # 每 10 分钟更新项目状态
        if [ "$project_status_iteration" -ge 60 ]; then  # 假设 10 秒间隔，60 次=10 分钟
            update_project_status
            project_status_iteration=0
        fi

        # 更新心跳
        update_heartbeat

        # 显示摘要
        show_poll_summary

        echo ""
        log_info "等待 ${current_interval} 秒后进行下一轮检查..."
        echo ""

        sleep "$current_interval"
    done
}

# 显示用法
show_usage() {
    echo "用法：$0 [选项]"
    echo ""
    echo "选项:"
    echo "  -i, --interval <秒>    设置轮询间隔（默认：10 秒）"
    echo "  -o, --once             只执行一次，不循环"
    echo "  -h, --help             显示帮助"
    echo ""
    echo "环境变量:"
    echo "  EKET_MASTER_POLL_INTERVAL       轮询间隔（秒）"
    echo "  EKET_MASTER_IDLE_POLL_INTERVAL  空闲时轮询间隔（秒）"
    echo "  EKET_MASTER_WORK_POLL_INTERVAL  工作中轮询间隔（秒）"
    echo ""
    echo "示例:"
    echo "  $0                    # 以默认间隔轮询"
    echo "  $0 -i 30              # 30 秒轮询一次"
    echo "  $0 -o                 # 只执行一次"
}

# 解析参数
ONCE=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -i|--interval) POLL_INTERVAL="$2"; shift ;;
        -o|--once) ONCE=true ;;
        -h|--help) show_usage; exit 0 ;;
        *) echo "未知参数：$1"; show_usage; exit 1 ;;
    esac
    shift
done

# 检查是否已初始化
if [ -z "$INSTANCE_ID" ]; then
    log_error "实例 ID 为空"
    echo "请先运行 /eket-init 或 /eket-start 初始化实例"
    exit 1
fi

# 检查角色
if [ "$INSTANCE_ROLE" != "master" ]; then
    log_error "当前实例不是 Master 角色"
    echo "当前角色：$INSTANCE_ROLE"
    echo "实例 ID: $INSTANCE_ID"
    echo "$0 仅 Master 实例可用"
    exit 1
fi

log_info "Master 轮询脚本已就绪"
log_info "实例 ID: $INSTANCE_ID"

# 执行轮询
if [ "$ONCE" = true ]; then
    check_master_status
    check_pr_queue
    check_arbitration_requests
    check_human_feedback
    check_slaver_status
    update_project_status
    update_heartbeat
    show_poll_summary
else
    run_poll
fi
