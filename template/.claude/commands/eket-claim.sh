#!/bin/bash
# /eket-claim - 领取任务 (v0.5 - 集成时间追踪和权限控制)

echo "========================================"
echo "EKET 任务领取 v0.5"
echo "========================================"
echo ""

TASK_ID="${1:-}"
SLAVER_NAME="${2:-agent-$(hostname)}"

if [ -z "$TASK_ID" ]; then
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
    STATUS=$(grep -E "^status:" "$TASK_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ')
    if [ "$STATUS" = "in_progress" ]; then
        echo "⚠ 任务已被领取，当前状态：in_progress"
        exit 1
    fi

    if [ "$STATUS" != "ready" ] && [ "$STATUS" != "backlog" ]; then
        echo "⚠ 任务状态不适合领取：$STATUS"
        echo "   只有 status: ready 或 backlog 的任务可以被领取"
        exit 1
    fi

    # 更新任务状态
    if grep -q "^status:" "$TASK_FILE" 2>/dev/null; then
        sed -i '' "s/^status:.*/status: in_progress/" "$TASK_FILE" 2>/dev/null || \
        sed -i "s/^status:.*/status: in_progress/" "$TASK_FILE"
    else
        echo "status: in_progress" >> "$TASK_FILE"
    fi

    # 添加领取信息
    echo "assigned_to: agent-$(date +%Y%m%d%H%M%S)" >> "$TASK_FILE"
    echo "claimed_at: $(date -Iseconds)" >> "$TASK_FILE"
    echo "slaver: $SLAVER_NAME" >> "$TASK_FILE"

    echo "✓ 已领取任务：$TASK_ID"
    echo "  状态已更新为：in_progress"
    echo "  负责人：$SLAVER_NAME"
    echo "  任务文件：$TASK_FILE"
    echo ""

    # ==========================================
    # v0.5 新增：启动任务计时器
    # ==========================================
    echo -e "${BLUE}## v0.5: 启动任务计时器${NC}"
    echo ""

    ESTIMATED_MINUTES=$(grep -E "^预估时间:" "$TASK_FILE" 2>/dev/null | cut -d: -f2 | tr -d ' ' || echo "120")
    if [ "$ESTIMATED_MINUTES" = "null" ] || [ -z "$ESTIMATED_MINUTES" ]; then
        ESTIMATED_MINUTES=120
    fi

    if [ -x "../../scripts/task-time-tracker.sh" ]; then
        echo "启动任务计时器..."
        ../../scripts/task-time-tracker.sh start "$TASK_ID" "$SLAVER_NAME" "$ESTIMATED_MINUTES" || true
    else
        echo "提示：任务计时器脚本未找到，手动记录时间信息"
        echo "开始时间：$(date -Iseconds)" >> "$TASK_FILE"
        echo "预估时长：$ESTIMATED_MINUTES 分钟" >> "$TASK_FILE"
    fi

    echo ""

    # ==========================================
    # v0.5 新增：Slaver 权限检查
    # ==========================================
    echo -e "${BLUE}## v0.5: Slaver 权限配置${NC}"
    echo ""

    if [ -x "../../scripts/slaver-permissions.sh" ]; then
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
    echo -e "${BLUE}## v0.5: 创建 Task Start Checkpoint${NC}"
    echo ""

    if [ -x "../../scripts/checkpoint-sprint-retro.sh" ]; then
        ../../scripts/checkpoint-sprint-retro.sh checkpoint task_start "$TASK_ID" "$SLAVER_NAME" || true
    fi

    echo ""

    # 加载 Agent Profile 和 Skills
    if [ -x "../../scripts/load-agent-profile.sh" ]; then
        echo "加载 Agent Profile 和 Skills..."
        echo ""
        ../../scripts/load-agent-profile.sh "$TASK_ID"
    else
        echo "提示：运行 ../../scripts/load-agent-profile.sh $TASK_ID 加载 Agent Profile"
    fi
fi

echo "========================================"
