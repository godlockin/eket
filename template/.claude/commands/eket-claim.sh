#!/bin/bash
# /eket-claim - 领取任务 (v2.1.0 - 集成 instance_id 追踪和时间追踪)

# 路径配置 (v0.5.2)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 任务领取 v2.1.0"
echo "========================================"
echo ""

TASK_ID="${1:-}"

# 读取当前实例配置
INSTANCE_CONFIG=".eket/state/instance_config.yml"
if [ ! -f "$INSTANCE_CONFIG" ]; then
    echo "错误：实例配置文件不存在，请先运行 /eket-start"
    exit 1
fi

INSTANCE_ROLE=$(grep "^role:" "$INSTANCE_CONFIG" 2>/dev/null | sed 's/role:\s*//' | tr -d '"' || echo "")
INSTANCE_ID=$(grep "^instance_id:" "$INSTANCE_CONFIG" 2>/dev/null | sed 's/instance_id:\s*//' | tr -d '"' || echo "")
AGENT_TYPE=$(grep "^agent_type:" "$INSTANCE_CONFIG" 2>/dev/null | sed 's/agent_type:\s*//' | tr -d '"' || echo "")

if [ "$INSTANCE_ROLE" != "slaver" ]; then
    echo "错误：当前实例角色为 $INSTANCE_ROLE，只有 Slaver 可以领取任务"
    exit 1
fi

if [ -z "$INSTANCE_ID" ]; then
    echo "错误：实例 ID 不存在，请重新启动实例"
    exit 1
fi

echo -e "当前实例：$INSTANCE_ID"
echo -e "角色类型：$AGENT_TYPE"
echo ""
    echo "用法：/eket-claim [task-id]"
    echo ""
    echo "可领取的任务 (status: ready/backlog):"

    # 检查 Jira 目录
    if [ -d "jira/tickets" ]; then
        for dir in feature task bugfix; do
            if [ -d "jira/tickets/$dir" ]; then
                for task_file in "jira/tickets/$dir"/*.md; do
                    if [ -f "$task_file" ]; then
                        status=$(grep -E "^status:" "$task_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
                        if [ "$status" = "ready" ] || [ "$status" = "backlog" ]; then
                            title=$(grep -E "^title:|^# " "$task_file" | head -1 | cut -d: -f2-)
                            priority=$(grep -E "^priority:" "$task_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
                            echo "  - $(basename "$task_file" .md): $title (priority: ${priority:-normal})"
                        fi
                    fi
                done
            fi
        done
    # 回退到本地 tasks 目录
    elif [ -d "tasks" ] && [ "$(ls -A tasks 2>/dev/null)" ]; then
        for task_file in tasks/*.md; do
            if [ -f "$task_file" ]; then
                status=$(grep -E "^status:" "$task_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
                if [ "$status" = "ready" ] || [ "$status" = "backlog" ]; then
                    title=$(grep -E "^title:|^# " "$task_file" | head -1 | cut -d: -f2-)
                    echo "  - $(basename "$task_file" .md): $title"
                fi
            fi
        done
    else
        echo "  暂无任务"
    fi
    echo ""
else
    # 查找任务文件 (Jira 优先)
    TASK_FILE=""
    if [ -d "jira/tickets" ]; then
        for dir in feature task bugfix; do
            if [ -f "jira/tickets/$dir/${TASK_ID}.md" ]; then
                TASK_FILE="jira/tickets/$dir/${TASK_ID}.md"
                break
            fi
        done
    fi

    # 回退到本地 tasks 目录
    if [ -z "$TASK_FILE" ] && [ -f "tasks/${TASK_ID}.md" ]; then
        TASK_FILE="tasks/${TASK_ID}.md"
    fi

    if [ -z "$TASK_FILE" ]; then
        echo "✗ 任务不存在：$TASK_ID"
        exit 1
    fi

    # 检查依赖任务 (新增依赖验证)
    DEPENDENCIES=$(grep -E "^dependencies:" "$TASK_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ')
    if [ -n "$DEPENDENCIES" ] && [ "$DEPENDENCIES" != "none" ]; then
        echo "检查依赖任务..."
        for dep in $(echo "$DEPENDENCIES" | tr ',' ' '); do
            dep_file=""
            # 在 Jira 目录中查找依赖任务
            if [ -d "jira/tickets" ]; then
                for d in feature task bugfix; do
                    if [ -f "jira/tickets/$d/${dep}.md" ]; then
                        dep_file="jira/tickets/$d/${dep}.md"
                        break
                    fi
                done
            fi
            # 回退到 tasks 目录
            if [ -z "$dep_file" ] && [ -f "tasks/${dep}.md" ]; then
                dep_file="tasks/${dep}.md"
            fi

            if [ -z "$dep_file" ]; then
                echo "✗ 依赖任务不存在：$dep"
                exit 1
            fi

            dep_status=$(grep -E "^status:" "$dep_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
            if [ "$dep_status" != "done" ]; then
                echo "✗ 依赖任务 $dep 未完成 (当前状态：$dep_status)"
                echo "   无法领取任务，请先完成依赖任务或联系 Master 协调"
                exit 1
            fi
            echo "  ✓ 依赖任务 $dep: $dep_status"
        done
    fi

    # 检查任务状态
    STATUS=$(grep -E "^\*\*状态\*\*:" "$TASK_FILE" 2>/dev/null | sed 's/\*\*状态\*\*:\s*//' || \
             grep -E "^status:" "$TASK_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ')
    if [ "$STATUS" = "in_progress" ]; then
        echo "⚠ 任务已被领取，当前状态：in_progress"
        exit 1
    fi

    if [ "$STATUS" != "ready" ] && [ "$STATUS" != "backlog" ] && [ "$STATUS" != "analysis" ]; then
        echo "⚠ 任务状态不适合领取：$STATUS"
        echo "   只有 status: ready/backlog/analysis 的任务可以被领取"
        exit 1
    fi

    TIMESTAMP=$(date -Iseconds)

    # 更新任务状态为 in_progress
    if grep -q "^\*\*状态\*\*:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^\*\*状态\*\*:.*/\*\*状态\*\*: in_progress/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^\*\*状态\*\*:.*/\*\*状态\*\*: in_progress/" "$TASK_FILE"
    elif grep -q "^status:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^status:.*/status: in_progress/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^status:.*/status: in_progress/" "$TASK_FILE"
    else
        echo "**状态**: in_progress" >> "$TASK_FILE"
    fi
    echo "✓ 状态已更新：$STATUS → in_progress"

    # 更新负责人为 instance_id
    if grep -q "^\*\*负责人\*\*:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^\*\*负责人\*\*:.*/\*\*负责人\*\*: $INSTANCE_ID/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^\*\*负责人\*\*:.*/\*\*负责人\*\*: $INSTANCE_ID/" "$TASK_FILE"
    elif grep -q "^assigned_to:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^assigned_to:.*/assigned_to: $INSTANCE_ID/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^assigned_to:.*/assigned_to: $INSTANCE_ID/" "$TASK_FILE"
    else
        echo "**负责人**: $INSTANCE_ID" >> "$TASK_FILE"
    fi
    echo "✓ 负责人已设置：$INSTANCE_ID"

    # 更新执行 Agent
    if grep -q "^\*\*执行 Agent\*\*:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^\*\*执行 Agent\*\*:.*/\*\*执行 Agent\*\*: $INSTANCE_ID/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^\*\*执行 Agent\*\*:.*/\*\*执行 Agent\*\*: $INSTANCE_ID/" "$TASK_FILE"
    else
        echo "**执行 Agent**: $INSTANCE_ID" >> "$TASK_FILE"
    fi
    echo "✓ 执行 Agent 已设置：$INSTANCE_ID"

    # 更新最后更新时间
    if grep -q "^\*\*最后更新\*\*:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^\*\*最后更新\*\*:.*/\*\*最后更新\*\*: $TIMESTAMP/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^\*\*最后更新\*\*:.*/\*\*最后更新\*\*: $TIMESTAMP/" "$TASK_FILE"
    fi

    # 添加/更新领取记录
    if grep -q "## 领取记录" "$TASK_FILE"; then
        # 在领取记录表格中添加一行
        if grep -q "| 领取 |" "$TASK_FILE"; then
            # 删除旧的领取记录，添加新的
            sed -i '' "/^| 领取 |/d" "$TASK_FILE" 2>/dev/null || true
        fi
        sed -i '' "/^## 领取记录/a\\
\\
| 领取 | $INSTANCE_ID | $TIMESTAMP | ready → in_progress |" "$TASK_FILE" 2>/dev/null || \
        sed -i "/^## 领取记录/a\\
\\
| 领取 | $INSTANCE_ID | $TIMESTAMP | ready → in_progress |" "$TASK_FILE"
        echo "✓ 领取记录已更新"
    else
        # 在元信息区域后添加领取记录 section
        sed -i '' "/^---$/a\\
\\
## 领取记录\\
\\
| 操作 | Slaver Instance ID | 时间 | 状态变更 |\\
|------|-------------------|------|----------|\\
| 领取 | $INSTANCE_ID | $TIMESTAMP | ready → in_progress |\\
" "$TASK_FILE" 2>/dev/null || \
        sed -i "/^---$/a\\
\\
## 领取记录\\
\\
| 操作 | Slaver Instance ID | 时间 | 状态变更 |\\
|------|-------------------|------|----------|\\
| 领取 | $INSTANCE_ID | $TIMESTAMP | ready → in_progress |\\
" "$TASK_FILE"
        echo "✓ 领取记录已添加"
    fi

    # 更新时间追踪中的开始时间
    if grep -q "| 开始时间 |" "$TASK_FILE"; then
        sed -i '' "s/| 开始时间 | .*/| 开始时间 | $TIMESTAMP |/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/| 开始时间 | .*/| 开始时间 | $TIMESTAMP |/" "$TASK_FILE"
        echo "✓ 开始时间已更新"
    fi

    # 更新执行日志
    if grep -q "## 执行日志" "$TASK_FILE"; then
        sed -i '' "/^## 执行日志/a\\
\\
- [$TIMESTAMP] $INSTANCE_ID 领取任务，状态变更为 in_progress" "$TASK_FILE" 2>/dev/null || \
        sed -i "/^## 执行日志/a\\
\\
- [$TIMESTAMP] $INSTANCE_ID 领取任务，状态变更为 in_progress" "$TASK_FILE"
        echo "✓ 执行日志已更新"
    fi

    # 发送到消息队列（通知 Master 和其他 Slaver）
    MESSAGE_QUEUE_DIR="shared/message_queue/outbox"
    if [ -d "$MESSAGE_QUEUE_DIR" ]; then
        MESSAGE_FILE="$MESSAGE_QUEUE_DIR/task_claimed_${TASK_ID}_${INSTANCE_ID}.json"
        cat > "$MESSAGE_FILE" << EOF
{
  "id": "msg_$(date +%Y%m%d%H%M%S)",
  "timestamp": "$TIMESTAMP",
  "from": "$INSTANCE_ID",
  "to": "broadcast",
  "type": "task_claimed",
  "priority": "normal",
  "payload": {
    "ticket_id": "$TASK_ID",
    "claimed_by": "$INSTANCE_ID",
    "previous_status": "$STATUS",
    "new_status": "in_progress"
  }
}
EOF
        echo "✓ 消息已发送到消息队列"
    fi

    echo "✓ 已领取任务：$TASK_ID"
    echo "  状态已更新为：in_progress"
    echo "  负责人：$INSTANCE_ID"
    echo "  任务文件：$TASK_FILE"
    echo ""

    # ==========================================
    # v0.5 新增：启动任务计时器
    # ==========================================
    echo -e "${BLUE}## 启动任务计时器${NC}"
    echo ""

    ESTIMATED_MINUTES=$(grep -E "^\*\*预估时间\*\*:" "$TASK_FILE" 2>/dev/null | sed 's/\*\*预估时间\*\*:\s*//' || \
                        grep -E "^预估时间:" "$TASK_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ' || \
                        grep -E "^estimated_minutes:" "$TASK_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ' || \
                        echo "120")
    if [ "$ESTIMATED_MINUTES" = "null" ] || [ -z "$ESTIMATED_MINUTES" ]; then
        ESTIMATED_MINUTES=120
    fi

    if [ -x "$SCRIPTS_DIR/task-time-tracker.sh" ]; then
        echo "启动任务计时器..."
        "$SCRIPTS_DIR/task-time-tracker.sh" start "$TASK_ID" "$INSTANCE_ID" "$ESTIMATED_MINUTES" || true
    else
        echo "提示：任务计时器脚本未找到，手动记录时间信息"
    fi

    echo ""

    # ==========================================
    # v0.5 新增：Slaver 权限检查
    # ==========================================
    echo -e "${BLUE}## Slaver 权限配置${NC}"
    echo ""

    if [ -x "$SCRIPTS_DIR/slaver-permissions.sh" ]; then
        echo "Slaver 权限控制已加载"
        echo "  - 允许的操作：read_ticket, update_ticket_assigned_to_self, ..."
        echo "  - 需要确认的操作：write_architecture_doc, ..."
        echo "  - 禁止的操作：push_main, merge_any_branch, ..."
    else
        echo "提示：权限控制脚本未找到"
    fi

    echo ""

    # ==========================================
    # v0.5 新增：创建 Checkpoint
    # ==========================================
    echo -e "${BLUE}## 创建 Task Start Checkpoint${NC}"
    echo ""

    if [ -x "$SCRIPTS_DIR/checkpoint-sprint-retro.sh" ]; then
        "$SCRIPTS_DIR/checkpoint-sprint-retro.sh" checkpoint task_start "$TASK_ID" "$INSTANCE_ID" || true
    fi

    echo ""

    # ==========================================
    # 创建独立 Worktree (v2.1.0)
    # ==========================================
    echo -e "${BLUE}## 创建独立 Worktree${NC}"
    echo ""

    WORKTREE_NAME="${INSTANCE_ID}-${TASK_ID}"
    WORKTREE_DIR=".eket/worktrees/${WORKTREE_NAME}"

    # 检查是否已存在
    if [ -d "$WORKTREE_DIR" ]; then
        echo -e "${YELLOW}⚠${NC} Worktree 已存在：$WORKTREE_DIR"
        echo "   可能是重复领取或之前的 worktree 未清理"
    else
        mkdir -p "$WORKTREE_DIR"
        echo "创建工作tree: $WORKTREE_DIR"

        # 保存 worktree 路径到任务文件
        if grep -q "^\*\*分支\*\*:" "$TASK_FILE"; then
            sed -i '' "s/^\*\*分支\*\*:.*/\*\*分支\*\*: $WORKTREE_NAME/" "$TASK_FILE" 2>/dev/null || \
            sed -i "s/^\*\*分支\*\*:.*/\*\*分支\*\*: $WORKTREE_NAME/" "$TASK_FILE"
        else
            echo "**分支**: $WORKTREE_NAME" >> "$TASK_FILE"
        fi
        echo "✓ Worktree 已创建：$WORKTREE_NAME"
    fi

    echo ""

    # 加载 Agent Profile 和 Skills
    if [ -x "$SCRIPTS_DIR/load-agent-profile.sh" ]; then
        echo "加载 Agent Profile 和 Skills..."
        echo ""
        "$SCRIPTS_DIR/load-agent-profile.sh" "$TASK_ID"
    else
        echo "提示：运行 $SCRIPTS_DIR/load-agent-profile.sh $TASK_ID 加载 Agent Profile"
    fi

    echo ""
    echo "========================================"
    echo -e "${GREEN}✓ 领取成功!${NC}"
    echo "========================================"
    echo ""
    echo "下一步:"
    echo "  1. 读取 ticket 详情，理解需求"
    echo "  2. 创建任务分析报告：jira/tickets/*/$TASK_ID/analysis-report.md"
    echo "  3. 提交分析报告给 Master 审批"
    echo "  4. 审批通过后开始开发"
    echo ""
fi

echo "========================================"

