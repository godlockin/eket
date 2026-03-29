#!/bin/bash

# OpenCLAW 命令执行器
# 用于 OpenCLAW 调用 EKET 框架

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 创建 Epic
create_epic() {
    local name="$1"
    local description="$2"
    local priority="$3"
    local deadline="$4"

    log_info "创建 Epic: $name"

    # 调用 Node.js API 或脚本创建 Epic
    local epic_id="EPIC-$(date +%s)"

    cat > "${PROJECT_ROOT}/jira/epics/${epic_id}.md" << EOF
# Epic: ${epic_id} - ${name}

**创建时间**: $(date -Iseconds)
**优先级**: ${priority:-high}
**截止日期**: ${deadline:-TBD}
**状态**: backlog

## 描述

${description}

## 关联 Tickets

- [ ] TODO: Master 分析后创建
EOF

    log_success "Epic 创建成功：${epic_id}"
    echo "{\"epic_id\": \"${epic_id}\", \"status\": \"created\"}"
}

# 创建 Ticket
create_ticket() {
    local epic_id="$1"
    local type="$2"
    local title="$3"
    local assignee_role="$4"

    log_info "创建 Ticket: $title (Epic: ${epic_id})"

    # 映射类型到前缀
    local prefix
    case "$type" in
        feature) prefix="FEAT" ;;
        bugfix)  prefix="FIX" ;;
        test)    prefix="TEST" ;;
        doc)     prefix="DOC" ;;
        *)       prefix="TASK" ;;
    esac

    local seq=$(printf "%03d" $(date +%s % 10000))
    local ticket_id="${prefix}-${seq}"

    cat > "${PROJECT_ROOT}/jira/tickets/${prefix,,}/${ticket_id}.md" << EOF
# ${type^} Ticket: ${ticket_id} - ${title}

**创建时间**: $(date -Iseconds)
**创建者**: OpenCLAW
**优先级**: P1
**状态**: ready
**Epic**: ${epic_id}
**分配给**: ${assignee_role:-unassigned}

## 描述

${title}
EOF

    log_success "Ticket 创建成功：${ticket_id}"
    echo "{\"ticket_id\": \"${ticket_id}\", \"status\": \"ready\", \"assigned_to\": \"${assignee_role:-null}\"}"
}

# 启动 Agent 实例
start_agent() {
    local role="$1"
    local mode="$2"

    log_info "启动 Agent: role=${role}, mode=${mode:-auto}"

    # 调用 EKET 启动脚本
    if [[ "$mode" == "auto" ]]; then
        bash "${SCRIPT_DIR}/eket-start.sh" -a -r "$role"
    else
        bash "${SCRIPT_DIR}/eket-start.sh" -r "$role"
    fi

    local agent_id="agent_${role}_$(date +%s)"
    log_success "Agent 启动成功：${agent_id}"
    echo "{\"agent_id\": \"${agent_id}\", \"status\": \"starting\"}"
}

# 获取 Agent 状态
get_agent_status() {
    local agent_id="$1"

    log_info "查询 Agent 状态：${agent_id}"

    # TODO: 查询实际状态
    echo "{\"agent_id\": \"${agent_id}\", \"status\": \"online\", \"last_heartbeat\": \"$(date -Iseconds)\"}"
}

# 主函数
main() {
    local command="$1"
    shift

    case "$command" in
        create-epic)
            create_epic "$@"
            ;;
        create-ticket)
            create_ticket "$@"
            ;;
        start-agent)
            start_agent "$@"
            ;;
        get-agent-status)
            get_agent_status "$@"
            ;;
        *)
            echo "Usage: $0 {create-epic|create-ticket|start-agent|get-agent-status}"
            exit 1
            ;;
    esac
}

# 如果没有参数，显示帮助
if [[ $# -eq 0 ]]; then
    echo "OpenCLAW 命令执行器"
    echo ""
    echo "用法：$0 <command> [args...]"
    echo ""
    echo "可用命令:"
    echo "  create-epic <name> <description> <priority> <deadline>"
    echo "  create-ticket <epic_id> <type> <title> <assignee_role>"
    echo "  start-agent <role> <mode>"
    echo "  get-agent-status <agent_id>"
    exit 0
fi

main "$@"
