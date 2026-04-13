#!/bin/bash
# /eket-submit-pr - Slaver 提交 PR 请求 Master 审核 (v2.1.0)

# 不使用 set -e，避免在可恢复错误处退出

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 提交 PR v2.1.0"
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

# 读取实例配置获取 instance_id
CONFIG_FILE=".eket/state/instance_config.yml"
INSTANCE_ID=""
if [ -f "$CONFIG_FILE" ]; then
    INSTANCE_ID=$(grep "^instance_id:" "$CONFIG_FILE" 2>/dev/null | sed 's/instance_id:\s*//' | tr -d '"' || echo "")
fi
if [ -z "$INSTANCE_ID" ]; then
    INSTANCE_ID="slaver_$(hostname)_$$"
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}✗${NC} 实例配置文件不存在"
    echo "请先运行 /eket-start 初始化实例"
    exit 1
fi

INSTANCE_ROLE=$(grep "^role:" "$CONFIG_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' "' || echo "null")

if [ "$INSTANCE_ROLE" != "slaver" ]; then
    echo -e "${RED}✗${NC} 当前实例不是 Slaver 角色"
    echo "当前角色：$INSTANCE_ROLE"
    echo "/eket-submit-pr 仅 Slaver 实例可用"
    exit 1
fi

echo -e "${GREEN}✓${NC} Slaver 实例已确认"
echo ""

# 检查参数
TICKET_ID=""
BRANCH_NAME=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -t|--ticket) TICKET_ID="$2"; shift ;;
        -b|--branch) BRANCH_NAME="$2"; shift ;;
        -h|--help)
            echo "用法：/eket-submit-pr [-t <ticket-id>] [-b <branch-name>]"
            echo ""
            echo "选项:"
            echo "  -t, --ticket    Ticket ID (如：FEAT-001)"
            echo "  -b, --branch    分支名称 (默认：当前分支)"
            echo "  -h, --help      显示帮助"
            echo ""
            exit 0
            ;;
        *) echo "未知参数：$1"; exit 1 ;;
    esac
    shift
done

# 获取当前分支
if [ -z "$BRANCH_NAME" ]; then
    BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "")
    if [ -z "$BRANCH_NAME" ]; then
        echo -e "${RED}✗${NC} 无法获取当前分支名称"
        echo "请使用 -b 参数指定分支名称"
        exit 1
    fi
fi

# 检查 Ticket ID
if [ -z "$TICKET_ID" ]; then
    # 尝试从分支名称提取
    if [[ "$BRANCH_NAME" =~ ^(feature|bugfix|hotfix)/([A-Z]+-[0-9]+) ]]; then
        TICKET_ID="${BASH_REMATCH[2]}"
    else
        echo -e "${YELLOW}⚠${NC} 未指定 Ticket ID，也无法从分支名称提取"
        echo "请使用 -t 参数指定 Ticket ID"
        exit 1
    fi
fi

echo -e "${BLUE}## 步骤 1: 检查分支状态${NC}"
echo ""
echo "分支：$BRANCH_NAME"
echo "Ticket: $TICKET_ID"
echo ""

# 检查是否有未提交的更改
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

if [ "$UNCOMMITTED" -gt 0 ]; then
    echo -e "${YELLOW}⚠${NC} 存在未提交的更改"
    echo "请先提交或暂存更改"
    git status --short
    exit 1
fi

echo -e "${GREEN}✓${NC} 工作区干净"
echo ""

# 检查分支是否已推送到远程
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 本地分支存在"
else
    echo -e "${RED}✗${NC} 本地分支不存在：$BRANCH_NAME"
    exit 1
fi

# 提交变更（如果有暂存的）
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')

if [ "$STAGED" -gt 0 ]; then
    echo -e "${BLUE}## 步骤 2: 提交暂存的变更${NC}"
    echo ""
    git commit -m "feat($TICKET_ID): complete implementation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
    echo -e "${GREEN}✓${NC} 变更已提交"
    echo ""
fi

# 推送到远程
echo -e "${BLUE}## 步骤 3: 推送到远程${NC}"
echo ""

if git remote -v | grep -q "origin"; then
    git push -u origin "$BRANCH_NAME" 2>/dev/null && \
        echo -e "${GREEN}✓${NC} 已推送到远程" || \
        echo -e "${YELLOW}⚠${NC} 推送失败，请检查远程仓库配置"
else
    echo -e "${YELLOW}⚠${NC} 未配置远程仓库"
fi

echo ""

# 创建 PR 描述
echo -e "${BLUE}## 步骤 4: 创建 PR 描述${NC}"
echo ""

PR_DIR="outbox/review_requests"
mkdir -p "$PR_DIR"

PR_FILE="$PR_DIR/pr_${TICKET_ID}_$(date +%Y%m%d_%H%M%S).md"

# 获取变更摘要
CHANGES_SUMMARY=$(git diff HEAD~1 --stat 2>/dev/null || echo "待补充")

cat > "$PR_FILE" << EOF
# PR 请求：$TICKET_ID

**提交者**: $INSTANCE_ID
**分支**: $BRANCH_NAME
**目标分支**: testing
**创建时间**: $(date -Iseconds)

---

## 关联 Ticket

- $TICKET_ID

## 变更摘要

$CHANGES_SUMMARY

## 变更详情

<!-- 请详细描述变更内容 -->

## 验收标准

- [ ] 代码符合项目规范
- [ ] 测试覆盖关键逻辑
- [ ] 文档已更新（如需要）

## 测试情况

- [ ] 单元测试通过
- [ ] 手动测试完成（如需要）

## 注意事项

<!-- 列出需要 Reviewer 特别注意的内容 -->

---

## 状态：pending_review

**等待 Master 审核**

## Slaver 等待流程

**提交者当前状态**：
- 如有紧急任务 → 等待 Master 反馈（每 15 分钟检查一次）
- 如非紧急任务 → 可领取新任务并行开发

**Master 反馈处理**：
| 结果 | 行动 |
|------|------|
| 批准 | 准备 merge，领取新任务 |
| 需要修改 | 立即修改，重新提交 PR |
| 驳回 | 重新分析需求，重新开发 |

EOF

echo -e "${GREEN}✓${NC} PR 描述已创建：$PR_FILE"
echo ""

# 发送消息通知 Master
MESSAGE_DIR="shared/message_queue/inbox"
mkdir -p "$MESSAGE_DIR"

MSG_FILE="$MESSAGE_DIR/pr_review_request_$(date +%Y%m%d_%H%M%S).json"

cat > "$MSG_FILE" << EOF
{
  "id": "msg_$(date +%Y%m%d_%H%M%S)",
  "timestamp": "$(date -Iseconds)",
  "from": "slaver_${INSTANCE_ROLE}_$(date +%s)",
  "to": "master",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "$TICKET_ID",
    "branch": "$BRANCH_NAME",
    "target": "testing",
    "pr_file": "$PR_FILE",
    "summary": "请求审核 $TICKET_ID 的实现"
  }
}
EOF

echo -e "${GREEN}✓${NC} Review 请求消息已发送"
echo ""

# 更新 Ticket 状态
TICKET_FILE="jira/tickets/feature/${TICKET_ID}.md"

if [ -f "$TICKET_FILE" ]; then
    sed -i '' "s/^分配给:.*/分配给：null/" "$TICKET_FILE" 2>/dev/null || \
    sed -i "s/^分配给:.*/分配给：null/" "$TICKET_FILE"

    # 更新状态为 review
    if grep -q "^状态：dev" "$TICKET_FILE"; then
        sed -i '' "s/^状态：dev/状态：review/" "$TICKET_FILE" 2>/dev/null || \
        sed -i "s/^状态：dev/状态：review/" "$TICKET_FILE"
    elif grep -q "^状态：test" "$TICKET_FILE"; then
        sed -i '' "s/^状态：test/状态：review/" "$TICKET_FILE" 2>/dev/null || \
        sed -i "s/^状态：test/状态：review/" "$TICKET_FILE"
    fi

    echo -e "${GREEN}✓${NC} Ticket 状态已更新为 review"
else
    echo -e "${YELLOW}⚠${NC} Ticket 文件未找到：$TICKET_FILE"
fi

echo ""

# 总结
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  PR 提交完成                                                  │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  分支：$BRANCH_NAME"
echo "│  Ticket: $TICKET_ID"
echo "│  PR 文件：$PR_FILE"
echo "│                                                              │"
echo "│  下一步：                                                    │"
echo "│  - 等待 Master 审核 PR                                         │"
echo "│  - 如需修改，根据 Review 意见更新代码                          │"
echo "│  - 审核通过后，Master 将合并到 main 分支                        │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

echo "========================================"
echo "PR 提交完成"
echo "========================================"
