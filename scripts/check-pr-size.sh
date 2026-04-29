#!/usr/bin/env bash
# check-pr-size.sh — PR 净变更行数检查（Rule of 500 + ~100 行 PR 上限）
#
# 用法:
#   bash scripts/check-pr-size.sh                         # 默认 BASE=origin/main
#   bash scripts/check-pr-size.sh --base=origin/testing
#   bash scripts/check-pr-size.sh --allow-large-pr        # 强制 pass（本地用，非 CI）
#   bash scripts/check-pr-size.sh --pr-body-file=BODY.md  # CI 模式，解析 trailer
#   bash scripts/check-pr-size.sh --mock-net-lines=N      # 测试：跳过 git diff
#   bash scripts/check-pr-size.sh --mock-pr-body=FILE     # 测试：注入 PR body
#   bash scripts/check-pr-size.sh --dry-run               # 输出逐文件细目
#   bash scripts/check-pr-size.sh --self-test             # 跑 fixture cases.json
#
# 退出码:
#   0   silent pass / warn pass
#   1   fail（净变更 > 500 且无审批）
#   2   参数错误

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

WARN_THRESHOLD=100
FAIL_THRESHOLD=500

BASE="origin/main"
PR_BODY_FILE=""
ALLOW_LARGE=0
MOCK_NET_LINES=""
MOCK_PR_BODY_FILE=""
DRY_RUN=0
SELF_TEST=0

for arg in "$@"; do
  case "$arg" in
    --base=*)            BASE="${arg#--base=}" ;;
    --pr-body-file=*)    PR_BODY_FILE="${arg#--pr-body-file=}" ;;
    --allow-large-pr)    ALLOW_LARGE=1 ;;
    --mock-net-lines=*)  MOCK_NET_LINES="${arg#--mock-net-lines=}" ;;
    --mock-pr-body=*)    MOCK_PR_BODY_FILE="${arg#--mock-pr-body=}" ;;
    --dry-run)           DRY_RUN=1 ;;
    --self-test)         SELF_TEST=1 ;;
    *) echo "${RED}✗${NC} 未知参数: $arg" >&2; exit 2 ;;
  esac
done

# self-test
if (( SELF_TEST == 1 )); then
  CASES="$REPO_ROOT/tests/fixtures/pr-size/cases.json"
  FD="$REPO_ROOT/tests/fixtures/pr-size"
  command -v jq &>/dev/null || { echo "${RED}✗${NC} jq not found" >&2; exit 2; }
  st_pass=0; st_fail=0
  count=$(jq 'length' "$CASES")
  echo "Running self-test: $count cases"; echo ""
  for i in $(seq 0 $((count - 1))); do
    name=$(jq -r ".[$i].name" "$CASES"); net=$(jq -r ".[$i].mock_net_lines" "$CASES")
    approval=$(jq -r ".[$i].has_approval" "$CASES")
    exp_exit=$(jq -r ".[$i].expected_exit" "$CASES")
    exp_substr=$(jq -r ".[$i].expected_output_substr" "$CASES")
    run_args=("--mock-net-lines=$net")
    [[ "$approval" == "true" ]] && run_args+=("--mock-pr-body=$FD/600-approved-pr-body.md")
    output=$(bash "$0" "${run_args[@]}" 2>&1); actual_exit=$?
    ok=1
    [[ "$actual_exit" != "$exp_exit" ]] && { ok=0; echo "  ${RED}✗${NC} [$name] exit=$actual_exit (want $exp_exit)"; }
    if [[ -n "$exp_substr" ]] && ! echo "$output" | grep -qF "$exp_substr"; then
      ok=0; echo "  ${RED}✗${NC} [$name] output missing '$exp_substr'"
      echo "     got: $(printf '%s' "$output" | sed $'s/\033\\[[0-9;]*m//g')"
    fi
    if (( ok == 1 )); then
      clean=$(printf '%s' "$output" | sed $'s/\033\\[[0-9;]*m//g')
      echo "  ${GREEN}✓${NC} [$name] exit=$actual_exit  '$clean'"
      st_pass=$((st_pass + 1))
    else st_fail=$((st_fail + 1)); fi
  done
  echo ""; echo "═══ self-test 汇总 ═══"
  echo "  通过: ${GREEN}${st_pass}${NC}  失败: ${RED}${st_fail}${NC}"
  (( st_fail == 0 )) && exit 0 || exit 1
fi

# 解析 PR body trailer
APPROVED=0
check_approval() {
  [[ -z "${1:-}" || ! -f "$1" ]] && return
  grep -qE '^Approved-Large-PR-By:[[:space:]]*[a-z0-9_-]+' "$1" && APPROVED=1
}
check_approval "$MOCK_PR_BODY_FILE"; (( APPROVED == 0 )) && check_approval "$PR_BODY_FILE"
(( ALLOW_LARGE == 1 )) && APPROVED=1

# 计算净变更行数
NET_LINES=0
if [[ -n "$MOCK_NET_LINES" ]]; then
  NET_LINES="$MOCK_NET_LINES"
else
  EXCL=(":(exclude,glob)*.lock" ":(exclude,glob)package-lock.json" ":(exclude,glob)yarn.lock"
    ":(exclude,glob)pnpm-lock.yaml" ":(exclude,glob)Cargo.lock" ":(exclude,glob)*/migrations/*"
    ":(exclude,glob)*/migration/*" ":(exclude,glob)*.generated.*" ":(exclude,glob)*.gen.go"
    ":(exclude,glob)*_pb.go" ":(exclude,glob)*_pb2.py" ":(exclude,glob)dist/*"
    ":(exclude,glob)build/*" ":(exclude,glob)node_modules/*" ":(exclude,glob)target/*"
    ":(exclude,glob)*.min.js" ":(exclude,glob)*.min.css" ":(exclude,glob)*.svg"
    ":(exclude,glob)*.png" ":(exclude,glob)*.jpg" ":(exclude,glob)*.gif" ":(exclude,glob)*.ico")
  (( DRY_RUN == 1 )) && echo "── dry-run 逐文件细目 ──"
  while IFS=$'\t' read -r added removed file; do
    [[ "$added" == "-" || "$removed" == "-" ]] && continue
    git show "${BASE}:${file}" 2>/dev/null | head -5 \
      | grep -qiE 'code generated|do not edit|@generated' && continue
    file_lines=0
    while IFS= read -r line; do
      case "$line" in '+++'*|'---'*) continue ;; '+'*|'-'*)
        content="${line:1}"; trimmed="${content#"${content%%[![:space:]]*}"}"
        trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
        [[ -z "$trimmed" ]] && continue
        case "$file" in
          *.js|*.ts|*.tsx|*.jsx|*.go|*.rs|*.java|*.c|*.cpp|*.h)
            [[ "$trimmed" =~ ^// || "$trimmed" =~ ^/\* || "$trimmed" =~ ^\* || "$trimmed" =~ \*/ ]] && continue ;;
          *.py|*.sh|*.yml|*.yaml|*.toml) [[ "$trimmed" =~ ^# ]] && continue ;;
        esac
        NET_LINES=$((NET_LINES + 1)); file_lines=$((file_lines + 1)) ;;
      esac
    done < <(git diff -U0 "${BASE}...HEAD" -- "$file")
    (( DRY_RUN == 1 )) && printf "  %-52s %4d\n" "$file" "$file_lines"
  done < <(git diff --numstat "${BASE}...HEAD" -- "${EXCL[@]}")
  (( DRY_RUN == 1 )) && echo "────────────────────────────────────────────────────────────"
fi

echo "净变更行数（去 generated/lock/注释/空白）: ${NET_LINES}"

if (( NET_LINES > FAIL_THRESHOLD )); then
  if (( APPROVED == 1 )); then
    echo "${YELLOW}⚠ WARN${NC}: 净变更 ${NET_LINES} > ${FAIL_THRESHOLD}，有 Master 审批 — pass with warning"
    exit 0
  fi
  echo "${RED}✗ FAIL${NC}: 净变更 ${NET_LINES} > ${FAIL_THRESHOLD}，且无 Master 审批 trailer"
  echo "  豁免：PR body 添加 'Approved-Large-PR-By: <master-id>'"
  exit 1
fi

if (( NET_LINES > WARN_THRESHOLD )); then
  echo "${YELLOW}⚠ WARN${NC}: 净变更 ${NET_LINES} > ${WARN_THRESHOLD} — 建议拆分 PR"
  exit 0
fi

echo "${GREEN}✓ PASS${NC}: 净变更 ${NET_LINES} ≤ ${WARN_THRESHOLD}"
exit 0
