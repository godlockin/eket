#!/bin/bash
# scripts/finalize-review.sh - 汇总所有 Subagent 审查结果，生成最终 Review 报告

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "Finalize Review - 汇总审查结果"
echo "========================================"
echo ""

# 检查参数
TICKET_ID="${1:-}"

if [ -z "$TICKET_ID" ]; then
    echo -e "${RED}用法：$0 <ticket-id>${NC}"
    exit 1
fi

# 检查共享记忆目录
SHARED_MEMORY_DIR=".eket/state/shared-memory/reviews/${TICKET_ID}"
if [ ! -d "$SHARED_MEMORY_DIR" ]; then
    echo -e "${RED}错误：Review 未初始化${NC}"
    echo "请先运行：./scripts/init-review-subagents.sh $TICKET_ID"
    exit 1
fi

COORDINATOR_FILE="$SHARED_MEMORY_DIR/coordinator.yml"
REVIEW_REPORT="$SHARED_MEMORY_DIR/review-report.md"

echo -e "${BLUE}## 收集 Subagent 审查结果${NC}"
echo ""

# 定义 Subagent 角色
declare -a SUBAGENT_ROLES=(
    "code_reviewer:代码审查员:0.40"
    "test_reviewer:测试审查员:0.25"
    "security_reviewer:安全审查员:0.25"
    "doc_reviewer:文档审查员:0.10"
)

# 收集结果
TOTAL_SCORE=0
TOTAL_WEIGHTED_SCORE=0
ALL_COMPLETE=true

declare -A SCORES
declare -A STATUSES

for role_info in "${SUBAGENT_ROLES[@]}"; do
    IFS=':' read -r role_id role_name weight <<< "$role_info"

    RESULT_FILE="$SHARED_MEMORY_DIR/$role_id/review-result.yml"
    STATUS_FILE="$SHARED_MEMORY_DIR/$role_id/status.yml"

    if [ -f "$RESULT_FILE" ]; then
        # 提取评分
        SCORE=$(grep "^score:" "$RESULT_FILE" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
        if [ -z "$SCORE" ]; then
            SCORE="N/A"
            ALL_COMPLETE=false
        else
            SCORES[$role_id]=$SCORE
            WEIGHTED=$(echo "$SCORE * $weight" | bc 2>/dev/null || echo "0")
            TOTAL_WEIGHTED_SCORE=$(echo "$TOTAL_WEIGHTED_SCORE + $WEIGHTED" | bc 2>/dev/null || echo "$TOTAL_WEIGHTED_SCORE")
        fi
        STATUSES[$role_id]="complete"
        echo -e "  ${GREEN}✓${NC} $role_name: $SCORE/10"
    else
        SCORES[$role_id]="N/A"
        STATUSES[$role_id]="pending"
        ALL_COMPLETE=false
        echo -e "  ${YELLOW}!${NC} $role_name: 未完成"
    fi
done

echo ""

if [ "$ALL_COMPLETE" = false ]; then
    echo -e "${YELLOW}警告：部分 Subagent 审查未完成${NC}"
    echo "是否继续生成报告？(y/n)"
    read -r response
    if [ "$response" != "y" ]; then
        exit 0
    fi
fi

# 计算总分
FINAL_SCORE=$(printf "%.1f" "$TOTAL_WEIGHTED_SCORE")

echo -e "${BLUE}## 综合评分${NC}"
echo "总分：$FINAL_SCORE / 10"
echo ""

# 确定审查结果
if (( $(echo "$FINAL_SCORE >= 8" | bc -l) )); then
    REVIEW_RESULT="approved"
    REVIEW_DECISION="批准 - 代码质量优秀，可以合并"
elif (( $(echo "$FINAL_SCORE >= 6" | bc -l) )); then
    REVIEW_RESULT="conditional_approved"
    REVIEW_DECISION="有条件批准 - 有 Minor 问题，修复后可直接合并"
elif (( $(echo "$FINAL_SCORE >= 4" | bc -l) )); then
    REVIEW_RESULT="changes_requested"
    REVIEW_DECISION="需要修改 - 有 Major 问题，修复后需重新审查"
else
    REVIEW_RESULT="rejected"
    REVIEW_DECISION="拒绝 - 存在严重问题，需重新设计"
fi

echo -e "${BLUE}## 审查结果${NC}"
echo "结果：$REVIEW_RESULT"
echo "决策：$REVIEW_DECISION"
echo ""

# 生成最终报告
COMPLETED_AT=$(date -Iseconds)

cat > "$REVIEW_REPORT" << EOF
# Review 报告 - $TICKET_ID

**Review ID**: review-${TICKET_ID}-$(date +%Y%m%d)
**Master**: $(grep "master_id:" "$COORDINATOR_FILE" | cut -d: -f2 | tr -d ' ')
**开始时间**: $(grep "started_at:" "$COORDINATOR_FILE" | cut -d: -f2 | tr -d ' ')
**完成时间**: $COMPLETED_AT

---

## 审查结果汇总

**综合评分**: $FINAL_SCORE / 10
**审查结果**: $REVIEW_RESULT
**决策**: $REVIEW_DECISION

---

## Subagents 评分详情

| Subagent | 角色 | 评分 | 权重 | 加权分 |
|----------|------|------|------|--------|
| code_reviewer-${TICKET_ID} | 代码审查员 | ${SCORES[code_reviewer]:-N/A} | 40% | $(echo "${SCORES[code_reviewer]:-0} * 0.40" | bc 2>/dev/null || echo "N/A") |
| test_reviewer-${TICKET_ID} | 测试审查员 | ${SCORES[test_reviewer]:-N/A} | 25% | $(echo "${SCORES[test_reviewer]:-0} * 0.25" | bc 2>/dev/null || echo "N/A") |
| security_reviewer-${TICKET_ID} | 安全审查员 | ${SCORES[security_reviewer]:-N/A} | 25% | $(echo "${SCORES[security_reviewer]:-0} * 0.25" | bc 2>/dev/null || echo "N/A") |
| doc_reviewer-${TICKET_ID} | 文档审查员 | ${SCORES[doc_reviewer]:-N/A} | 10% | $(echo "${SCORES[doc_reviewer]:-0} * 0.10" | bc 2>/dev/null || echo "N/A") |

---

## 各维度详情

### 代码审查员
EOF

if [ -f "$SHARED_MEMORY_DIR/code_reviewer/review-result.yml" ]; then
    cat "$SHARED_MEMORY_DIR/code_reviewer/review-result.yml" >> "$REVIEW_REPORT"
else
    echo "*未完成审查*" >> "$REVIEW_REPORT"
fi

cat >> "$REVIEW_REPORT" << EOF

### 测试审查员
EOF

if [ -f "$SHARED_MEMORY_DIR/test_reviewer/review-result.yml" ]; then
    cat "$SHARED_MEMORY_DIR/test_reviewer/review-result.yml" >> "$REVIEW_REPORT"
else
    echo "*未完成审查*" >> "$REVIEW_REPORT"
fi

cat >> "$REVIEW_REPORT" << EOF

### 安全审查员
EOF

if [ -f "$SHARED_MEMORY_DIR/security_reviewer/review-result.yml" ]; then
    cat "$SHARED_MEMORY_DIR/security_reviewer/review-result.yml" >> "$REVIEW_REPORT"
else
    echo "*未完成审查*" >> "$REVIEW_REPORT"
fi

cat >> "$REVIEW_REPORT" << EOF

### 文档审查员
EOF

if [ -f "$SHARED_MEMORY_DIR/doc_reviewer/review-result.yml" ]; then
    cat "$SHARED_MEMORY_DIR/doc_reviewer/review-result.yml" >> "$REVIEW_REPORT"
else
    echo "*未完成审查*" >> "$REVIEW_REPORT"
fi

cat >> "$REVIEW_REPORT" << EOF

---

## Master 最终决策

- [x] **审查完成**

**决策**: $REVIEW_DECISION

**Master 意见**:
<!-- Master 在此填写最终意见 -->

---

**审查完成时间**: $COMPLETED_AT
EOF

echo -e "${GREEN}✓ 审查报告已生成：$REVIEW_REPORT${NC}"

# 更新协调器状态
cat > "$COORDINATOR_FILE" << EOF
# Review 协调器状态
review_id: review-${TICKET_ID}-$(date +%Y%m%d)
ticket_id: $TICKET_ID

# Review 状态
status:
  overall: completed
  completed_at: $COMPLETED_AT

# Subagents 注册表
subagents:
  - id: code_reviewer-${TICKET_ID}
    role: code_reviewer
    status: ${STATUSES[code_reviewer]:-pending}
    score: ${SCORES[code_reviewer]:-N/A}
  - id: test_reviewer-${TICKET_ID}
    role: test_reviewer
    status: ${STATUSES[test_reviewer]:-pending}
    score: ${SCORES[test_reviewer]:-N/A}
  - id: security_reviewer-${TICKET_ID}
    role: security_reviewer
    status: ${STATUSES[security_reviewer]:-pending}
    score: ${SCORES[security_reviewer]:-N/A}
  - id: doc_reviewer-${TICKET_ID}
    role: doc_reviewer
    status: ${STATUSES[doc_reviewer]:-pending}
    score: ${SCORES[doc_reviewer]:-N/A}

# 审查结果汇总
summary:
  all_passed: $ALL_COMPLETE
  total_score: $FINAL_SCORE
  result: $REVIEW_RESULT
  decision: $REVIEW_DECISION

# 共享记忆
shared_memory:
  sync_count: 1
  last_sync: $COMPLETED_AT
EOF

echo -e "${GREEN}✓ 协调器状态已更新${NC}"
echo ""

# 更新 Ticket 状态
TICKET_FILE=$(find jira/tickets -name "${TICKET_ID}.md" 2>/dev/null | head -1)
if [ -n "$TICKET_FILE" ] && [ -f "$TICKET_FILE" ]; then
    # 更新状态
    if [ "$REVIEW_RESULT" = "approved" ] || [ "$REVIEW_RESULT" = "conditional_approved" ]; then
        sed -i.bak "s/^status:.*/status: passed/" "$TICKET_FILE"
    else
        sed -i.bak "s/^status:.*/status: changes_requested/" "$TICKET_FILE"
    fi
    rm -f "$TICKET_FILE.bak"
    echo -e "${GREEN}✓ Ticket 状态已更新${NC}"
fi

echo ""
echo -e "${GREEN}========================================"
echo "Review 汇总完成"
echo "========================================${NC}"
echo ""
echo "审查报告：$REVIEW_REPORT"
echo "综合评分：$FINAL_SCORE / 10"
echo "审查结果：$REVIEW_RESULT"
echo "决策：$REVIEW_DECISION"
echo ""
