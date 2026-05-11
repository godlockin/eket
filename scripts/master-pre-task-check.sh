#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Master Pre-Task Check Script
# ============================================================================
# 功能: Master 分配任务前强制检查，避免重复/依赖缺失
# 用法: bash scripts/master-pre-task-check.sh <TASK-ID>
# 退出码: 0=通过, 1=致命错误, 2=警告(可继续)
# ============================================================================

TICKET_ID="${1:-}"
EXIT_CODE=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查参数
if [[ -z "$TICKET_ID" ]]; then
  echo -e "${RED}❌ 用法: $0 <TICKET-ID>${NC}"
  exit 1
fi

TICKET_FILE="jira/tickets/$TICKET_ID.md"

echo "=== Master Pre-Task Check: $TICKET_ID ==="
echo ""

# ============================================================================
# 检查 1: Ticket 文件存在性
# ============================================================================
if [[ ! -f "$TICKET_FILE" ]]; then
  echo -e "${RED}❌ FATAL: Ticket 文件不存在: $TICKET_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Ticket 文件存在"

# ============================================================================
# 检查 2: 依赖文件/目录存在性检查
# ============================================================================
echo ""
echo "检查依赖文件..."

# 提取 AC 中创建/修改的文件路径
TEMP_FILES=$(mktemp)
trap 'rm -f "$TEMP_FILES"' EXIT

# 查找"创建"操作的文件（不应存在）
grep -E "创建.*\`[^\`]+\`" "$TICKET_FILE" | \
  grep -oE "\`[^\`]+\`" | \
  tr -d '`' > "$TEMP_FILES" || true

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if [[ -e "$file" ]]; then
    echo -e "${RED}❌ 重复任务: $file 已存在（任务要求创建）${NC}"
    EXIT_CODE=1
  fi
done < "$TEMP_FILES"

# 查找"修改"操作的文件（必须存在）
grep -E "修改.*\`[^\`]+\`" "$TICKET_FILE" | \
  grep -oE "\`[^\`]+\`" | \
  tr -d '`' > "$TEMP_FILES" || true

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if [[ ! -e "$file" ]]; then
    echo -e "${RED}❌ 依赖缺失: $file 不存在（任务要求修改）${NC}"
    EXIT_CODE=1
  fi
done < "$TEMP_FILES"

# 查找"删除"操作的文件（必须存在）
grep -E "删除.*\`[^\`]+\`" "$TICKET_FILE" | \
  grep -oE "\`[^\`]+\`" | \
  tr -d '`' > "$TEMP_FILES" || true

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if [[ ! -e "$file" ]]; then
    echo -e "${RED}❌ 依赖缺失: $file 不存在（任务要求删除）${NC}"
    EXIT_CODE=1
  fi
done < "$TEMP_FILES"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✓${NC} 依赖检查通过"
fi

# ============================================================================
# 检查 3: 重复任务检测（相同标题）
# ============================================================================
echo ""
echo "检查重复任务..."

TITLE=$(grep "^# " "$TICKET_FILE" | head -1 | sed 's/^# //' | sed "s/$TICKET_ID: //")

if [[ -n "$TITLE" ]]; then
  EXISTING=$(grep -rl "^# .*$TITLE" jira/tickets/*.md 2>/dev/null | \
    grep -v "$TICKET_ID" || true)

  if [[ -n "$EXISTING" ]]; then
    echo -e "${YELLOW}⚠️  可能重复任务（标题相似）:${NC}"
    echo "$EXISTING" | sed 's|^|  - |'

    # 警告但不阻止（退出码 2）
    if [[ $EXIT_CODE -eq 0 ]]; then
      EXIT_CODE=2
    fi
  else
    echo -e "${GREEN}✓${NC} 未发现重复任务"
  fi
else
  echo -e "${YELLOW}⚠️  无法提取标题，跳过重复检测${NC}"
fi

# ============================================================================
# 检查 4: 文件归属预检（新建文件路径合规）
# ============================================================================
echo ""
echo "检查文件归属合规性..."

# 提取所有要创建的文件
grep -E "创建.*\`[^\`]+\`" "$TICKET_FILE" | \
  grep -oE "\`[^\`]+\`" | \
  tr -d '`' > "$TEMP_FILES" || true

VIOLATIONS=""
while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  # 检查禁止路径（MASTER-RULES 文件归属规则）
  if [[ "$file" =~ ^(EPIC|TASK|FEAT|FIX)-.*\.md$ ]] && [[ ! "$file" =~ ^jira/ ]]; then
    VIOLATIONS+="  - $file (应在 jira/ 目录)\n"
  fi

  if [[ "$file" =~ ^Dockerfile$ ]] || [[ "$file" =~ ^docker-compose ]]; then
    VIOLATIONS+="  - $file (基础设施文件，需 Master 审批)\n"
  fi
done < "$TEMP_FILES"

if [[ -n "$VIOLATIONS" ]]; then
  echo -e "${RED}❌ 文件归属违规:${NC}"
  echo -e "$VIOLATIONS"
  EXIT_CODE=1
else
  echo -e "${GREEN}✓${NC} 文件归属合规"
fi

# ============================================================================
# 汇总输出
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}✅ Pre-task check passed${NC}"
elif [[ $EXIT_CODE -eq 2 ]]; then
  echo -e "${YELLOW}⚠️  Pre-task check passed with warnings${NC}"
  echo "  (可继续，但建议检查警告项)"
else
  echo -e "${RED}❌ Pre-task check FAILED${NC}"
  echo "  (发现致命错误，禁止分配任务)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $EXIT_CODE
