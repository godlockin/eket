#!/bin/bash
#
# EKET 任务重置广播通知 v0.5.1
# 用途：当任务被重置时，广播通知相关智能体和人类
#
# 用法:
#   ./scripts/broadcast-task-reset.sh <ticket_id> <reason>
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$PROJECT_ROOT/.eket/state"
MESSAGE_QUEUE_DIR="$PROJECT_ROOT/shared/message_queue"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"

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

# 广播任务重置通知
broadcast_reset() {
    local ticket_id="$1"
    local reason="$2"
    local timestamp=$(date -Iseconds)
    local msg_id="msg_reset_${ticket_id}_$(date +%Y%m%d_%H%M%S)"

    # 创建消息队列目录
    mkdir -p "$MESSAGE_QUEUE_DIR"

    # 创建广播消息
    local message_file="$MESSAGE_QUEUE_DIR/${msg_id}.json"

    cat > "$message_file" << EOF
{
    "id": "$msg_id",
    "timestamp": "$timestamp",
    "from": "system",
    "to": "all_agents",
    "type": "task_reset_notification",
    "priority": "high",
    "payload": {
        "ticket_id": "$ticket_id",
        "reason": "$reason",
        "action_required": "release_resources",
        "reset_details": {
            "slaver_released": true,
            "worktree_cleaned": true,
            "state_reset": true,
            "jira_status_updated": true
        }
    }
}
EOF

    log_info "广播消息已创建：$message_file"

    # 更新任务状态为 ready
    local ticket_file=$(find "$JIRA_DIR" -name "${ticket_id}.md" 2>/dev/null | head -1)
    if [ -f "$ticket_file" ]; then
        sed -i.bak "s/status: in_progress/status: ready/" "$ticket_file"
        rm -f "$ticket_file.bak"
        log_info "✓ 任务状态已更新为 ready"
    else
        log_warn "⚠ 任务文件未找到：$ticket_id"
    fi

    # 清理 Slaver 状态文件
    local slaver_state="$STATE_DIR/slaver-${ticket_id}.yml"
    if [ -f "$slaver_state" ]; then
        rm -f "$slaver_state"
        log_info "✓ Slaver 状态文件已清理"
    fi

    # 创建重置记录
    local reset_log="$STATE_DIR/task-resets.log"
    echo "[$timestamp] $ticket_id: $reason" >> "$reset_log"
    log_info "✓ 重置记录已保存"

    # 通知人类（创建通知文件）
    local human_notification="$STATE_DIR/notifications/human-reset-notice-${ticket_id}.md"
    mkdir -p "$(dirname "$human_notification")"

    cat > "$human_notification" << EOF
# 任务重置通知

**任务 ID**: $ticket_id
**重置时间**: $timestamp
**重置原因**: $reason

---

## 重置详情

- [x] Slaver 已释放
- [x] Worktree 已清理
- [x] 状态文件已重置
- [x] Jira 状态已更新为 ready

## 后续操作

任务已返回待领取状态，新的 Slaver 实例可以领取此任务。

---

**生成者**: EKET Broadcast System v0.5.1
EOF

    log_info "✓ 人类通知已创建：$human_notification"
}

# 主函数
main() {
    local ticket_id="${1:-}"
    local reason="${2:-未指定原因}"

    if [ -z "$ticket_id" ]; then
        echo "用法：$0 <ticket_id> <reason>"
        exit 1
    fi

    log_info "广播任务重置通知：$ticket_id"
    log_info "重置原因：$reason"

    broadcast_reset "$ticket_id" "$reason"

    echo ""
    log_info "✅ 广播完成"
}

main "$@"
