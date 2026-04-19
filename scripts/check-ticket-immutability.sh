#!/usr/bin/env bash
# check-ticket-immutability.sh — 保护 ticket 元数据不被 Slaver 擅自修改
#
# 不可变字段（Master 专属）:
#   priority, acceptance_criteria, blocked_by, parent_epic, agent_type, estimate_hours
#
# 使用:
#   bash scripts/check-ticket-immutability.sh --staged    # pre-commit 模式
#   bash scripts/check-ticket-immutability.sh --range A..B
#
# 豁免机制:
#   1. commit message 含 [master-override] → 放行（留痕在 git log）
#   2. 作者邮箱匹配 .eket/config.yml 的 master_emails → 放行
#
# Exit:
#   0 — 无违规
#   1 — 有违规
#   2 — 参数错误

set -u

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo"; exit 2; }
cd "$REPO_ROOT"

IMMUTABLE_FIELDS='^[+-](priority|acceptance_criteria|blocked_by|parent_epic|agent_type|estimate_hours|estimated_hours):'

mode="${1:-}"
case "$mode" in
  --staged)
    diff_cmd="git diff --cached -U0"
    commit_msg=""
    if [[ -f .git/COMMIT_EDITMSG ]]; then
      commit_msg="$(cat .git/COMMIT_EDITMSG 2>/dev/null || true)"
    fi
    ;;
  --range)
    [[ $# -eq 2 ]] || { echo "usage: $0 --range A..B"; exit 2; }
    diff_cmd="git diff -U0 $2"
    commit_msg=""
    ;;
  *)
    echo "usage: $0 --staged | --range A..B"
    exit 2
    ;;
esac

# 豁免 1: commit message 标记
if echo "$commit_msg" | grep -qF '[master-override]'; then
  echo "${YELLOW}⚠ [master-override] 豁免，留痕在 git log${NC}"
  exit 0
fi

# 豁免 2: master 白名单
master_emails_file=".eket/config.yml"
author_email="$(git config user.email 2>/dev/null || true)"
if [[ -f "$master_emails_file" && -n "$author_email" ]]; then
  if grep -qE "master_emails:" "$master_emails_file" 2>/dev/null; then
    if grep -A20 '^master_emails:' "$master_emails_file" | grep -qF "$author_email"; then
      echo "${GREEN}✓${NC} author $author_email 在 master 白名单，豁免"
      exit 0
    fi
  fi
fi

# 仅检查 jira/tickets 或 jira/epics 下的 ticket 文件
ticket_diff=$(eval "$diff_cmd" -- 'jira/tickets/*.md' 'jira/epics/**/*.md' 2>/dev/null || true)

if [[ -z "$ticket_diff" ]]; then
  exit 0
fi

violations=$(echo "$ticket_diff" | grep -E "$IMMUTABLE_FIELDS" || true)

if [[ -z "$violations" ]]; then
  exit 0
fi

echo "${RED}✗ 检测到 ticket 不可变字段被修改（Slaver 不得修改）${NC}"
echo ""
echo "$violations" | head -30
echo ""
echo "不可变字段: priority / acceptance_criteria / blocked_by / parent_epic / agent_type / estimate_hours"
echo ""
echo "豁免方式（选其一）:"
echo "  1. commit message 加 [master-override] 留痕"
echo "  2. 在 .eket/config.yml 的 master_emails 列表加入当前 git email"
echo ""
echo "参考: EXPERT-PANEL-PLAYBOOK.md §3.2 + MASTER-RULES.md"
exit 1
