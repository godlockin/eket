#!/bin/bash
# /eket-check-progress - 检查 Slaver 任务进度

set -e

echo "========================================"
echo "EKET 进度检查 v0.5"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查实例角色
CONFIG_FILE=".eket/state/instance_config.yml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}✗${NC} 实例配置文件不存在"
    echo "请先运行 /eket-start 初始化实例"
    exit 1
fi

INSTANCE_ROLE=$(grep "^role:" "$CONFIG_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' "' || echo "null")

if [ "$INSTANCE_ROLE" != "master" ]; then
    echo -e "${RED}✗${NC} 当前实例不是 Master 角色"
    echo "当前角色：$INSTANCE_ROLE"
    echo "/eket-check-progress 仅 Master 实例可用"
    exit 1
fi

echo -e "${GREEN}✓${NC} Master 实例已确认"
echo ""

# 检查参数
TICKET_ID=""
ALL=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -t|--ticket) TICKET_ID="$2"; shift ;;
        -a|--all) ALL=true ;;
        -h|--help)
            echo "用法：/eket-check-progress [-t <ticket-id>] [-a]"
            echo ""
            echo "选项:"
            echo "  -t, --ticket    Ticket ID (如：FEAT-001)"
            echo "  -a, --all       检查所有进行中的任务"
            echo "  -h, --help      显示帮助"
            echo ""
            exit 0
            ;;
        *) echo "未知参数：$1"; exit 1 ;;
    esac
    shift
done

echo -e "${BLUE}## 步骤 1: 读取 Jira 任务状态${NC}"
echo ""

JIRA_DIR="jira/tickets"

if [ ! -d "$JIRA_DIR" ]; then
    echo -e "${YELLOW}⚠${NC} Jira 目录不存在"
    exit 0
fi

# 查找进行中的任务
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  进行中的任务                                                 │"
echo "├──────────────────────────────────────────────────────────────┤"

IN_PROGRESS_COUNT=0

# 搜索所有子目录
for ticket_file in $(find "$JIRA_DIR" -name "*.md" -type f 2>/dev/null); do
    STATUS=$(grep -m1 "^状态:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

    # 检查是否是进行中的状态
    if [[ "$STATUS" == "in_progress" || "$STATUS" == "dev" || "$STATUS" == "test" || "$STATUS" == "review" ]]; then
        TICKET_NAME=$(basename "$ticket_file" .md)
        PRIORITY=$(grep -m1 "^优先级:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
        ASSIGNEE=$(grep -m1 "^分配给:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unassigned")

        # 如果指定了 Ticket ID，只匹配该 ID
        if [ -n "$TICKET_ID" ]; then
            if [[ "$TICKET_NAME" == *"$TICKET_ID"* ]]; then
                echo "│  ${CYAN}$TICKET_NAME${NC}"
                echo "│    状态：$STATUS | 优先级：$PRIORITY | 分配给：$ASSIGNEE"
                IN_PROGRESS_COUNT=$((IN_PROGRESS_COUNT + 1))
            fi
        elif [ "$ALL" = true ]; then
            echo "│  ${CYAN}$TICKET_NAME${NC}"
            echo "│    状态：$STATUS | 优先级：$PRIORITY | 分配给：$ASSIGNEE"
            IN_PROGRESS_COUNT=$((IN_PROGRESS_COUNT + 1))
        else
            # 默认只显示摘要
            IN_PROGRESS_COUNT=$((IN_PROGRESS_COUNT + 1))
        fi
    fi
done

if [ "$IN_PROGRESS_COUNT" -eq 0 ]; then
    echo "│  暂无进行中的任务                                            │"
else
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  共计：$IN_PROGRESS_COUNT 个进行中的任务                              │"
fi

echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 检查消息队列
echo -e "${BLUE}## 步骤 2: 检查消息队列${NC}"
echo ""

MESSAGE_DIR="shared/message_queue/inbox"

if [ -d "$MESSAGE_DIR" ]; then
    MSG_COUNT=$(find "$MESSAGE_DIR" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')

    if [ "$MSG_COUNT" -gt 0 ]; then
        echo "发现 $MSG_COUNT 条未读消息:"
        echo ""

        for msg_file in "$MESSAGE_DIR"/*.json; do
            if [ -f "$msg_file" ]; then
                MSG_TYPE=$(grep -m1 '"type"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
                MSG_FROM=$(grep -m1 '"from"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
                MSG_TIME=$(grep -m1 '"timestamp"' "$msg_file" 2>/dev/null | cut -d'"' -f4 || echo "unknown")

                echo "  ${CYAN}$(basename "$msg_file")${NC}"
                echo "    类型：$MSG_TYPE | 来自：$MSG_FROM | 时间：$MSG_TIME"
            fi
        done
    else
        echo "消息队列为空"
    fi
else
    echo "消息队列目录不存在：$MESSAGE_DIR"
fi

echo ""

# 检查活动任务状态文件
echo -e "${BLUE}## 步骤 3: 检查活动任务状态${NC}"
echo ""

STATE_FILE="jira/state/active_tasks.json"

if [ -f "$STATE_FILE" ]; then
    echo "活动任务状态文件：$STATE_FILE"
    echo ""

    # 使用 python 或 jq 格式化 JSON（如果可用）
    if command -v jq >/dev/null 2>&1; then
        jq '.' "$STATE_FILE" 2>/dev/null || cat "$STATE_FILE"
    elif command -v python3 >/dev/null 2>&1; then
        python3 -m json.tool "$STATE_FILE" 2>/dev/null || cat "$STATE_FILE"
    else
        cat "$STATE_FILE"
    fi
else
    echo "活动任务状态文件不存在"
fi

echo ""

# 生成进度报告
echo -e "${BLUE}## 步骤 4: 生成进度报告${NC}"
echo ""

REPORT_DIR="inbox/human_feedback"
mkdir -p "$REPORT_DIR"

REPORT_FILE="$REPORT_DIR/progress_report_$(date +%Y%m%d_%H%M%S).md"

cat > "$REPORT_FILE" << EOF
# 任务进度报告

**生成时间**: $(date -Iseconds)
**生成者**: Master Agent

---

## 概览

- 进行中的任务：$IN_PROGRESS_COUNT 个

## 进行中的任务详情

EOF

# 添加任务详情
for ticket_file in $(find "$JIRA_DIR" -name "*.md" -type f 2>/dev/null); do
    STATUS=$(grep -m1 "^状态:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

    if [[ "$STATUS" == "in_progress" || "$STATUS" == "dev" || "$STATUS" == "test" || "$STATUS" == "review" ]]; then
        TICKET_NAME=$(basename "$ticket_file" .md)
        PRIORITY=$(grep -m1 "^优先级:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")

        echo "### $TICKET_NAME" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "- 状态：$STATUS" >> "$REPORT_FILE"
        echo "- 优先级：$PRIORITY" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
done

cat >> "$REPORT_FILE" << EOF

## 下一步建议

EOF

if [ "$IN_PROGRESS_COUNT" -eq 0 ]; then
    echo "- 无进行中的任务，可以领取新任务或创建新 Epic" >> "$REPORT_FILE"
else
    echo "- 继续跟进进行中的任务" >> "$REPORT_FILE"
    echo "- 检查是否有任务阻塞需要协助" >> "$REPORT_FILE"
fi

echo -e "${GREEN}✓${NC} 进度报告已生成：$REPORT_FILE"
echo ""

# 总结
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  进度检查完成                                                │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  进行中的任务：$IN_PROGRESS_COUNT 个"
echo "│  报告文件：$(basename "$REPORT_FILE")"
echo "│                                                              │"
if [ "$IN_PROGRESS_COUNT" -gt 0 ]; then
    echo "│  建议：检查是否有任务需要协助或存在阻塞                      │"
else
    echo "│  建议：创建新 Epic 或领取新任务                               │"
fi
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

echo "========================================"
echo "进度检查完成"
echo "========================================"
