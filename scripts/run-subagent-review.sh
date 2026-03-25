#!/bin/bash
# scripts/run-subagent-review.sh - 执行单个 Subagent 的审查任务

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "Subagent Review - $2"
echo "========================================"
echo ""

# 检查参数
TICKET_ID="${1:-}"
SUBAGENT_ROLE="${2:-}"

if [ -z "$TICKET_ID" ] || [ -z "$SUBAGENT_ROLE" ]; then
    echo -e "${RED}用法：$0 <ticket-id> <subagent-role>${NC}"
    echo ""
    echo "参数:"
    echo "  ticket-id       待 Review 的任务 ID"
    echo "  subagent-role   Subagent 角色 (code_reviewer/test_reviewer/security_reviewer/doc_reviewer)"
    exit 1
fi

# 验证角色
case $SUBAGENT_ROLE in
    code_reviewer|test_reviewer|security_reviewer|doc_reviewer)
        ;;
    *)
        echo -e "${RED}错误：无效的角色：$SUBAGENT_ROLE${NC}"
        echo "有效角色：code_reviewer, test_reviewer, security_reviewer, doc_reviewer"
        exit 1
        ;;
esac

# 检查共享记忆目录是否存在
SHARED_MEMORY_DIR=".eket/state/shared-memory/reviews/${TICKET_ID}/${SUBAGENT_ROLE}"
if [ ! -d "$SHARED_MEMORY_DIR" ]; then
    echo -e "${RED}错误：Subagent 未初始化${NC}"
    echo "请先运行：./scripts/init-review-subagents.sh $TICKET_ID"
    exit 1
fi

STATUS_FILE="$SHARED_MEMORY_DIR/status.yml"
CHECKLIST_FILE="$SHARED_MEMORY_DIR/checklist.md"

echo -e "${BLUE}## Subagent 信息${NC}"
echo "角色：$SUBAGENT_ROLE"
echo "任务：$TICKET_ID"
echo "状态文件：$STATUS_FILE"
echo ""

# 更新状态为 analyzing
echo -e "${BLUE}## 更新状态为 analyzing${NC}"
sed -i.bak "s/status: initialized/status: analyzing/" "$STATUS_FILE"
sed -i.bak "s/started_at: null/started_at: $(date -Iseconds)/" "$STATUS_FILE"
rm -f "$STATUS_FILE.bak"
echo -e "  ${GREEN}✓${NC} 状态已更新"
echo ""

# 显示审查清单
echo -e "${BLUE}## 审查清单${NC}"
echo ""
cat "$CHECKLIST_FILE"
echo ""

echo -e "${YELLOW}========================================"
echo "请根据审查清单逐项检查"
echo "========================================${NC}"
echo ""

# 创建审查结果临时文件
RESULT_FILE="$SHARED_MEMORY_DIR/review-result.yml"

echo "请输入审查结果:"
echo ""

# 评分
echo -n "评分 (1-10): "
read SCORE

if ! [[ "$SCORE" =~ ^[0-9]+$ ]] || [ "$SCORE" -lt 1 ] || [ "$SCORE" -gt 10 ]; then
    echo -e "${RED}错误：无效的评分${NC}"
    exit 1
fi

# 审查意见
echo ""
echo "审查意见 (可多选，每行一条，空行结束):"
COMMENTS=()
while IFS= read -r line; do
    [ -z "$line" ] && break
    COMMENTS+=("$line")
done

# 问题列表
echo ""
echo "发现的问题 (格式：严重性：描述，每行一个，空行结束):"
ISSUES=()
while IFS= read -r line; do
    [ -z "$line" ] && break
    ISSUES+=("$line")
done

# 建议
echo ""
echo "改进建议 (每行一条，空行结束):"
RECOMMENDATIONS=()
while IFS= read -r line; do
    [ -z "$line" ] && break
    RECOMMENDATIONS+=("$line")
done

# 生成审查结果
cat > "$RESULT_FILE" << EOF
# Subagent 审查结果

**Subagent**: $SUBAGENT_ROLE-${TICKET_ID}
**任务**: $TICKET_ID
**完成时间**: $(date -Iseconds)

---

## 审查结果

**评分**: $SCORE / 10

## 审查意见

$(printf '%s\n' "${COMMENTS[@]}")

## 发现的问题

$(printf '%s\n' "${ISSUES[@]}")

## 改进建议

$(printf '%s\n' "${RECOMMENDATIONS[@]}")

---

## YAML 格式 (供机器读取)

score: $SCORE
status: complete
completed_at: $(date -Iseconds)
comments:
$(for comment in "${COMMENTS[@]}"; do echo "  - \"$comment\""; done)
issues:
$(for issue in "${ISSUES[@]}"; do echo "  - \"$issue\""; done)
recommendations:
$(for rec in "${RECOMMENDATIONS[@]}"; do echo "  - \"$rec\""; done)
EOF

echo ""
echo -e "${GREEN}✓ 审查结果已保存：$RESULT_FILE${NC}"

# 更新状态文件
cat > "$STATUS_FILE" << EOF
# Subagent 状态文件
subagent_id: ${SUBAGENT_ROLE}-${TICKET_ID}
role: $SUBAGENT_ROLE
master_id: $(grep "master_id:" "$STATUS_FILE" | cut -d: -f2 | tr -d ' ')
ticket_id: $TICKET_ID

# 生命周期状态
lifecycle:
  status: complete
  created_at: $(grep "created_at:" "$STATUS_FILE" | cut -d: -f2 | tr -d ' ')
  started_at: $(grep "started_at:" "$STATUS_FILE" | cut -d: -f2 | tr -d ' ')
  completed_at: $(date -Iseconds)

# 审查结果
review:
  status: complete
  score: $SCORE
  completed_at: $(date -Iseconds)

# 共享记忆
shared_memory:
  version: 1
  last_sync: $(date -Iseconds)
EOF

echo -e "${GREEN}✓ 状态文件已更新${NC}"
echo ""
echo "审查完成！"
