#!/bin/bash
# /eket-merge - Master 合并 PR 到 main 分支

set -e

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 合并 PR v0.6.2"
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
    echo "/eket-merge 仅 Master 实例可用"
    exit 1
fi

echo -e "${GREEN}✓${NC} Master 实例已确认"
echo ""

# 检查参数
TICKET_ID=""
PR_NUMBER=""
BRANCH_NAME=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -t|--ticket) TICKET_ID="$2"; shift ;;
        -n|--number) PR_NUMBER="$2"; shift ;;
        -b|--branch) BRANCH_NAME="$2"; shift ;;
        -h|--help)
            echo "用法：/eket-merge [-t <ticket-id>] [-n <pr-number>] [-b <branch-name>]"
            echo ""
            echo "选项:"
            echo "  -t, --ticket    Ticket ID (如：FEAT-001)"
            echo "  -n, --number    PR 编号"
            echo "  -b, --branch    源分支名称 (默认：从 PR 文件获取)"
            echo "  -h, --help      显示帮助"
            echo ""
            exit 0
            ;;
        *) echo "未知参数：$1"; exit 1 ;;
    esac
    shift
done

# 查找待合并的 PR
PR_DIR="outbox/review_requests"

if [ -z "$TICKET_ID" ]; then
    # 查找所有已批准待合并的 PR
    if [ -d "$PR_DIR" ]; then
        echo -e "${BLUE}## 已批准待合并的 PR${NC}"
        echo ""

        FOUND_APPROVED=false
        for pr_file in "$PR_DIR"/pr_*.md; do
            if [ -f "$pr_file" ] && grep -q "approved" "$pr_file" 2>/dev/null; then
                PR_TICKET=$(grep -m1 "^**Ticket" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
                PR_BRANCH=$(grep -m1 "^**分支" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")

                echo "  ${CYAN}$(basename "$pr_file" .md)${NC}"
                echo "    Ticket: $PR_TICKET | 分支：$PR_BRANCH | 状态：approved"
                FOUND_APPROVED=true
            fi
        done

        if [ "$FOUND_APPROVED" = false ]; then
            echo "当前无已批准待合并的 PR"
            echo ""
            echo "提示：使用 /eket-merge -t <ticket-id> 合并指定 PR"
            exit 0
        fi

        echo ""
        exit 0
    fi
fi

# 根据 Ticket ID 查找 PR 文件
if [ -n "$TICKET_ID" ]; then
    PR_FILE=$(find "$PR_DIR" -name "pr_${TICKET_ID}_*.md" -type f 2>/dev/null | head -1)

    if [ -z "$PR_FILE" ]; then
        echo -e "${RED}✗${NC} 未找到 Ticket $TICKET_ID 的 PR"
        exit 1
    fi

    # 检查审核状态
    if grep -q "approved" "$PR_FILE"; then
        echo -e "${GREEN}✓${NC} PR 已批准，可以合并"
    elif grep -q "changes_requested" "$PR_FILE"; then
        echo -e "${RED}✗${NC} PR 需要修改，不能合并"
        echo "请先运行 /eket-review-pr 重新审核"
        exit 1
    elif grep -q "rejected" "$PR_FILE"; then
        echo -e "${RED}✗${NC} PR 已被拒绝，不能合并"
        exit 1
    else
        echo -e "${RED}✗${NC} PR 状态未知，请先审核"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} 请提供 Ticket ID"
    exit 1
fi

echo -e "${BLUE}## 步骤 1: 读取 PR 信息${NC}"
echo ""

# ==========================================
# 审查报告验证 (v0.6.2 新增)
# ==========================================

echo -e "${CYAN}[1.5] 审查报告验证${NC}"

REVIEW_DIR="outbox/review_results"
REVIEW_VALID=true

# 检查专家评审报告
EXPERT_REPORT=$(ls "$REVIEW_DIR/expert-review-${TICKET_ID}-"*".md" 2>/dev/null | head -1)
if [ -n "$EXPERT_REPORT" ] && [ -f "$EXPERT_REPORT" ]; then
    echo -e "${GREEN}  ✓ 专家评审报告存在：$EXPERT_REPORT${NC}"

    # 检查安全评审状态
    if grep -q "SECURITY_STATUS=fail" "$REVIEW_DIR/.review_${TICKET_ID}.env" 2>/dev/null; then
        echo -e "${RED}  ✗ 安全评审未通过，需要修复${NC}"
        REVIEW_VALID=false
    else
        echo -e "${GREEN}  ✓ 安全评审通过${NC}"
    fi
else
    echo -e "${YELLOW}  ⚠ 专家评审报告不存在 (可能已跳过)${NC}"
fi

# 检查 Roadmap 对齐报告
ROADMAP_REPORT=$(ls "$REVIEW_DIR/roadmap-alignment-${TICKET_ID}-"*".md" 2>/dev/null | head -1)
if [ -n "$ROADMAP_REPORT" ] && [ -f "$ROADMAP_REPORT" ]; then
    echo -e "${GREEN}  ✓ Roadmap 对齐报告存在：$ROADMAP_REPORT${NC}"
else
    echo -e "${YELLOW}  ⚠ Roadmap 对齐报告不存在 (可能已跳过)${NC}"
fi

# 检查测试门禁报告
TEST_REPORT=$(ls "$REVIEW_DIR/test-gate-report-${TICKET_ID}-"*".md" 2>/dev/null | head -1)
if [ -n "$TEST_REPORT" ] && [ -f "$TEST_REPORT" ]; then
    echo -e "${GREEN}  ✓ 测试门禁报告存在：$TEST_REPORT${NC}"
else
    echo -e "${YELLOW}  ⚠ 测试门禁报告不存在 (可能已跳过)${NC}"
fi

# 检查 merge-validator 验证
echo ""
echo -e "${CYAN}[1.6] 合并前置验证${NC}"
if [ -f "$SCRIPTS_DIR/merge-validator.sh" ]; then
    if "$SCRIPTS_DIR/merge-validator.sh" validate "$TICKET_ID" 2>/dev/null; then
        echo -e "${GREEN}  ✓ 合并验证通过${NC}"
        MERGE_VALIDATOR_PASSED=true
    else
        echo -e "${YELLOW}  ⚠ 合并验证存在未通过项${NC}"
        MERGE_VALIDATOR_PASSED=false
    fi
else
    echo -e "${YELLOW}  ⚠ 合并验证脚本不存在，跳过${NC}"
    MERGE_VALIDATOR_PASSED=true
fi

# 判断是否可以继续合并
if [ "$REVIEW_VALID" = false ]; then
    echo ""
    echo -e "${RED}✗ 存在未通过的审查项，请修复后重新提交${NC}"
    echo ""
    echo "未通过项:"
    if grep -q "SECURITY_STATUS=fail" "$REVIEW_DIR/.review_${TICKET_ID}.env" 2>/dev/null; then
        echo "  - 安全评审未通过"
    fi
    echo ""
    echo "建议:"
    echo "  1. 查看评审报告：$EXPERT_REPORT"
    echo "  2. 修复安全问题后重新提交 PR"
    exit 1
fi

echo ""

# 获取分支名称
if [ -z "$BRANCH_NAME" ]; then
    BRANCH_NAME=$(grep -m1 "^**分支" "$PR_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
fi

if [ -z "$BRANCH_NAME" ]; then
    echo -e "${RED}✗${NC} 无法获取分支名称"
    echo "请使用 -b 参数指定分支名称"
    exit 1
fi

TARGET_BRANCH=$(grep -m1 "^**目标分支" "$PR_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "testing")

echo "Ticket: $TICKET_ID"
echo "源分支：$BRANCH_NAME"
echo "目标分支：$TARGET_BRANCH"
echo ""

# 检查分支是否存在
echo -e "${BLUE}## 步骤 2: 检查分支状态${NC}"
echo ""

# 先 fetch 远程
git fetch origin 2>/dev/null && echo -e "${GREEN}✓${NC} 已获取远程状态" || \
    echo -e "${YELLOW}⚠${NC} 无法连接远程，使用本地状态"

# 检查本地是否有该分支
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 本地分支存在：$BRANCH_NAME"
else
    echo "尝试从远程拉取分支..."
    git checkout -b "$BRANCH_NAME" "origin/$BRANCH_NAME" 2>/dev/null && \
        echo -e "${GREEN}✓${NC} 已从远程拉取分支" || \
        echo -e "${RED}✗${NC} 无法获取分支"
fi

echo ""

# 合并到目标分支
echo -e "${BLUE}## 步骤 4: 合并到 $TARGET_BRANCH${NC}"
echo ""

# 切换到目标分支
git checkout "$TARGET_BRANCH" 2>/dev/null || git checkout -b "$TARGET_BRANCH"
echo -e "${GREEN}✓${NC} 已切换到 $TARGET_BRANCH 分支"

# 拉取最新状态
git pull origin "$TARGET_BRANCH" 2>/dev/null && \
    echo -e "${GREEN}✓${NC} 已更新 $TARGET_BRANCH 分支" || \
    echo -e "${YELLOW}⚠${NC} 无法拉取远程，使用本地状态"

# 合并源分支
echo "合并 $BRANCH_NAME 到 $TARGET_BRANCH..."
git merge "$BRANCH_NAME" -m "merge($TICKET_ID): merge $BRANCH_NAME into $TARGET_BRANCH

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" && \
    echo -e "${GREEN}✓${NC} 合并成功" || {
        echo -e "${RED}✗${NC} 合并冲突"
        echo "请手动解决冲突后运行 git merge --continue"
        exit 1
    }

echo ""

# 推送到远程
echo -e "${BLUE}## 步骤 5: 推送到远程${NC}"
echo ""

git push origin "$TARGET_BRANCH" && \
    echo -e "${GREEN}✓${NC} 已推送到远程" || \
    echo -e "${RED}✗${NC} 推送失败"

# 如果是合并到 testing，还需要合并到 main
if [ "$TARGET_BRANCH" = "testing" ]; then
    echo ""
    echo -e "${BLUE}## 步骤 6: 合并到 main 分支${NC}"
    echo ""

    echo "切换到 main 分支..."
    git checkout main 2>/dev/null || git checkout -b main
    git pull origin main 2>/dev/null && \
        echo -e "${GREEN}✓${NC} 已更新 main 分支" || \
        echo -e "${YELLOW}⚠${NC} 无法拉取远程"

    echo "合并 testing 到 main..."
    git merge testing -m "merge($TICKET_ID): merge testing into main

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" && \
        echo -e "${GREEN}✓${NC} 合并成功" || {
            echo -e "${RED}✗${NC} 合并冲突"
            echo "请手动解决冲突"
            exit 1
        }

    echo "推送到远程..."
    git push origin main && \
        echo -e "${GREEN}✓${NC} 已推送到远程" || \
        echo -e "${RED}✗${NC} 推送失败"
fi

echo ""

# 更新 Ticket 状态
TICKET_FILE="jira/tickets/feature/${TICKET_ID}.md"

if [ -f "$TICKET_FILE" ]; then
    # 更新状态为 done
    sed -i '' "s/^状态：.*/状态：done/" "$TICKET_FILE" 2>/dev/null || \
    sed -i "s/^状态：.*/状态：done/" "$TICKET_FILE"

    # 添加完成时间
    echo "" >> "$TICKET_FILE"
    echo "**完成时间**: $(date -Iseconds)" >> "$TICKET_FILE"

    echo -e "${GREEN}✓${NC} Ticket 状态已更新为 done"
else
    echo -e "${YELLOW}⚠${NC} Ticket 文件未找到：$TICKET_FILE"
fi

echo ""

# 更新 PR 文件状态
sed -i '' 's/approved/merged/' "$PR_FILE" 2>/dev/null || \
sed -i 's/approved/merged/' "$PR_FILE"

echo -e "${GREEN}✓${NC} PR 状态已更新为 merged"
echo ""

# 发送消息通知
MESSAGE_DIR="shared/message_queue/outbox"
mkdir -p "$MESSAGE_DIR"

MSG_FILE="$MESSAGE_DIR/pr_merged_$(date +%Y%m%d_%H%M%S).json"

cat > "$MSG_FILE" << EOF
{
  "id": "msg_$(date +%Y%m%d_%H%M%S)",
  "timestamp": "$(date -Iseconds)",
  "from": "master",
  "to": "slaver_$TICKET_ID",
  "type": "pr_merged",
  "priority": "normal",
  "payload": {
    "ticket_id": "$TICKET_ID",
    "target_branch": "main",
    "summary": "PR 已合并到 main 分支，任务完成"
  }
}
EOF

echo -e "${GREEN}✓${NC} 合并通知已发送"
echo ""

# 总结
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  合并完成                                                    │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  Ticket: $TICKET_ID"
echo "│  源分支：$BRANCH_NAME"
echo "│  目标分支：main"
echo "│                                                              │"
echo "│  状态：✅ 已完成"
echo "│                                                              │"
echo "│  下一步：                                                    │"
echo "│  - 更新 Jira 状态为 done                                      │"
echo "│  - 通知相关方任务已完成                                      │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

echo "========================================"
echo "合并完成"
echo "========================================"
