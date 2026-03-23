#!/bin/bash
# EKET Slaver 操作权限控制 v0.5
# 定义和执行 Slaver 的 allow/question/reject 权限

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 权限配置文件
PERMISSIONS_FILE=".eket/state/permissions.yml"
SLAVER_ROLE=".eket/state/slaver_role.yml"

# ==========================================
# 权限定义
# ==========================================

# Jira 操作权限
declare -A JIRA_ALLOW=(
    ["read_ticket"]=1
    ["update_ticket_assigned_to_self"]=1
    ["change_status_self_assigned"]=1
)

declare -A JIRA_QUESTION=(
    ["update_ticket_not_assigned"]=1
    ["reassign_ticket"]=1
)

declare -A JIRA_REJECT=(
    ["delete_ticket"]=1
    ["change_other_assignment"]=1
)

# Confluence 操作权限
declare -A CONFLUENCE_ALLOW=(
    ["read"]=1
    ["sync"]=1
    ["write_role_specific"]=1
)

declare -A CONFLUENCE_QUESTION=(
    ["write_architecture_doc"]=1
    ["write_requirement_doc"]=1
    ["delete_doc"]=1
)

declare -A CONFLUENCE_REJECT=(
    ["delete_category"]=1
    ["modify_master_doc"]=1
)

# Code Repo 操作权限
declare -A CODE_REPO_ALLOW=(
    ["worktree_create"]=1
    ["feature_branch_create"]=1
    ["feature_branch_commit"]=1
    ["create_pr"]=1
    ["read_code"]=1
    ["write_feature_code"]=1
    ["write_test_code"]=1
)

declare -A CODE_REPO_QUESTION=(
    ["write_core_module"]=1
    ["refactor_existing_code"]=1
    ["delete_code"]=1
)

declare -A CODE_REPO_REJECT=(
    ["merge_any_branch"]=1
    ["push_main"]=1
    ["push_testing"]=1
    ["modify_config_without_review"]=1
)

# Git 操作权限
declare -A GIT_ALLOW=(
    ["checkout_feature"]=1
    ["create_pr"]=1
    ["push_feature"]=1
)

declare -A GIT_QUESTION=(
    ["checkout_testing"]=1
    ["force_push_feature"]=1
)

declare -A GIT_REJECT=(
    ["checkout_main"]=1
    ["push_main"]=1
    ["push_testing"]=1
    ["delete_branch"]=1
)

# ==========================================
# 权限检查函数
# ==========================================

check_permission() {
    local category="$1"  # jira / confluence / code_repo / git
    local action="$2"
    local slaver_name="$3"
    local ticket_id="$4"

    echo -e "${BLUE}## 检查权限：${category}.${action}${NC}"

    # 读取允许列表
    local -n allow_list="${category^^}_ALLOW"
    local -n question_list="${category^^}_QUESTION"
    local -n reject_list="${category^^}_REJECT"

    if [[ -v "allow_list[$action]" ]]; then
        echo -e "${GREEN}✓${NC} 允许执行：${category}.${action}"
        return 0

    elif [[ -v "question_list[$action]" ]]; then
        echo -e "${YELLOW}?${NC} 需要确认：${category}.${action}"
        echo ""
        echo "操作详情:"
        echo "  - Slaver: $slaver_name"
        echo "  - Ticket: $ticket_id"
        echo "  - 操作：${category}.${action}"
        echo ""
        echo "请人类确认是否允许此操作 [y/N]:"
        read -r RESPONSE
        if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}✓${NC} 人类确认允许执行"
            log_permission_granted "$category" "$action" "$slaver_name" "$ticket_id"
            return 0
        else
            echo -e "${RED}✗${NC} 人类拒绝执行"
            log_permission_denied "$category" "$action" "$slaver_name" "$ticket_id"
            return 1
        fi

    elif [[ -v "reject_list[$action]" ]]; then
        echo -e "${RED}✗${NC} 禁止执行：${category}.${action}"
        echo ""
        echo "Slaver $slaver_name 尝试执行被禁止的操作:"
        echo "  - 操作：${category}.${action}"
        echo "  - Ticket: $ticket_id"
        echo ""
        echo "此操作已被记录，如需执行请联系 Master 或人类"
        log_permission_violation "$category" "$action" "$slaver_name" "$ticket_id"
        return 1

    else
        echo -e "${YELLOW}⚠${NC} 未知操作：${category}.${action}"
        echo "默认拒绝，需要 Master 确认"
        return 1
    fi
}

# ==========================================
# 日志记录
# ==========================================

log_permission_granted() {
    local category="$1"
    local action="$2"
    local slaver="$3"
    local ticket="$4"
    local log_file=".eket/logs/permission-allowed.log"

    mkdir -p ".eket/logs"
    echo "[$(date -Iseconds)] ALLOWED: $category.$action by $slaver (ticket: $ticket)" >> "$log_file"
}

log_permission_denied() {
    local category="$1"
    local action="$2"
    local slaver="$3"
    local ticket="$4"
    local log_file=".eket/logs/permission-denied.log"

    mkdir -p ".eket/logs"
    echo "[$(date -Iseconds)] DENIED: $category.$action by $slaver (ticket: $ticket)" >> "$log_file"
}

log_permission_violation() {
    local category="$1"
    local action="$2"
    local slaver="$3"
    local ticket="$4"
    local log_file=".eket/logs/permission-violation.log"

    mkdir -p ".eket/logs"

    # 记录违规
    echo "[$(date -Iseconds)] VIOLATION: $category.$action by $slaver (ticket: $ticket)" >> "$log_file"

    # 创建警报
    local alert_file="inbox/human_feedback/permission-violation-$(date +%Y%m%d-%H%M%S).md"
    cat > "$alert_file" << EOF
# 权限违规警报

**时间**: $(date -Iseconds)
**Slaver**: $slaver
**Ticket**: $ticket
**违规操作**: ${category}.${action}

**说明**:
Slaver 尝试执行被明确禁止的操作。此事件已记录。

**建议行动**:
1. 检查 Slaver 是否配置错误
2. 评估是否需要调整权限
3. 如有必要，对 Slaver 进行重新配置
EOF

    echo "已创建违规警报：$alert_file"
}

# ==========================================
# 工作区隔离检查
# ==========================================

check_workspace_isolation() {
    local slaver_name="$1"
    local ticket_id="$2"
    local action="$3"

    # 检查分支命名
    if [[ "$action" == *"branch"* ]]; then
        local current_branch=$(git branch --show-current)
        local expected_prefix="${slaver_name}-${ticket_id}"

        if [[ ! "$current_branch" == "$expected_prefix"* ]]; then
            echo -e "${RED}✗${NC} 分支命名不符合规范"
            echo "  - 当前分支：$current_branch"
            echo "  - 期望前缀：$expected_prefix"
            return 1
        fi
    fi

    # 检查 worktree 路径
    if [[ "$action" == *"worktree"* ]]; then
        local worktree_path=$(pwd)
        local expected_worktree=".eket/worktrees/${slaver_name}-${ticket_id}"

        if [[ ! "$worktree_path" == *"$expected_worktree"* ]]; then
            echo -e "${YELLOW}⚠${NC} Worktree 路径可能不正确"
            echo "  - 当前路径：$worktree_path"
            echo "  - 期望包含：$expected_worktree"
        fi
    fi

    return 0
}

# ==========================================
# 入口
# ==========================================

# 命令行用法
if [ "$#" -lt 3 ]; then
    echo "用法：$0 <category> <action> <slaver_name> [ticket_id]"
    echo ""
    echo "category: jira | confluence | code_repo | git"
    echo "action: 操作名称"
    echo "slaver_name: Slaver 名称"
    echo "ticket_id: (可选) 任务 ID"
    exit 1
fi

CATEGORY="$1"
ACTION="$2"
SLAVER_NAME="$3"
TICKET_ID="${4:-unknown}"

check_permission "$CATEGORY" "$ACTION" "$SLAVER_NAME" "$TICKET_ID"
check_workspace_isolation "$SLAVER_NAME" "$TICKET_ID" "$ACTION"
