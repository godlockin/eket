#!/usr/bin/env bash
# shellcheck shell=bash
# validate-ticket-template.sh — 防止 ticket 模板偏移
# 检查 jira/tickets/ 下所有 ticket 文件的必要字段完整性
# 用法: ./scripts/validate-ticket-template.sh [--dir <tickets_dir>] [--strict]
# 退出码: 0=全部通过, 1=有 FAIL, 2=参数错误

set -euo pipefail

# ─── 颜色输出 ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
BOLD='\033[1m'; CYAN='\033[0;36m'

# ─── 默认参数 ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TICKETS_DIR="$REPO_ROOT/jira/tickets"
STRICT=false
FAIL_COUNT=0
WARN_COUNT=0
INFO_COUNT=0
PASS_COUNT=0
TOTAL=0

# ─── 参数解析 ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)  TICKETS_DIR="$2"; shift 2 ;;
    --strict) STRICT=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--dir <tickets_dir>] [--strict]"
      echo "  --dir     指定 tickets 目录（默认: jira/tickets/）"
      echo "  --strict  警告也视为失败"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
done

# ─── 工具函数 ─────────────────────────────────────────────────────────────────
# 检查文件内容是否匹配模式（兼容 macOS BSD grep）
file_has() {
  local pattern="$1"
  local file="$2"
  grep -qE "$pattern" "$file" 2>/dev/null
}

# 提取匹配行
file_grep() {
  local pattern="$1"
  local file="$2"
  grep -nE "$pattern" "$file" 2>/dev/null || true
}

# ─── TBD/TODO 检测（与 gate:review CLI 对齐）────────────────────────────────
check_tbd() {
  local file="$1"
  # 排除注释行和模板占位符
  grep -nE '\bTBD\b|\bTODO\b' "$file" 2>/dev/null \
    | grep -vE '^[0-9]+:(\s*#|<!--.*-->|\{\{.*\}\})' \
    | grep -vE 'gate_review_veto_count|veto_reason|resubmit_conditions' \
    | grep -vE '或\s*TODO|TODO\s*）|TODO\s*\)|or TODO|注释或' \
    || true
}

# ─── 单文件验证 ───────────────────────────────────────────────────────────────
validate_ticket() {
  local file="$1"
  local filename
  filename=$(basename "$file")
  local ticket_fail=0
  local ticket_warn=0
  local ticket_info=0
  local issues=()

  # 读取文件内容
  local content
  content=$(cat "$file")

  # ── 提取 Ticket ID（支持两种格式）──────────────────────────────────────────
  # 格式 1: # TASK-001: 标题
  # 格式 2: **Ticket ID**: TASK-001
  local ticket_id=""
  ticket_id=$(echo "$content" | grep -oE '^#\s+[A-Z]+-[0-9]+' | head -1 | grep -oE '[A-Z]+-[0-9]+' || true)
  if [[ -z "$ticket_id" ]]; then
    ticket_id=$(echo "$content" | grep -oE '\*\*Ticket ID\*\*:\s*\S+' | head -1 | grep -oE '[A-Z]+-[0-9]+' || true)
  fi

  # ── 提取状态 ───────────────────────────────────────────────────────────────
  local status=""
  status=$(echo "$content" | grep -oE '\*\*(状态|status)\*\*:\s*\S+' | head -1 | grep -oE ':\s*\S+' | sed 's/^:\s*//' || true)
  if [[ -z "$status" ]]; then
    # 格式: **状态**: value
    status=$(echo "$content" | grep -E '^\*\*(状态|status)\*\*:' | head -1 | sed 's/.*:\s*//' | tr -d ' ' || true)
  fi

  # ── 必要字段检查 ────────────────────────────────────────────────────────────

  # 1. Ticket ID
  if [[ -z "$ticket_id" ]]; then
    issues+=("  ${RED}[FAIL]${RESET} 缺少 Ticket ID（格式: # TASK-001: 标题 或 **Ticket ID**: TASK-001）")
    ticket_fail=$((ticket_fail + 1))
  fi

  # 2. 标题（H1 标题）
  if ! file_has '^#\s+\S' "$file"; then
    issues+=("  ${RED}[FAIL]${RESET} 缺少 H1 标题")
    ticket_fail=$((ticket_fail + 1))
  fi

  # 3. 状态字段
  if [[ -z "$status" ]]; then
    issues+=("  ${RED}[FAIL]${RESET} 缺少状态字段（**状态**: backlog|analysis|ready|gate_review|in_progress|...）")
    ticket_fail=$((ticket_fail + 1))
  fi

  # 4. 优先级（WARN）
  if ! file_has '\*\*(优先级|priority)\*\*:' "$file"; then
    issues+=("  ${YELLOW}[WARN]${RESET} 建议添加优先级字段（P0/P1/P2/P3）")
    ticket_warn=$((ticket_warn + 1))
  fi

  # 5. 验收标准（支持 ## 验收标准 或 **验收标准** 格式）
  if ! file_has '(##\s*[0-9.]*\s*(验收标准|Acceptance Criteria)|\*\*验收标准\*\*)' "$file"; then
    issues+=("  ${RED}[FAIL]${RESET} 缺少验收标准（## 验收标准 section），gate:review 会 VETO")
    ticket_fail=$((ticket_fail + 1))
  else
    # 验收标准有内容检查（取段落后3行，去注释）
    local ac_content
    ac_content=$(echo "$content" | grep -A8 -E '(##\s*[0-9.]*\s*(验收标准|Acceptance Criteria))' | grep -vE '^##\s*[0-9.]*\s*(验收标准|Acceptance Criteria)|^---' | grep -vE '^\s*$' | head -3 || true)
    if [[ ${#ac_content} -lt 10 ]]; then
      issues+=("  ${YELLOW}[WARN]${RESET} 验收标准内容过少（gate:review 可能 VETO）")
      ticket_warn=$((ticket_warn + 1))
    fi
  fi

  # 6. gate_review_veto_count（WARN，v2.2.0+ 字段）
  if ! file_has 'gate_review_veto_count' "$file"; then
    issues+=("  ${YELLOW}[WARN]${RESET} 建议添加 gate_review_veto_count 字段（v2.2.0+ 模板）")
    ticket_warn=$((ticket_warn + 1))
  fi

  # 7. in_progress 状态缺少 started_at（WARN）
  if [[ "${status// /}" == "in_progress" ]]; then
    local has_started_at=""
    has_started_at=$(echo "$content" | grep -oE '\*\*started_at\*\*:\s*\S+' | grep -vE '<!--' | head -1 || true)
    if [[ -z "$has_started_at" ]]; then
      issues+=("  ${YELLOW}[WARN]${RESET} in_progress 状态缺少 started_at 字段（Slaver 应在领取时填写）")
      ticket_warn=$((ticket_warn + 1))
    fi
  fi

  # 8. done 状态缺少 completed_at（WARN）
  if [[ "${status// /}" == "done" ]]; then
    local has_completed_at=""
    has_completed_at=$(echo "$content" | grep -oE '\*\*completed_at\*\*:\s*\S+' | grep -vE '<!--' | head -1 || true)
    if [[ -z "$has_completed_at" ]]; then
      issues+=("  ${YELLOW}[WARN]${RESET} done 状态缺少 completed_at 字段（影响 master:heartbeat 执行时长统计）")
      ticket_warn=$((ticket_warn + 1))
    fi
  fi

  # 9. Artifact Schema check for pr_review/test status
  if [[ "$status" == "pr_review" || "$status" == "test" ]]; then
    if ! file_has 'implementation_report:|test_result:' "$file"; then
      issues+=("  ${YELLOW}[WARN]${RESET} pr_review/test 状态缺少 implementation_report（建议填写 Artifact Schema v1）")
      ticket_warn=$((ticket_warn + 1))
    fi
  fi

  # 10. done 状态验收标准无可执行命令（INFO，不影响通过判断）
  if [[ "$status" == "done" ]]; then
    local ac_content
    ac_content=$(grep -A8 -E '##\s*[0-9.]*\s*(验收标准|Acceptance Criteria)' "$file" 2>/dev/null || true)
    if [[ -n "$ac_content" ]] && ! echo "$ac_content" | grep -qE '`[^`]+`'; then
      issues+=("  ${CYAN}[INFO]${RESET} 验收标准未包含可执行命令（建议符合 Nyquist Rule）")
      ticket_info=$((ticket_info + 1))
    fi
  fi

  # 10. pr_review/test 状态验收标准质量工具检查（WARN）
  if [[ "$status" == "pr_review" || "$status" == "test" ]]; then
    local ac_block
    ac_block=$(grep -A20 -E '##\s*[0-9.]*\s*(验收标准|Acceptance Criteria)' "$file" 2>/dev/null || true)
    if [[ -n "$ac_block" ]] && ! echo "$ac_block" | grep -qiE 'lint|audit|mypy|ruff|shellcheck|clippy|golangci|govulncheck'; then
      issues+=("  ${YELLOW}[WARN]${RESET} 验收标准未包含质量工具（lint/audit/mypy/ruff/shellcheck 等），建议补充技术栈四件套")
      ticket_warn=$((ticket_warn + 1))
    fi
  fi

  # ── gate_review 状态额外检查 ────────────────────────────────────────────────
  if [[ "$status" == "gate_review" ]]; then
    if ! file_has 'veto_reason' "$file"; then
      issues+=("  ${RED}[FAIL]${RESET} gate_review 状态缺少 veto_reason 字段")
      ticket_fail=$((ticket_fail + 1))
    fi
    if ! file_has 'resubmit_conditions' "$file"; then
      issues+=("  ${RED}[FAIL]${RESET} gate_review 状态缺少 resubmit_conditions 字段")
      ticket_fail=$((ticket_fail + 1))
    fi
  fi

  # ── TBD/TODO 检测 ───────────────────────────────────────────────────────────
  local tbd_hits
  tbd_hits=$(check_tbd "$file")
  if [[ -n "$tbd_hits" ]]; then
    issues+=("  ${YELLOW}[WARN]${RESET} 检测到 TBD/TODO（gate:review 会 VETO）:")
    while IFS= read -r line; do
      issues+=("    $line")
    done <<< "$tbd_hits"
    ticket_warn=$((ticket_warn + 1))
  fi

  # ── 输出结果 ────────────────────────────────────────────────────────────────
  local display_id="${ticket_id:-${filename}}"
  if [[ ${#issues[@]} -eq 0 ]]; then
    echo -e "  ${GREEN}[PASS]${RESET} ${display_id} (${filename}, 状态: ${status:-unknown})"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    if [[ $ticket_fail -gt 0 ]]; then
      echo -e "  ${RED}[FAIL]${RESET} ${BOLD}${display_id}${RESET} (${filename}, 状态: ${status:-unknown})"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    elif [[ $ticket_warn -gt 0 ]]; then
      echo -e "  ${YELLOW}[WARN]${RESET} ${BOLD}${display_id}${RESET} (${filename}, 状态: ${status:-unknown})"
      WARN_COUNT=$((WARN_COUNT + 1))
      PASS_COUNT=$((PASS_COUNT + 1))
      if $STRICT; then FAIL_COUNT=$((FAIL_COUNT + 1)); fi
    else
      echo -e "  ${CYAN}[INFO]${RESET} ${BOLD}${display_id}${RESET} (${filename}, 状态: ${status:-unknown})"
      PASS_COUNT=$((PASS_COUNT + 1))
    fi
    for issue in "${issues[@]}"; do
      echo -e "$issue"
    done
  fi

  INFO_COUNT=$((INFO_COUNT + ticket_info))
  TOTAL=$((TOTAL + 1))
}

# ─── 主逻辑 ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD} EKET Ticket Template Validator${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo ""

if [[ ! -d "$TICKETS_DIR" ]]; then
  echo -e "${YELLOW}[SKIP]${RESET} tickets 目录不存在: $TICKETS_DIR"
  echo ""
  echo -e "${GREEN}✓ 无 tickets 需要验证${RESET}"
  exit 0
fi

# 收集所有 ticket markdown 文件（兼容 bash 3 / macOS）
TICKET_FILES=()
while IFS= read -r f; do
  [[ -n "$f" ]] && TICKET_FILES+=("$f")
done < <(find "$TICKETS_DIR" -maxdepth 2 -name "*.md" \
  ! -name "README*" \
  ! -name "BACKLOG*" \
  ! -path "*/archive/*" \
  2>/dev/null | sort)

if [[ ${#TICKET_FILES[@]} -eq 0 ]]; then
  echo -e "${YELLOW}[SKIP]${RESET} 未找到 ticket 文件: $TICKETS_DIR"
  exit 0
fi

echo -e "扫描目录: ${BOLD}${TICKETS_DIR}${RESET}"
echo -e "发现文件: ${BOLD}${#TICKET_FILES[@]}${RESET} 个"
if $STRICT; then echo -e "${YELLOW}[STRICT MODE]${RESET} 警告也视为失败"; fi
echo ""

for file in "${TICKET_FILES[@]}"; do
  validate_ticket "$file"
done

# ─── 汇总报告 ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD} 验证结果汇总${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "  总计:  ${BOLD}${TOTAL}${RESET} 个 ticket"
echo -e "  ${GREEN}通过:  ${PASS_COUNT}${RESET}"
echo -e "  ${YELLOW}警告:  ${WARN_COUNT}${RESET}（仅 WARN，无 FAIL）"
echo -e "  ${CYAN}提示:  ${INFO_COUNT}${RESET}（INFO，不影响通过判断）"
echo -e "  ${RED}失败:  ${FAIL_COUNT}${RESET}"
echo ""

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo -e "${RED}${BOLD}✗ 验证失败 — ${FAIL_COUNT} 个 ticket 存在问题${RESET}"
  echo -e "  提示：gate:review CLI 会对验收标准缺失/TBD 等问题 hard fail (VETO)"
  echo ""
  exit 1
else
  echo -e "${GREEN}${BOLD}✓ 所有 ticket 验证通过${RESET}"
  echo ""
  exit 0
fi
