#!/bin/bash
# Slaver 轮询脚本 - 定期检查任务、PR 反馈和消息队列
# 版本：v2.1.4
# 用途：Slaver 实例在等待/工作期间定期检查系统状态

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
MAGENTA='\033[0;35m'
NC='\033[0m'

# 动态路径配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 获取当前实例 ID
INSTANCE_ID=$(get_my_instance_id)
INSTANCE_ROLE=$(get_my_role)
INSTANCE_SPECIALTY=$(get_my_specialty)

# 配置参数（可通过环境变量覆盖）
IDLE_POLL_INTERVAL="${EKET_SLAVER_IDLE_POLL_INTERVAL:-10}"   # 空闲等待 10 秒
WORK_POLL_INTERVAL="${EKET_SLAVER_WORK_POLL_INTERVAL:-300}"  # 工作中 5 分钟
HEARTBEAT_FILE=".eket/state/slaver_${INSTANCE_ID}_heartbeat.yml"

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
# Slaver 心跳
instance_id: $INSTANCE_ID
specialty: $INSTANCE_SPECIALTY
last_check: $(date -Iseconds)
status: $SLAVER_STATUS
current_ticket: $CURRENT_TICKET
pending_pr_feedback: $PENDING_PR_FEEDBACK
new_messages: $NEW_MESSAGE_COUNT
ready_tasks: $READY_TASK_COUNT
EOF
    # 同时更新公共心跳文件
    update_heartbeat 2>/dev/null || true
}

# 检查 Slaver 状态
check_slaver_status() {
    SLAVER_STATUS="idle"
    CURRENT_TICKET="none"

    # 检查是否有进行中的任务
    if [ -d "jira/tickets" ]; then
        for ticket_file in $(find jira/tickets -name "*.md" -type f 2>/dev/null); do
            status=$(grep -m1 "^状态:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
            assignee=$(grep -m1 "^分配给:|^负责人:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

            # 检查是否是自己负责的任务（使用 instance_id 匹配）
            if [[ "$status" == "in_progress" || "$status" == "review" ]]; then
                if [[ "$assignee" == *"$INSTANCE_ID"* ]] || grep -q "$INSTANCE_ID" "$ticket_file" 2>/dev/null; then
                    SLAVER_STATUS="working"
                    CURRENT_TICKET=$(basename "$ticket_file" .md)
                    break
                fi
            fi
        done

        # 检查是否有等待 PR 反馈（根据自己的 instance_id 筛选）
        if [ -d "outbox/review_requests" ]; then
            for pr_file in outbox/review_requests/*.md; do
                if [ -f "$pr_file" ] && grep -q "$INSTANCE_ID" "$pr_file" 2>/dev/null; then
                    SLAVER_STATUS="waiting_review"
                    break
                fi
            done
        fi
    fi
}

# 检查当前任务状态
check_current_task() {
    log_check "检查当前任务状态..."

    if [ "$CURRENT_TICKET" = "none" ]; then
        log_info "当前无进行中的任务"
        return
    fi

    log_info "当前任务：$CURRENT_TICKET"

    # 查找任务文件
    ticket_file=""
    for dir in feature bugfix task fix; do
        if [ -f "jira/tickets/$dir/$CURRENT_TICKET.md" ]; then
            ticket_file="jira/tickets/$dir/$CURRENT_TICKET.md"
            break
        fi
    done

    if [ -n "$ticket_file" ] && [ -f "$ticket_file" ]; then
        echo ""
        echo "┌──────────────────────────────────────────────────────────────┐"
        echo "│  任务详情：$CURRENT_TICKET"
        echo "├──────────────────────────────────────────────────────────────┤"

        status=$(grep -m1 "^状态:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
        priority=$(grep -m1 "^优先级:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
        assignee=$(grep -m1 "^分配给:|^负责人:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")

        echo "│  状态：$status"
        echo "│  优先级：$priority"
        echo "│  负责人：$assignee"
        echo "└──────────────────────────────────────────────────────────────┘"

        # 检查是否有阻塞
        if grep -q "^blocked_by:" "$ticket_file" 2>/dev/null; then
            blocked_by=$(grep -m1 "^blocked_by:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' []' || echo "")
            if [ -n "$blocked_by" ] && [ "$blocked_by" != "null" ] && [ "$blocked_by" != "[]" ]; then
                log_warn "任务被阻塞：$blocked_by"
            fi
        fi
    else
        log_warn "任务文件未找到：$CURRENT_TICKET"
    fi
}

# 检查 PR 反馈
check_pr_feedback() {
    log_check "检查 PR 反馈..."
    PENDING_PR_FEEDBACK=0

    if [ -d "outbox/review_requests" ]; then
        for pr_file in outbox/review_requests/*.md; do
            if [ -f "$pr_file" ]; then
                # 检查是否有 Review 结果
                if grep -q "## Master Review\|## 审核意见" "$pr_file" 2>/dev/null; then
                    # 检查是否已处理
                    if ! grep -q "状态：.*processed" "$pr_file" 2>/dev/null; then
                        PENDING_PR_FEEDBACK=$((PENDING_PR_FEEDBACK + 1))
                        log_info "发现待处理的 Review 反馈：$(basename "$pr_file")"

                        # 显示 Review 结果
                        result=$(grep -m1 "^结果:\|^审核结果:" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
                        echo "    审核结果：$result"

                        case $result in
                            approved|Approved)
                                echo -e "    ${GREEN}✓ 已批准，可以领取新任务或等待 merge${NC}"
                                ;;
                            changes_requested|Changes Requested)
                                echo -e "    ${YELLOW}⚠ 需要修改${NC}"
                                ;;
                            rejected|Rejected)
                                echo -e "    ${RED}✗ 已驳回${NC}"
                                ;;
                        esac
                    fi
                fi
            fi
        done
    fi

    # 检查消息队列中的 Review 结果
    if [ -d "shared/message_queue/inbox" ]; then
        for msg_file in shared/message_queue/inbox/*.json; do
            if [ -f "$msg_file" ]; then
                msg_type=$(grep -m1 '"type"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "")
                if [[ "$msg_type" == *"review"* || "$msg_type" == *"pr_"* ]]; then
                    log_info "发现 PR 相关消息：$(basename "$msg_file")"
                fi
            fi
        done
    fi

    if [ "$PENDING_PR_FEEDBACK" -eq 0 ]; then
        log_info "无待处理的 PR 反馈"
    fi
}

# 检查消息队列
check_message_queue() {
    log_check "检查消息队列..."
    NEW_MESSAGE_COUNT=0

    if [ -d "shared/message_queue/inbox" ]; then
        NEW_MESSAGE_COUNT=$(find "shared/message_queue/inbox" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')

        if [ "$NEW_MESSAGE_COUNT" -gt 0 ]; then
            log_info "发现 $NEW_MESSAGE_COUNT 条新消息"

            echo ""
            echo "┌──────────────────────────────────────────────────────────────┐"
            echo "│  新消息列表                                                   │"
            echo "├──────────────────────────────────────────────────────────────┤"

            for msg_file in shared/message_queue/inbox/*.json; do
                if [ -f "$msg_file" ]; then
                    msg_type=$(grep -m1 '"type"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
                    msg_from=$(grep -m1 '"from"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
                    msg_time=$(grep -m1 '"timestamp"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "unknown")

                    echo "│  ${CYAN}$(basename "$msg_file")${NC}"
                    echo "│    类型：$msg_type | 来自：$msg_from | 时间：$msg_time"
                    echo ""
                fi
            done

            echo "└──────────────────────────────────────────────────────────────┘"
        else
            log_info "消息队列为空"
        fi
    else
        log_info "消息队列目录不存在"
    fi
}

# 检查可领取的任务
check_ready_tasks() {
    log_check "检查可领取的任务..."
    READY_TASK_COUNT=0

    # 读取角色配置
    SLAVER_ROLE=$(grep "^agent_type:" ".eket/state/instance_config.yml" 2>/dev/null | cut -d':' -f2 | tr -d ' "' || echo "none")

    if [ ! -f "jira/state/ticket-index.yml" ]; then
        log_warn "Ticket 索引文件不存在"
        return
    fi

    # 从索引文件中查找 ready 状态的任务
    ready_tasks=$(grep -A 5 "ready:" jira/state/ticket-index.yml 2>/dev/null | grep -v "^ready:" | grep -v "^$" || echo "")

    if [ -n "$ready_tasks" ]; then
        # 解析 ready 任务列表
        for task in $ready_tasks; do
            task_id=$(echo "$task" | tr -d '[]-')
            if [ -n "$task_id" ]; then
                READY_TASK_COUNT=$((READY_TASK_COUNT + 1))

                # 查找任务详情
                for dir in feature bugfix task fix; do
                    ticket_file="jira/tickets/$dir/$task_id.md"
                    if [ -f "$ticket_file" ]; then
                        role=$(grep -m1 "^适配角色:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
                        priority=$(grep -m1 "^优先级:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

                        # 角色匹配检查
                        role_match="✓"
                        if [ -n "$SLAVER_ROLE" ] && [ -n "$role" ]; then
                            if [[ "$role" != *"$SLAVER_ROLE"* ]]; then
                                role_match="○"
                            fi
                        fi

                        echo "  ${role_match} ${CYAN}$task_id${NC} - 优先级：$priority, 角色：$role"
                    fi
                    break
                done
            fi
        done
    fi

    if [ "$READY_TASK_COUNT" -eq 0 ]; then
        log_info "无 ready 状态的任务"
    else
        echo ""
        log_info "共 $READY_TASK_COUNT 个 ready 任务"

        if [ "$SLAVER_STATUS" = "idle" ] && [ "$READY_TASK_COUNT" -gt 0 ]; then
            echo ""
            echo -e "${GREEN}建议：运行 /eket-claim <ticket-id> 领取任务${NC}"
        fi
    fi
}

# 检查人类反馈
check_human_feedback() {
    log_check "检查人类反馈..."

    if [ -d "inbox/human_feedback" ]; then
        # 查找最新的反馈文件
        latest_feedback=$(ls -t inbox/human_feedback/*.md 2>/dev/null | head -1 || echo "")

        if [ -n "$latest_feedback" ] && [ -f "$latest_feedback" ]; then
            file_time=$(stat -f %m "$latest_feedback" 2>/dev/null || stat -c %Y "$latest_feedback" 2>/dev/null || echo "0")
            current_time=$(date +%s)
            age=$((current_time - file_time))

            log_info "最新人类反馈：$(basename "$latest_feedback") ($((age / 60)) 分钟前)"

            # 检查是否有需要 Slaver 处理的内容
            if grep -q "Slaver\|slaver\|执行\|修改" "$latest_feedback" 2>/dev/null; then
                log_warn "反馈中包含 Slaver 相关内容，请检查"
            fi
        else
            log_info "无人类反馈"
        fi
    else
        log_info "人类反馈目录不存在"
    fi
}

# 检查阻塞报告
check_blocker_reports() {
    log_check "检查阻塞报告..."

    if [ -d "inbox/blocker_reports" ]; then
        report_count=$(find "inbox/blocker_reports" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

        if [ "$report_count" -gt 0 ]; then
            log_warn "发现 $report_count 个阻塞报告"

            for report_file in inbox/blocker_reports/*.md; do
                if [ -f "$report_file" ]; then
                    echo ""
                    echo "  ${RED}$(basename "$report_file")${NC}"

                    # 检查是否是自己提交的
                    if grep -q "$(hostname)" "$report_file" 2>/dev/null; then
                        echo "    状态：等待 Master 仲裁"
                    fi
                fi
            done
        else
            log_info "无阻塞报告"
        fi
    fi
}

# 显示轮询摘要
show_poll_summary() {
    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  Slaver 轮询摘要                                      │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  状态：${SLAVER_STATUS}"
    echo "│  当前任务：$CURRENT_TICKET"
    echo "│  PR 反馈：$PENDING_PR_FEEDBACK 个"
    echo "│  新消息：$NEW_MESSAGE_COUNT 条"
    echo "│  Ready 任务：$READY_TASK_COUNT 个"
    echo "│  轮询间隔：${IDLE_POLL_INTERVAL}秒 (空闲) / ${WORK_POLL_INTERVAL}秒 (工作中)"
    echo "└──────────────────────────────────────────────────────────────┘"
}

# 主轮询循环
run_poll() {
    log_info "Slaver 轮询启动"
    echo ""

    iteration=0

    while true; do
        iteration=$((iteration + 1))

        echo ""
        echo "════════════════════════════════════════════════════════════════"
        log_info "轮询 #$iteration 开始"
        echo "════════════════════════════════════════════════════════════════"
        echo ""

        # 检查 Slaver 状态
        check_slaver_status

        # 根据状态调整轮询间隔
        case $SLAVER_STATUS in
            idle)
                current_interval=$IDLE_POLL_INTERVAL
                log_info "状态：空闲等待，轮询间隔 ${current_interval}秒"
                ;;
            working)
                current_interval=$WORK_POLL_INTERVAL
                log_info "状态：工作中，轮询间隔 ${current_interval}秒"
                ;;
            waiting_review)
                current_interval=$IDLE_POLL_INTERVAL  # 等待 PR 反馈时快速响应
                log_info "状态：等待 PR 反馈，轮询间隔 ${current_interval}秒"
                ;;
            *)
                current_interval=$IDLE_POLL_INTERVAL
                ;;
        esac

        echo ""

        # 核心检查
        check_current_task
        echo ""
        check_pr_feedback
        echo ""
        check_message_queue
        echo ""
        check_ready_tasks
        echo ""
        check_human_feedback
        echo ""
        check_blocker_reports

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
    echo "  -i, --interval <秒>    设置空闲时轮询间隔（默认：10 秒）"
    echo "  -w, --work-interval <秒>  设置工作时轮询间隔（默认：300 秒）"
    echo "  -o, --once             只执行一次，不循环"
    echo "  -h, --help             显示帮助"
    echo ""
    echo "环境变量:"
    echo "  EKET_SLAVER_IDLE_POLL_INTERVAL  空闲时轮询间隔（秒）"
    echo "  EKET_SLAVER_WORK_POLL_INTERVAL  工作中轮询间隔（秒）"
    echo ""
    echo "示例:"
    echo "  $0                    # 以默认间隔轮询"
    echo "  $0 -i 30              # 空闲时 30 秒轮询一次"
    echo "  $0 -w 600             # 工作时 10 分钟轮询一次"
    echo "  $0 -o                 # 只执行一次"
}

# 解析参数
ONCE=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -i|--interval) IDLE_POLL_INTERVAL="$2"; shift ;;
        -w|--work-interval) WORK_POLL_INTERVAL="$2"; shift ;;
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
if [ "$INSTANCE_ROLE" != "slaver" ]; then
    log_error "当前实例不是 Slaver 角色"
    echo "当前角色：$INSTANCE_ROLE"
    echo "实例 ID: $INSTANCE_ID"
    echo "$0 仅 Slaver 实例可用"
    exit 1
fi

log_info "Slaver 轮询脚本已就绪"
log_info "实例 ID: $INSTANCE_ID"
log_info "角色配置：$INSTANCE_SPECIALTY"

# 执行轮询
if [ "$ONCE" = true ]; then
    check_slaver_status
    check_current_task
    check_pr_feedback
    check_message_queue
    check_ready_tasks
    check_human_feedback
    check_blocker_reports
    update_heartbeat
    show_poll_summary
else
    run_poll
fi
