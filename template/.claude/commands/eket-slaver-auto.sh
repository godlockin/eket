#!/bin/bash
# scripts/eket-slaver-auto.sh - Slaver 自动执行脚本
# 自动获取 Jira tickets、按优先级排序、选择并处理任务

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================"
echo "Slaver 自动执行"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# 读取实例配置
INSTANCE_CONFIG="$PROJECT_ROOT/.eket/state/instance_config.yml"
if [ ! -f "$INSTANCE_CONFIG" ]; then
    echo -e "${RED}✗${NC} 错误：未找到实例配置文件 $INSTANCE_CONFIG"
    echo "请先运行项目初始化：./scripts/init-project.sh"
    exit 1
fi

# 解析配置
ROLE=$(grep "^role:" "$INSTANCE_CONFIG" | cut -d':' -f2 | tr -d ' "')
AGENT_TYPE=$(grep "^agent_type:" "$INSTANCE_CONFIG" | cut -d':' -f2 | tr -d ' "')
AUTO_MODE=$(grep "^auto_mode:" "$INSTANCE_CONFIG" | cut -d':' -f2 | tr -d ' ')

echo "实例配置:"
echo "  角色：$ROLE"
echo "  专家类型：$AGENT_TYPE"
echo "  自动模式：$AUTO_MODE"
echo ""

if [ "$ROLE" != "slaver" ]; then
    echo -e "${RED}✗${NC} 错误：当前实例不是 Slaver 模式"
    echo "当前角色：$ROLE"
    exit 1
fi

if [ "$AUTO_MODE" != "true" ]; then
    echo -e "${YELLOW}⚠${NC} 自动模式未启用，使用手动模式启动..."
    echo "如需启用自动模式，请编辑 $INSTANCE_CONFIG，设置 auto_mode: true"
    exit 1
fi

cd "$PROJECT_ROOT"

# ==========================================
# 优先级工具函数
# ==========================================

# 优先级权重（数字越小优先级越高）
get_priority_weight() {
    local priority="$1"
    case "$priority" in
        P0) echo 0 ;;
        P1) echo 1 ;;
        P2) echo 2 ;;
        P3) echo 3 ;;
        High|high) echo 1 ;;
        Medium|medium) echo 2 ;;
        Low|low) echo 3 ;;
        *) echo 4 ;;
    esac
}

# 优先级数字转 P0-P3 显示标签
get_priority_label() {
    local weight="$1"
    case "$weight" in
        0) echo "P0 (紧急)" ;;
        1) echo "P1 (高)" ;;
        2) echo "P2 (中)" ;;
        3) echo "P3 (低)" ;;
        *) echo "Unknown" ;;
    esac
}

# ==========================================
# 步骤 1: 获取 Jira tickets 并按优先级排序
# ==========================================
echo -e "${BLUE}## 步骤 1: 获取 Jira tickets 并排序${NC}"
echo ""

if [ ! -d "jira/tickets" ]; then
    echo -e "${RED}✗${NC} Jira tickets 目录不存在"
    exit 1
fi

# 查找所有 ready 状态的 tickets
echo "扫描 Jira tickets..."
TICKETS_DIR="jira/tickets"

# 创建临时文件存储 tickets 信息
TEMP_FILE=$(mktemp)

# 解析每个 ticket 文件，提取优先级和状态
find "$TICKETS_DIR" -name "*.md" -type f 2>/dev/null | while read -r ticket_file; do
    # 提取 ticket ID
    TICKET_ID=$(basename "$ticket_file" .md)

    # 提取状态
    STATUS=$(grep -E "^\*\*状态\*\*:|^状态\s*:" "$ticket_file" | head -1 | sed 's/.*: *//' | tr -d ' *')

    # 提取优先级
    PRIORITY=$(grep -E "^\*\*优先级\*\*:|^优先级\s*:" "$ticket_file" | head -1 | sed 's/.*: *//' | tr -d ' *')

    # 提取标签
    TAGS=$(grep -E "^\*\*标签\*\*:|^标签\s*:" "$ticket_file" | head -1 | sed 's/.*: *//')

    # 只处理 ready 状态的 tickets
    if [ "$STATUS" = "ready" ]; then
        # 使用统一的优先级权重函数 (P0=0, P1=1, P2=2, P3=3; 兼容 High/Medium/Low)
        PRIORITY_NUM=$(get_priority_weight "$PRIORITY")

        echo "$PRIORITY_NUM|$TICKET_ID|$ticket_file|$TAGS"
    fi
done > "$TEMP_FILE"

# 按优先级排序
SORTED_TICKETS=$(sort -t'|' -k1 -n "$TEMP_FILE")
rm -f "$TEMP_FILE"

# 显示 tickets
echo ""
echo "待处理 Tickets (按优先级排序):"
echo "----------------------------------------"
echo "$SORTED_TICKETS" | while IFS='|' read -r prio id file tags; do
    PRIO_DISPLAY=$(get_priority_label "$prio")
    echo -e "  ${MAGENTA}$id${NC} - 优先级：$PRIO_DISPLAY - 标签：$tags"
done
echo "----------------------------------------"
echo ""

# ==========================================
# 步骤 2: 选择最高优先级的 ticket
# ==========================================
echo -e "${BLUE}## 步骤 2: 选择 Ticket${NC}"
echo ""

# 获取第一个（最高优先级）ticket
FIRST_TICKET=$(echo "$SORTED_TICKETS" | head -1)
if [ -z "$FIRST_TICKET" ]; then
    echo -e "${YELLOW}⚠${NC} 没有 ready 状态的 tickets"
    echo "等待 Master 创建新任务..."
    exit 0
fi

SELECTED_PRIO=$(echo "$FIRST_TICKET" | cut -d'|' -f1)
SELECTED_ID=$(echo "$FIRST_TICKET" | cut -d'|' -f2)
SELECTED_FILE=$(echo "$FIRST_TICKET" | cut -d'|' -f3)
SELECTED_TAGS=$(echo "$FIRST_TICKET" | cut -d'|' -f4)

echo -e "选择 Ticket: ${MAGENTA}$SELECTED_ID${NC}"
echo "  优先级：$(get_priority_label "$SELECTED_PRIO")"
echo "  文件：$SELECTED_FILE"
echo "  标签：$SELECTED_TAGS"
echo ""

# ==========================================
# 步骤 3: 更新 ticket 状态
# ==========================================
echo -e "${BLUE}## 步骤 3: 更新 Ticket 状态${NC}"
echo ""

TIMESTAMP=$(date -Iseconds)
SLAVER_ID="agent_${AGENT_TYPE}_$(date +%H%M%S)"

# 读取当前内容
CURRENT_CONTENT=$(cat "$SELECTED_FILE")

# 在状态流转记录中添加一行
# 查找状态流转记录表并添加新行
if grep -q "|.*ready → in_progress.*|" "$SELECTED_FILE" 2>/dev/null; then
    echo -e "${YELLOW}⚠${NC} 状态已经是 in_progress，跳过"
else
    # 添加状态流转记录
    NEW_LINE="| $TIMESTAMP | ready → in_progress | $SLAVER_ID | Slaver 自动领取 |"

    # 在状态流转记录表中添加新行（在表头后）
    UPDATED_CONTENT=$(echo "$CURRENT_CONTENT" | awk -v new_line="$NEW_LINE" '
        /^\| 时间 \| 状态变更/ { print; getline; print; print new_line; next }
        { print }
    ')

    echo "$UPDATED_CONTENT" > "$SELECTED_FILE"
    echo -e "${GREEN}✓${NC} 状态已更新：ready → in_progress"
    echo "  领取者：$SLAVER_ID"
    echo "  时间：$TIMESTAMP"
fi
echo ""

# ==========================================
# 步骤 4: 创建 worktree 和分支
# ==========================================
echo -e "${BLUE}## 步骤 4: 创建 Worktree 和分支${NC}"
echo ""

WORKTREE_DIR="$PROJECT_ROOT/.eket/worktrees/${SELECTED_ID}"
BRANCH_NAME="feature/${SELECTED_ID}-$(echo "$SELECTED_ID" | tr '[:upper:]' '[:lower:]')"

# 创建 worktree
if [ -d "$WORKTREE_DIR" ]; then
    echo -e "${YELLOW}⚠${NC} Worktree 已存在：$WORKTREE_DIR"
else
    mkdir -p "$WORKTREE_DIR"
    echo -e "${GREEN}✓${NC} Worktree 已创建：$WORKTREE_DIR"
fi

# 切换到 code_repo 并创建分支
cd "$PROJECT_ROOT/code_repo"

if git rev-parse --verify "$BRANCH_NAME" &>/dev/null; then
    echo -e "${YELLOW}⚠${NC} 分支已存在：$BRANCH_NAME"
    git checkout "$BRANCH_NAME" 2>/dev/null
else
    git checkout -b "$BRANCH_NAME" 2>/dev/null
    echo -e "${GREEN}✓${NC} 分支已创建：$BRANCH_NAME"
fi
echo ""

# ==========================================
# 步骤 5: 加载 Agent Profile 和 Skills
# ==========================================
echo -e "${BLUE}## 步骤 5: 加载 Agent Profile${NC}"
echo ""

PROFILE_FILE="$PROJECT_ROOT/.eket/state/profiles/${AGENT_TYPE}.yml"
if [ -f "$PROFILE_FILE" ]; then
    echo -e "${GREEN}✓${NC} Profile 已加载：$AGENT_TYPE"
    echo ""
    echo "Skills:"
    grep "^  -" "$PROFILE_FILE" | while read -r skill; do
        echo "  - $(echo "$skill" | sed 's/^  - //')"
    done
else
    echo -e "${YELLOW}⚠${NC} Profile 文件不存在，使用默认配置"
fi
echo ""

# ==========================================
# 步骤 6: 输出执行指令
# ==========================================
echo -e "${BLUE}## 步骤 6: 执行开发流程${NC}"
echo ""

echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  Slaver 自动执行已准备就绪                                    │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│                                                              │"
echo "│  已配置：                                                    │"
echo "│  - Ticket: $SELECTED_ID"
echo "│  - 分支：$BRANCH_NAME"
echo "│  - 角色：$AGENT_TYPE"
echo "│                                                              │"
echo "│  下一步 (由 Claude Code 执行):                                │"
echo "│  1. 阅读 ticket 文件，理解需求                                 │"
echo "│  2. 设计并编写测试 (TDD)                                     │"
echo "│  3. 实现功能                                                 │"
echo "│  4. 运行测试并迭代                                           │"
echo "│  5. 提交代码并创建 PR                                        │"
echo "│                                                              │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 保存当前任务状态
STATE_FILE="$PROJECT_ROOT/.eket/state/current_task.yml"
cat > "$STATE_FILE" << EOF
# 当前任务状态
# 更新于：$TIMESTAMP

task_id: $SELECTED_ID
ticket_file: $SELECTED_FILE
branch: $BRANCH_NAME
worktree: $WORKTREE_DIR
slaver_id: $SLAVER_ID
status: in_progress
started_at: $TIMESTAMP
last_updated: $TIMESTAMP
EOF

echo -e "${GREEN}✓${NC} 任务状态已保存：$STATE_FILE"
echo ""

# 输出到 outbox
OUTBOX_FILE="$PROJECT_ROOT/outbox/review_requests/${SELECTED_ID}-started.md"
mkdir -p "$(dirname "$OUTBOX_FILE")"
cat > "$OUTBOX_FILE" << EOF
# 任务开始 - $SELECTED_ID

**Slaver ID**: $SLAVER_ID
**开始时间**: $TIMESTAMP
**分支**: $BRANCH_NAME

## 状态
- [x] 已领取任务
- [x] 已更新 ticket 状态
- [x] 已创建分支
- [ ] 设计测试
- [ ] 实现功能
- [ ] 提交 PR

## 下一步
等待 Claude Code 执行开发流程...
EOF

echo "========================================"
echo "Slaver 自动执行准备完成"
echo "========================================"
echo ""
echo "请运行以下命令启动 Claude Code 进行开发:"
echo "  claude  # 或使用你的 Claude Code 命令"
echo ""

# ==========================================
# 步骤 7-10: 开发完成后提交 PR（由 Claude Code 调用）
# ==========================================
# 注意：以下步骤在开发完成后由 Claude Code 自动执行
#
# 完成开发后的命令：
#   /eket-submit-pr -t $SELECTED_ID -b $BRANCH_NAME
#
# 这将自动：
#   1. 提交代码变更
#   2. 推送到远程仓库
#   3. 创建 PR 描述文件到 outbox/review_requests/
#   4. 发送 Review 请求消息到 Master
#   5. 更新 Ticket 状态为 review
echo -e "${BLUE}## 步骤 7-10: 开发完成后自动提交 PR${NC}"
echo ""
echo "完成开发后，运行:"
echo "  /eket-submit-pr -t $SELECTED_ID -b $BRANCH_NAME"
echo ""
echo "或者由 Claude Code 自动调用此命令完成 PR 提交和 Master 通知"
echo ""
