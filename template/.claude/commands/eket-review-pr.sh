#!/bin/bash
# /eket-review-pr - Master 审核 Slaver 提交的 PR

set -e

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET PR 审核 v0.6.2"
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
    echo "/eket-review-pr 仅 Master 实例可用"
    exit 1
fi

echo -e "${GREEN}✓${NC} Master 实例已确认"
echo ""

# 检查参数
PR_NUMBER=""
TICKET_ID=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -n|--number) PR_NUMBER="$2"; shift ;;
        -t|--ticket) TICKET_ID="$2"; shift ;;
        -h|--help)
            echo "用法：/eket-review-pr [-n <pr-number>] [-t <ticket-id>]"
            echo ""
            echo "选项:"
            echo "  -n, --number    PR 编号 (如：42)"
            echo "  -t, --ticket    Ticket ID (如：FEAT-001)"
            echo "  -h, --help      显示帮助"
            echo ""
            exit 0
            ;;
        *) echo "未知参数：$1"; exit 1 ;;
    esac
    shift
done

# 查找待审核的 PR
PR_DIR="outbox/review_requests"

if [ -z "$TICKET_ID" ] && [ -z "$PR_NUMBER" ]; then
    # 查找所有待审核的 PR
    if [ -d "$PR_DIR" ]; then
        PR_COUNT=$(find "$PR_DIR" -name "pr_*.md" -type f 2>/dev/null | wc -l | tr -d ' ')

        if [ "$PR_COUNT" -gt 0 ]; then
            echo -e "${BLUE}## 待审核 PR 列表${NC}"
            echo ""
            echo "找到 $PR_COUNT 个待审核 PR:"
            echo ""

            for pr_file in "$PR_DIR"/pr_*.md; do
                if [ -f "$pr_file" ]; then
                    # 提取 Ticket ID
                    PR_TICKET=$(grep -m1 "^**Ticket" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
                    PR_BRANCH=$(grep -m1 "^**分支" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
                    PR_TIME=$(grep -m1 "^**创建时间" "$pr_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")

                    echo "  ${CYAN}$(basename "$pr_file" .md)${NC}"
                    echo "    Ticket: $PR_TICKET | 分支：$PR_BRANCH | 时间：$PR_TIME"
                    echo ""
                fi
            done

            echo "使用 /eket-review-pr -t <ticket-id> 审核指定 PR"
            exit 0
        else
            echo "当前无待审核的 PR"
            exit 0
        fi
    else
        echo "PR 目录不存在：$PR_DIR"
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
else
    echo -e "${RED}✗${NC} 请提供 Ticket ID 或 PR 编号"
    exit 1
fi

echo -e "${BLUE}## 步骤 1: 读取 PR 内容${NC}"
echo ""
echo "PR 文件：$PR_FILE"
echo ""

# 显示 PR 摘要
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  PR 摘要                                                      │"
echo "├──────────────────────────────────────────────────────────────┤"
head -25 "$PR_FILE" | sed 's/^/│  /'
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 获取代码变更
echo -e "${BLUE}## 步骤 2: 检查代码变更${NC}"
echo ""

# 尝试从 PR 文件中获取分支信息
BRANCH=$(grep -m1 "^**分支" "$PR_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

if [ -n "$BRANCH" ]; then
    echo "分支：$BRANCH"

    # 检查分支是否存在
    if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} 分支存在"

        # 显示变更统计
        echo ""
        echo "代码变更统计:"
        git diff --stat main.."$BRANCH" 2>/dev/null || echo "无法获取变更统计"
    else
        echo -e "${YELLOW}⚠${NC} 分支不存在，可能需要先从远程拉取"
        git fetch origin 2>/dev/null && echo "已尝试从远程获取" || echo "无法连接远程"
    fi
else
    echo -e "${YELLOW}⚠${NC} 无法从 PR 文件中获取分支信息"
fi

echo ""

# ==========================================
# 完整审查流程 (v0.6.2 新增)
# ==========================================

echo -e "${BLUE}## 步骤 3: 运行完整审查流程${NC}"
echo ""
echo "启动增强审查机制："
echo "  - 测试门禁验证"
echo "  - 领域专家评审 (架构/安全/性能/代码质量)"
echo "  - Roadmap 对齐检查"
echo ""

# 创建审查结果目录
REVIEW_DIR="outbox/review_results"
mkdir -p "$REVIEW_DIR"

# 3.1 运行测试门禁验证
echo -e "${CYAN}[3.1] 测试门禁验证${NC}"
if [ -f "$SCRIPTS_DIR/test-gate-system.sh" ]; then
    if "$SCRIPTS_DIR/test-gate-system.sh" all "$TICKET_ID" 2>/dev/null; then
        echo -e "${GREEN}  ✓ 测试门禁通过${NC}"
        TEST_GATE_PASSED=true
    else
        echo -e "${YELLOW}  ⚠ 测试门禁存在未通过项${NC}"
        TEST_GATE_PASSED=false
    fi
else
    echo -e "${YELLOW}  ⚠ 测试门禁脚本不存在，跳过${NC}"
    TEST_GATE_PASSED=true
fi
echo ""

# 3.2 运行领域专家评审
echo -e "${CYAN}[3.2] 领域专家评审${NC}"
if [ -f "$SCRIPTS_DIR/expert-review.sh" ]; then
    if "$SCRIPTS_DIR/expert-review.sh" "$TICKET_ID" "$BRANCH" 2>/dev/null; then
        echo -e "${GREEN}  ✓ 专家评审完成${NC}"
        EXPERT_REVIEW_DONE=true
    else
        echo -e "${YELLOW}  ⚠ 专家评审存在警告项${NC}"
        EXPERT_REVIEW_DONE=true  # 评审完成，可能有警告
    fi
else
    echo -e "${YELLOW}  ⚠ 专家评审脚本不存在，跳过${NC}"
    EXPERT_REVIEW_DONE=true
fi
echo ""

# 3.3 运行 Roadmap 对齐检查
echo -e "${CYAN}[3.3] Roadmap 对齐检查${NC}"
if [ -f "$SCRIPTS_DIR/roadmap-alignment-check.sh" ]; then
    if "$SCRIPTS_DIR/roadmap-alignment-check.sh" "$TICKET_ID" "$BRANCH" 2>/dev/null; then
        echo -e "${GREEN}  ✓ Roadmap 对齐检查完成${NC}"
        ROADMAP_CHECK_DONE=true
    else
        echo -e "${YELLOW}  ⚠ Roadmap 对齐检查存在警告${NC}"
        ROADMAP_CHECK_DONE=true
    fi
else
    echo -e "${YELLOW}  ⚠ Roadmap 检查脚本不存在，跳过${NC}"
    ROADMAP_CHECK_DONE=true
fi
echo ""

# 3.4 读取评审结果
echo -e "${BLUE}[3.4] 综合审查结果${NC}"
ENV_FILE="$REVIEW_DIR/.review_${TICKET_ID}.env"
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  审查结果汇总                                                │"
    echo "├──────────────────────────────────────────────────────────────┤"
    printf "│  %-50s │\n" "测试门禁：$([ "$TEST_GATE_PASSED" = true ] && echo "✓ 通过" || echo "⚠ 未通过")"
    printf "│  %-50s │\n" "架构评审：$([ "${ARCH_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${ARCH_SCORE:-N/A}/5)" || echo "⚠ 需改进 (${ARCH_SCORE:-N/A}/5)")"
    printf "│  %-50s │\n" "安全评审：$([ "${SECURITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${SECURITY_SCORE:-N/A}/5)" || echo "✗ 需修复 (${SECURITY_SCORE:-N/A}/5)")"
    printf "│  %-50s │\n" "性能评审：$([ "${PERFORMANCE_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${PERFORMANCE_SCORE:-N/A}/5)" || echo "⚠ 需优化 (${PERFORMANCE_SCORE:-N/A}/5)")"
    printf "│  %-50s │\n" "代码质量：$([ "${QUALITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${QUALITY_SCORE:-N/A}/5)" || echo "⚠ 需改进 (${QUALITY_SCORE:-N/A}/5)")"
    printf "│  %-50s │\n" "Roadmap 对齐：$([ "${ROADMAP_STATUS:-pass}" = "pass" ] && echo "✓ 对齐 (${ROADMAP_SCORE:-N/A}/5)" || echo "⚠ 需关注 (${ROADMAP_SCORE:-N/A}/5)")"
    echo "└──────────────────────────────────────────────────────────────┘"

    # 计算综合评分
    total_score=0
    count=0
    for score in "${ARCH_SCORE:-3}" "${SECURITY_SCORE:-3}" "${PERFORMANCE_SCORE:-3}" "${QUALITY_SCORE:-3}" "${ROADMAP_SCORE:-3}"; do
        total_score=$((total_score + score))
        count=$((count + 1))
    done
    avg_score=$(echo "scale=1; $total_score / $count" | bc 2>/dev/null || echo "$((total_score / count))")

    echo ""
    echo "综合评分：$avg_score / 5.0"

    # 判断是否推荐批准
    if [ "$TEST_GATE_PASSED" = true ] && [ "${SECURITY_STATUS:-fail}" = "pass" ] && [ "$(echo "$avg_score >= 4" | bc 2>/dev/null)" = "1" ]; then
        RECOMMENDED_ACTION="approve"
        echo -e "${GREEN}推荐：批准合并${NC}"
    elif [ "${SECURITY_STATUS:-fail}" = "fail" ]; then
        RECOMMENDED_ACTION="reject"
        echo -e "${RED}推荐：拒绝 (存在安全问题)${NC}"
    else
        RECOMMENDED_ACTION="modify"
        echo -e "${YELLOW}推荐：需要修改${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 评审结果文件不存在，使用基础审查${NC}"
    RECOMMENDED_ACTION="manual"
fi
echo ""

# 显示审查报告文件
if [ -f "$REVIEW_DIR/expert-review-${TICKET_ID}-"*".md" ] 2>/dev/null; then
    EXPERT_REPORT=$(ls "$REVIEW_DIR/expert-review-${TICKET_ID}-"*".md" 2>/dev/null | head -1)
    echo -e "${BLUE}专家评审报告：$EXPERT_REPORT${NC}"
fi
if [ -f "$REVIEW_DIR/roadmap-alignment-${TICKET_ID}-"*".md" ] 2>/dev/null; then
    ROADMAP_REPORT=$(ls "$REVIEW_DIR/roadmap-alignment-${TICKET_ID}-"*".md" 2>/dev/null | head -1)
    echo -e "${BLUE}Roadmap 对齐报告：$ROADMAP_REPORT${NC}"
fi
echo ""

# 显示审核选项
echo -e "${BLUE}## 步骤 4: 选择审核结果${NC}"
echo ""
echo "请选择审核结果:"
echo ""
echo "  ${GREEN}[1]${NC} 批准 - 代码符合标准，可以合并"
echo "  ${YELLOW}[2]${NC} 需要修改 - 存在问题需要修复"
echo "  ${RED}[3]${NC} 拒绝 - 严重问题，需要重新设计"
echo ""
if [ "$RECOMMENDED_ACTION" != "manual" ]; then
    echo -e "${CYAN}推荐：$RECOMMENDED_ACTION${NC}"
fi
echo -n "请输入选择 [1-3]: "

# 读取用户输入（使用兼容方式）
if command -v read >/dev/null; then
    read -r CHOICE
else
    CHOICE="1"
fi

# 创建审核结果
REVIEW_DIR="outbox/review_results"
mkdir -p "$REVIEW_DIR"

REVIEW_FILE="$REVIEW_DIR/review_${TICKET_ID}_$(date +%Y%m%d_%H%M%S).md"

case "$CHOICE" in
    1)
        # 批准
        cat > "$REVIEW_FILE" << EOF
# PR 审核结果：$TICKET_ID

**审核者**: Master Agent
**审核时间**: $(date -Iseconds)
**结果**: ✅ 批准

---

## 审核意见

代码已通过审核，可以合并到 testing 分支。

## 审查维度

- 测试门禁：$([ "$TEST_GATE_PASSED" = true ] && echo "✓ 通过" || echo "⚠ 未通过")
- 架构评审：$([ "${ARCH_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "⚠ 需改进")
- 安全评审：$([ "${SECURITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "✗ 需修复")
- 性能评审：$([ "${PERFORMANCE_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "⚠ 需优化")
- 代码质量：$([ "${QUALITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过" || echo "⚠ 需改进")
- Roadmap 对齐：$([ "${ROADMAP_STATUS:-pass}" = "pass" ] && echo "✓ 对齐" || echo "⚠ 需关注")

## 评审报告

- 专家评审：$EXPERT_REPORT:-未生成
- Roadmap 对齐：$ROADMAP_REPORT:-未生成

## 下一步

1. 合并到 testing 分支进行测试
2. 测试通过后合并到 main 分支

---

**状态**: approved
EOF
        echo -e "${GREEN}✓${NC} PR 已批准"

        # 更新 PR 文件状态
        sed -i '' 's/pending_review/approved/' "$PR_FILE" 2>/dev/null || \
        sed -i 's/pending_review/approved/' "$PR_FILE"
        ;;
    2)
        # 需要修改
        echo ""
        echo "请输入需要修改的内容（一行，按回车确认）:"
        read -r COMMENTS

        cat > "$REVIEW_FILE" << EOF
# PR 审核结果：$TICKET_ID

**审核者**: Master Agent
**审核时间**: $(date -Iseconds)
**结果**: ⚠️ 需要修改

---

## 审核意见

$COMMENTS

---

## 审查维度详情

- 测试门禁：$([ "$TEST_GATE_PASSED" = true ] && echo "✓ 通过" || echo "⚠ 未通过")
- 架构评审：$([ "${ARCH_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${ARCH_SCORE:-N/A}/5)" || echo "⚠ 需改进 (${ARCH_SCORE:-N/A}/5)")
- 安全评审：$([ "${SECURITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${SECURITY_SCORE:-N/A}/5)" || echo "✗ 需修复 (${SECURITY_SCORE:-N/A}/5)")
- 性能评审：$([ "${PERFORMANCE_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${PERFORMANCE_SCORE:-N/A}/5)" || echo "⚠ 需优化 (${PERFORMANCE_SCORE:-N/A}/5)")
- 代码质量：$([ "${QUALITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${QUALITY_SCORE:-N/A}/5)" || echo "⚠ 需改进 (${QUALITY_SCORE:-N/A}/5)")
- Roadmap 对齐：$([ "${ROADMAP_STATUS:-pass}" = "pass" ] && echo "✓ 对齐 (${ROADMAP_SCORE:-N/A}/5)" || echo "⚠ 需关注 (${ROADMAP_SCORE:-N/A}/5)")

## 评审报告

- 专家评审：${EXPERT_REPORT:-未生成}
- Roadmap 对齐：${ROADMAP_REPORT:-未生成}

## 修改要求

请根据上述意见修改代码后重新提交 PR。

---

**状态**: changes_requested
EOF
        echo -e "${YELLOW}✓${NC} 已标记为需要修改"

        # 更新 PR 文件状态
        sed -i '' 's/pending_review/changes_requested/' "$PR_FILE" 2>/dev/null || \
        sed -i 's/pending_review/changes_requested/' "$PR_FILE"
        ;;
    3)
        # 拒绝
        echo ""
        echo "请输入拒绝原因（一行，按回车确认）:"
        read -r REASONS

        cat > "$REVIEW_FILE" << EOF
# PR 审核结果：$TICKET_ID

**审核者**: Master Agent
**审核时间**: $(date -Iseconds)
**结果**: ❌ 拒绝

---

## 拒绝原因

$REASONS

---

## 审查维度详情

- 测试门禁：$([ "$TEST_GATE_PASSED" = true ] && echo "✓ 通过" || echo "⚠ 未通过")
- 架构评审：$([ "${ARCH_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${ARCH_SCORE:-N/A}/5)" || echo "⚠ 需改进 (${ARCH_SCORE:-N/A}/5)")
- 安全评审：$([ "${SECURITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${SECURITY_SCORE:-N/A}/5)" || echo "✗ 需修复 (${SECURITY_SCORE:-N/A}/5)")
- 性能评审：$([ "${PERFORMANCE_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${PERFORMANCE_SCORE:-N/A}/5)" || echo "⚠ 需优化 (${PERFORMANCE_SCORE:-N/A}/5)")
- 代码质量：$([ "${QUALITY_STATUS:-fail}" = "pass" ] && echo "✓ 通过 (${QUALITY_SCORE:-N/A}/5)" || echo "⚠ 需改进 (${QUALITY_SCORE:-N/A}/5)")
- Roadmap 对齐：$([ "${ROADMAP_STATUS:-pass}" = "pass" ] && echo "✓ 对齐 (${ROADMAP_SCORE:-N/A}/5)" || echo "⚠ 需关注 (${ROADMAP_SCORE:-N/A}/5)")

## 评审报告

- 专家评审：${EXPERT_REPORT:-未生成}
- Roadmap 对齐：${ROADMAP_REPORT:-未生成}

## 建议

需要重新设计方案后再次提交。

---

**状态**: rejected
EOF
        echo -e "${RED}✓${NC} PR 已拒绝"

        # 更新 PR 文件状态
        sed -i '' 's/pending_review/rejected/' "$PR_FILE" 2>/dev/null || \
        sed -i 's/pending_review/rejected/' "$PR_FILE"
        ;;
    *)
        echo "无效选择，已取消"
        exit 0
        ;;
esac

echo -e "${GREEN}✓${NC} 审核结果已保存：$REVIEW_FILE"
echo ""

# 发送消息通知 Slaver
MESSAGE_DIR="shared/message_queue/inbox"
mkdir -p "$MESSAGE_DIR"

MSG_FILE="$MESSAGE_DIR/pr_review_result_$(date +%Y%m%d_%H%M%S).json"

RESULT_STATUS=$(grep -m1 "^**结果" "$REVIEW_FILE" | cut -d':' -f2 | tr -d ' ')

cat > "$MSG_FILE" << EOF
{
  "id": "msg_$(date +%Y%m%d_%H%M%S)",
  "timestamp": "$(date -Iseconds)",
  "from": "master",
  "to": "slaver_$TICKET_ID",
  "type": "pr_review_result",
  "priority": "high",
  "payload": {
    "ticket_id": "$TICKET_ID",
    "result": "$RESULT_STATUS",
    "review_file": "$REVIEW_FILE",
    "summary": "PR 审核结果：$RESULT_STATUS"
  }
}
EOF

echo -e "${GREEN}✓${NC} 审核结果消息已发送"
echo ""

# 更新 Ticket 状态
TICKET_FILE="jira/tickets/feature/${TICKET_ID}.md"

if [ -f "$TICKET_FILE" ]; then
    case "$CHOICE" in
        1)
            # 批准 - 等待合并
            echo -e "${GREEN}✓${NC} Ticket 状态将更新为 approved"
            ;;
        2|3)
            # 需要修改或拒绝 - 返回 dev 状态
            sed -i '' "s/^状态：review/状态：dev/" "$TICKET_FILE" 2>/dev/null || \
            sed -i "s/^状态：review/状态：dev/" "$TICKET_FILE"
            echo -e "${GREEN}✓${NC} Ticket 状态已更新为 dev（需要修改）"
            ;;
    esac
fi

echo ""

# 如果是批准，询问是否合并
if [ "$CHOICE" = "1" ]; then
    echo -e "${BLUE}## 步骤 5: 合并到 testing 分支${NC}"
    echo ""
    echo "是否现在合并到 testing 分支？[y/N]"
    read -r MERGE_CONFIRM

    if [[ "$MERGE_CONFIRM" =~ ^[Yy]$ ]]; then
        echo "合并到 testing 分支..."
        git checkout testing 2>/dev/null || git checkout -b testing
        git merge "$BRANCH" -m "merge($TICKET_ID): merge PR into testing"
        git push origin testing
        echo -e "${GREEN}✓${NC} 已合并到 testing 分支"
    fi
fi

echo ""

# 总结
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  PR 审核完成                                                  │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  Ticket: $TICKET_ID"
echo "│  结果：$(grep -m1 "^**结果" "$REVIEW_FILE" | cut -d':' -f2)"
echo "│                                                              │"
if [ "$CHOICE" = "1" ]; then
    echo "│  下一步：运行 /eket-merge 合并到 main 分支"
else
    echo "│  下一步：等待 Slaver 修改后重新提交 PR"
fi
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

echo "========================================"
echo "PR 审核完成"
echo "========================================"
