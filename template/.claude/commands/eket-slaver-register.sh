#!/bin/bash
# Slaver 身份注册和任务识别脚本
# 版本：v2.1.4
# 用途：Slaver 初始化后注册身份、识别任务、打印身份信息

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

# 获取实例信息
INSTANCE_ID=$(get_my_instance_id)
INSTANCE_ROLE=$(get_my_role)
INSTANCE_SPECIALTY=$(get_my_specialty)

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}## $1${NC}"
}

# 检查角色
if [ "$INSTANCE_ROLE" != "slaver" ]; then
    log_error "当前实例不是 Slaver 角色"
    echo "当前角色：$INSTANCE_ROLE"
    echo "实例 ID: $INSTANCE_ID"
    echo "$0 仅 Slaver 实例可用"
    exit 1
fi

echo ""
echo "========================================"
echo "Slaver 身份注册 v2.1.4"
echo "========================================"
echo ""

# ==========================================
# 步骤 1: 注册 Slaver 身份
# ==========================================
log_step "步骤 1: 注册 Slaver 身份"
echo ""

mkdir -p ".eket/state/slavers"

SLAVER_MARKER_FILE=".eket/state/slavers/${INSTANCE_ID}.yml"

# 检查是否已有注册文件
if [ -f "$SLAVER_MARKER_FILE" ]; then
    log_info "Slaver 身份已注册"
    log_info "读取注册信息..."
    echo ""
else
    log_info "创建 Slaver 身份注册文件..."
fi

# 写入/更新注册信息
cat > "$SLAVER_MARKER_FILE" <<EOF
# Slaver 实例注册信息
# 更新于：$(date -Iseconds)

instance_id: ${INSTANCE_ID}
role: slaver
specialty: ${INSTANCE_SPECIALTY:-none}
status: active
registered_at: $(date -Iseconds)
last_heartbeat: $(date -Iseconds)

# 工作空间
worktree_dir: null
current_task: null

# 能力标签
skills: []
EOF

log_info "Slaver 身份已注册到：$SLAVER_MARKER_FILE"
echo ""

# ==========================================
# 步骤 2: 识别可领取的任务
# ==========================================
log_step "步骤 2: 识别可领取的任务"
echo ""

JIRA_DIR="jira/tickets"

if [ ! -d "$JIRA_DIR" ]; then
    log_warn "Jira 目录不存在，等待 Master 创建任务"
    READY_TASKS=()
else
    # 收集所有 ready 状态的任务
    READY_TASKS=()

    for dir in feature bugfix task fix; do
        if [ -d "$JIRA_DIR/$dir" ]; then
            for ticket_file in "$JIRA_DIR/$dir"/*.md; do
                if [ -f "$ticket_file" ]; then
                    status=$(grep -m1 "^状态:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
                    if [ "$status" = "ready" ]; then
                        ticket_id=$(basename "$ticket_file" .md)
                        priority=$(grep -m1 "^优先级:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "P3")
                        role=$(grep -m1 "^适配角色:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
                        READY_TASKS+=("$ticket_id|$priority|$role|$ticket_file")
                    fi
                fi
            done
        fi
    done
fi

if [ ${#READY_TASKS[@]} -eq 0 ]; then
    log_info "当前无 ready 状态的任务"
    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  等待 Master 创建新任务...                                    │"
    echo "│                                                              │"
    echo "│  提示：                                                      │"
    echo "│  - 检查 inbox/human_input.md 是否有新需求                    │"
    echo "│  - 联系 Master 创建任务                                       │"
    echo "└──────────────────────────────────────────────────────────────┘"
else
    log_info "发现 ${#READY_TASKS[@]} 个 ready 状态的任务"
    echo ""

    # 按优先级排序（P0 > P1 > P2 > P3）
    IFS=$'\n' SORTED_TASKS=($(for task in "${READY_TASKS[@]}"; do
        priority=$(echo "$task" | cut -d'|' -f2)
        case $priority in
            P0) echo "1|$task" ;;
            P1) echo "2|$task" ;;
            P2) echo "3|$task" ;;
            P3) echo "4|$task" ;;
            *) echo "5|$task" ;;
        esac
    done | sort -t'|' -k1 -n | cut -d'|' -f2-))
    unset IFS

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  可领取任务列表（按优先级排序）                              │"
    echo "├──────────────────────────────────────────────────────────────┤"

    for task in "${SORTED_TASKS[@]}"; do
        ticket_id=$(echo "$task" | cut -d'|' -f1)
        priority=$(echo "$task" | cut -d'|' -f2)
        role=$(echo "$task" | cut -d'|' -f3)

        # 角色匹配检查
        match="○"
        if [ -n "$INSTANCE_SPECIALTY" ] && [ -n "$role" ]; then
            if [[ "$role" == *"$INSTANCE_SPECIALTY"* ]] || [[ "$role" == "fullstack" ]]; then
                match="✓"
            fi
        elif [ -z "$role" ]; then
            match="✓"
        fi

        # 优先级显示
        case $priority in
            P0) prio_display="P0 (紧急)" ;;
            P1) prio_display="P1 (高)" ;;
            P2) prio_display="P2 (中)" ;;
            P3) prio_display="P3 (低)" ;;
            *) prio_display="$priority" ;;
        esac

        echo "│  ${match} ${CYAN}$ticket_id${NC}"
        echo "│     优先级：$prio_display | 适配角色：$role"
        echo "│"
    done

    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""

    # 推荐任务（优先级最高且角色匹配的）
    for task in "${SORTED_TASKS[@]}"; do
        ticket_id=$(echo "$task" | cut -d'|' -f1)
        role=$(echo "$task" | cut -d'|' -f3)

        if [ -n "$INSTANCE_SPECIALTY" ]; then
            if [[ "$role" == *"$INSTANCE_SPECIALTY"* ]] || [[ "$role" == "fullstack" ]]; then
                log_info "推荐领取：$ticket_id (角色匹配)"
                break
            fi
        else
            log_info "推荐领取：$ticket_id (优先级最高)"
            break
        fi
    done
    echo ""

    echo "领取命令：/eket-claim <ticket-id>"
    echo ""
fi

# ==========================================
# 步骤 3: 检查自己的任务状态
# ==========================================
log_step "步骤 3: 检查自己的任务状态"
echo ""

CURRENT_TASK_FILE=".eket/state/current_task.yml"
CURRENT_TASK_ID=""
CURRENT_TASK_STATUS="idle"

if [ -f "$CURRENT_TASK_FILE" ]; then
    CURRENT_TASK_ID=$(grep "^task_id:" "$CURRENT_TASK_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

    if [ -n "$CURRENT_TASK_ID" ]; then
        # 查找任务文件
        for dir in feature bugfix task fix; do
            ticket_file="$JIRA_DIR/$dir/$CURRENT_TASK_ID.md"
            if [ -f "$ticket_file" ]; then
                status=$(grep -m1 "^状态:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
                assignee=$(grep -m1 "^分配给:|^负责人:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

                if [[ "$assignee" == *"$INSTANCE_ID"* ]]; then
                    CURRENT_TASK_STATUS="$status"
                    break
                fi
            fi
        done

        case $CURRENT_TASK_STATUS in
            in_progress)
                log_info "当前任务：$CURRENT_TASK_STATUS"
                echo ""
                echo "┌──────────────────────────────────────────────────────────────┐"
                echo "│  任务：${CYAN}$CURRENT_TASK_ID${NC}"
                echo "│  状态：${GREEN}进行中${NC}"
                echo "│                                                              │"
                echo "│  下一步：                                                    │"
                echo "│  - 继续开发工作                                              │"
                echo "│  - 完成后运行 /eket-submit-pr 提交 PR                        │"
                echo "└──────────────────────────────────────────────────────────────┘"
                ;;
            review)
                log_info "当前任务：$CURRENT_TASK_STATUS"
                echo ""
                echo "┌──────────────────────────────────────────────────────────────┐"
                echo "│  任务：${CYAN}$CURRENT_TASK_ID${NC}"
                echo "│  状态：${YELLOW}等待 Review${NC}"
                echo "│                                                              │"
                echo "│  下一步：                                                    │"
                echo "│  - 等待 Master 审核结果                                      │"
                echo "│  - 可领取其他 ready 任务                                      │"
                echo "└──────────────────────────────────────────────────────────────┘"
                ;;
            done)
                log_info "当前任务已完成"
                echo ""
                echo "┌──────────────────────────────────────────────────────────────┐"
                echo "│  任务：${CYAN}$CURRENT_TASK_ID${NC}"
                echo "│  状态：${GREEN}已完成${NC}"
                echo "│                                                              │"
                echo "│  下一步：                                                    │"
                echo "│  - 清理当前工作区                                            │"
                echo "│  - 领取新的任务                                              │"
                echo "└──────────────────────────────────────────────────────────────┘"

                # 清除当前任务状态
                CURRENT_TASK_ID=""
                CURRENT_TASK_STATUS="idle"
                ;;
            *)
                log_info "当前任务状态：$CURRENT_TASK_STATUS"
                ;;
        esac
    else
        log_info "当前无进行中的任务"
    fi
else
    log_info "当前无进行中的任务"
fi

if [ "$CURRENT_TASK_STATUS" = "idle" ] && [ ${#SORTED_TASKS[@]} -gt 0 ]; then
    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  状态：空闲                                                  │"
    echo "│                                                              │"
    echo "│  建议：                                                      │"
    echo "│  1. 从上方列表中选择一个任务                                 │"
    echo "│  2. 运行 /eket-claim <ticket-id> 领取任务                     │"
    echo "│  3. 开始开发工作                                              │"
    echo "└──────────────────────────────────────────────────────────────┘"
fi

echo ""

# ==========================================
# 步骤 4: 显示身份信息卡片
# ==========================================
log_step "步骤 4: 显示身份信息卡片"
echo ""

echo "┌──────────────────────────────────────────────────────────────┐"
echo "│                    Slaver 身份信息                            │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│                                                              │"
echo "│  实例 ID:    ${CYAN}$INSTANCE_ID${NC}"
echo "│  角色：${MAGENTA}Slaver (执行实例)${NC}"
echo "│  专长：${INSTANCE_SPECIALTY:-未设置}"
echo "│  状态：${GREEN}活跃${NC}"
echo "│                                                              │"
echo "│  职责：                                                      │"
echo "│  • 领取 Jira tickets 并执行                                  │"
echo "│  • 自主规划任务、开发、测试、迭代                            │"
echo "│  • 提交 PR 请求 Master 审核                                  │"
echo "│                                                              │"
echo "│  禁止操作：                                                  │"
echo "│  ❌ 合并代码到 main 分支                                      │"
echo "│  ❌ 审核自己的 PR                                            │"
echo "│  ❌ 领取超出能力范围的任务                                   │"
echo "│  ❌ 跳过测试直接提交                                         │"
echo "│                                                              │"
echo "│  当前任务：${CURRENT_TASK_ID:-无}"
echo "│  注册文件：$SLAVER_MARKER_FILE"
echo "│                                                              │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# ==========================================
# 步骤 5: 可用命令
# ==========================================
log_step "可用命令"
echo ""

echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  Slaver 可用命令                                              │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  /eket-status          查看当前状态和任务列表                │"
echo "│  /eket-claim <id>      领取任务                              │"
echo "│  /eket-submit-pr       提交 PR 请求审核                       │"
echo "│  /eket-slaver-poll     启动轮询（定期检查状态）              │"
echo "│  /eket-role <role>     设置专长角色                          │"
echo "│  /eket-help            显示帮助                              │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# ==========================================
# 完成
# ==========================================
echo "========================================"
echo "Slaver 身份注册完成"
echo "========================================"
echo ""

log_info "下一步建议："
if [ "$CURRENT_TASK_STATUS" = "idle" ] && [ ${#SORTED_TASKS[@]} -gt 0 ]; then
    echo "  1. 从上方列表中选择一个任务"
    echo "  2. 运行 /eket-claim <ticket-id> 领取任务"
    echo "  3. 开始开发工作"
elif [ "$CURRENT_TASK_STATUS" = "in_progress" ]; then
    echo "  - 继续当前的开发工作"
    echo "  - 完成后运行 /eket-submit-pr 提交 PR"
elif [ "$CURRENT_TASK_STATUS" = "review" ]; then
    echo "  - 等待 Master 审核结果"
    echo "  - 可考虑领取其他 ready 任务"
else
    echo "  - 等待 Master 创建新任务"
    echo "  - 或联系人类提供新需求"
fi
echo ""
