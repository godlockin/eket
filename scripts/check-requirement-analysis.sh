#!/usr/bin/env bash
# check-requirement-analysis.sh — 机械校验 Master 需求分析交付物
#
# 用法:
#   bash scripts/check-requirement-analysis.sh <EPIC-ID>            # 校验单个 EPIC
#   bash scripts/check-requirement-analysis.sh --all                # 校验所有 EPIC
#   bash scripts/check-requirement-analysis.sh --staged             # pre-commit: 仅检查 staged 的新 EPIC 目录
#
# 依据: template/docs/EXPERT-PANEL-PLAYBOOK.md §1.2 + §5
#
# Exit codes:
#   0 — 全部通过
#   1 — 有 EPIC 未通过
#   2 — 参数错误

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

fail_count=0
pass_count=0

# 六节必填 heading（正则匹配 Markdown 标题行）
REQUIRED_SECTIONS=(
  '^## 1\. 原始诉求'
  '^## 2\. 受益人 × 场景矩阵'
  '^## 3\. 验收标准'
  '^## 4\. 非目标'
  '^## 5\. 未知与假设'
  '^## 6\. 风险与缓解'
)
SECTION_NAMES=(
  "§1 原始诉求"
  "§2 受益人×场景"
  "§3 验收标准 (AC)"
  "§4 非目标"
  "§5 未知/假设"
  "§6 风险/缓解"
)

check_epic() {
  local epic_dir="$1"
  local epic_id
  epic_id="$(basename "$epic_dir")"
  local ra_file="$epic_dir/requirement-analysis.md"
  local epic_failed=0

  echo ""
  echo "═══ ${epic_id} ═══"

  if [[ ! -f "$ra_file" ]]; then
    echo "  ${RED}✗${NC} 缺失 requirement-analysis.md"
    echo "     路径: $ra_file"
    echo "     参考: template/docs/EXPERT-PANEL-PLAYBOOK.md §1.2"
    fail_count=$((fail_count + 1))
    return 1
  fi

  # 1) 六节存在
  for i in "${!REQUIRED_SECTIONS[@]}"; do
    local pattern="${REQUIRED_SECTIONS[$i]}"
    local name="${SECTION_NAMES[$i]}"
    if ! grep -qE "$pattern" "$ra_file"; then
      echo "  ${RED}✗${NC} 缺失章节: ${name}"
      epic_failed=1
    fi
  done

  # 2) 六节非空 (每个 ## 之后至少有一行实质内容，不是仅留下一个 ##)
  local empty_sections
  empty_sections=$(awk '
    /^## / { if (prev_section && !seen_content) print prev_section; prev_section=$0; seen_content=0; next }
    /^[^[:space:]]/ { seen_content=1; next }
    /^[[:space:]]*[-|>a-zA-Z0-9]/ { seen_content=1 }
    END { if (prev_section && !seen_content) print prev_section }
  ' "$ra_file")
  if [[ -n "$empty_sections" ]]; then
    while IFS= read -r line; do
      echo "  ${RED}✗${NC} 章节空白: ${line}"
      epic_failed=1
    done <<< "$empty_sections"
  fi

  # 3) AC 必须包含 Given/When/Then 结构
  if ! grep -qE 'Given .+ When .+ Then' "$ra_file"; then
    echo "  ${RED}✗${NC} §3 验收标准未使用 Given/When/Then 句式"
    epic_failed=1
  fi

  # 4) 未知/假设表: 至少有一行 U-* 或 A-*
  if ! grep -qE '^\| *[UA]-[0-9]+' "$ra_file"; then
    echo "  ${YELLOW}⚠${NC} §5 未知/假设表似乎为空（期望至少一行 U-1 或 A-1）"
    epic_failed=1
  fi

  # 5) INVEST: 每个 ticket 至少有 agent_type + estimate_hours + acceptance_criteria
  local tickets_missing_fields=0
  while IFS= read -r -d '' ticket; do
    local tid
    tid="$(basename "$ticket" .md)"
    local missing=()
    grep -qE '^agent_type:' "$ticket" || missing+=("agent_type")
    grep -qE '^estimate_hours:|^estimated_hours:' "$ticket" || missing+=("estimate_hours")
    grep -qE 'acceptance_criteria|验收标准' "$ticket" || missing+=("acceptance_criteria")
    grep -qE 'rollback_plan|回滚' "$ticket" || missing+=("rollback_plan")
    grep -qE 'observability|可观测|logs:|metrics:' "$ticket" || missing+=("observability")

    # 5b) estimate_hours 数值上限 ≤ 16
    local hours
    hours=$(grep -E '^estimate_hours:|^estimated_hours:' "$ticket" | head -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
    if [[ -n "$hours" ]]; then
      # shellcheck disable=SC2072
      if awk -v h="$hours" 'BEGIN{ exit !(h+0 > 16) }'; then
        echo "  ${RED}✗${NC} ticket ${tid} estimate_hours=${hours} 超过 16h 上限 (EXPERT-PANEL-PLAYBOOK.md §3.2)"
        epic_failed=1
      fi
    fi

    if (( ${#missing[@]} > 0 )); then
      echo "  ${RED}✗${NC} ticket ${tid} 缺字段: ${missing[*]}"
      tickets_missing_fields=$((tickets_missing_fields + 1))
      epic_failed=1
    fi
  done < <(find "$epic_dir" -maxdepth 1 -name '[A-Z]*-[0-9]*.md' -not -name 'requirement-analysis.md' -type f -print0 2>/dev/null)

  # 6) 专家组记录存在性: 若 requirement-analysis.md 声明 expert_panel: required，必须引用一份 docs/reviews/ 文件
  if grep -qE '^expert_panel:[[:space:]]*required' "$ra_file" 2>/dev/null \
     || grep -qE '<!--[[:space:]]*expert_panel:[[:space:]]*required[[:space:]]*-->' "$ra_file" 2>/dev/null; then
    local review_refs
    review_refs=$(grep -oE 'docs/reviews/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+\.md' "$ra_file" | sort -u)
    if [[ -z "$review_refs" ]]; then
      echo "  ${RED}✗${NC} expert_panel=required 但未引用 docs/reviews/YYYY-MM-DD-*.md (EXPERT-PANEL-PLAYBOOK.md §4.2)"
      epic_failed=1
    else
      while IFS= read -r ref; do
        if [[ ! -f "$ref" ]]; then
          echo "  ${RED}✗${NC} 引用的专家组记录不存在: ${ref}"
          epic_failed=1
        fi
      done <<< "$review_refs"
    fi
  fi

  if (( epic_failed == 0 )); then
    echo "  ${GREEN}✓${NC} requirement-analysis.md 六节齐全 + AC 格式正确 + 所有 ticket INVEST 字段齐全"
    pass_count=$((pass_count + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  return "$epic_failed"
}

mode="${1:-}"
case "$mode" in
  --all)
    shopt -s nullglob
    found=0
    for d in jira/epics/*/ jira/tickets/EPIC-*/; do
      [[ -d "$d" ]] || continue
      found=1
      check_epic "${d%/}"
    done
    if (( found == 0 )); then
      echo "${YELLOW}(no EPIC directories found under jira/epics/ or jira/tickets/EPIC-*)${NC}"
    fi
    ;;
  --staged)
    # pre-commit: 仅校验有新增文件的 EPIC 目录
    staged=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep -E '^jira/(epics|tickets)/EPIC-[^/]+/' | awk -F/ '{print $1"/"$2"/"$3}' | sort -u)
    if [[ -z "$staged" ]]; then
      exit 0  # 没有新 EPIC 文件，pass
    fi
    while IFS= read -r epic_dir; do
      [[ -d "$epic_dir" ]] && check_epic "$epic_dir"
    done <<< "$staged"
    ;;
  '' | -h | --help)
    echo "用法:"
    echo "  $0 <EPIC-ID>      # e.g. EPIC-001"
    echo "  $0 --all          # 所有 EPIC"
    echo "  $0 --staged       # pre-commit 模式"
    exit 2
    ;;
  *)
    # 单个 EPIC-ID
    epic_dir=""
    for candidate in "jira/epics/$mode" "jira/tickets/$mode"; do
      if [[ -d "$candidate" ]]; then
        epic_dir="$candidate"
        break
      fi
    done
    if [[ -z "$epic_dir" ]]; then
      echo "${RED}✗ EPIC directory not found: $mode${NC}"
      echo "  tried: jira/epics/$mode, jira/tickets/$mode"
      exit 2
    fi
    check_epic "$epic_dir"
    ;;
esac

echo ""
echo "═══ 汇总 ═══"
echo "  通过: ${GREEN}${pass_count}${NC}"
echo "  失败: ${RED}${fail_count}${NC}"

if (( fail_count > 0 )); then
  echo ""
  echo "${RED}✗ 需求分析未通过验收${NC}"
  echo "修正参考: template/docs/EXPERT-PANEL-PLAYBOOK.md §1.2 + §3.2 + §5"
  exit 1
fi

exit 0
