#!/usr/bin/env bash
# shellcheck shell=bash
# validate-ticket-pr.sh — PR 前置校验脚本 (TASK-036)
# 用法: bash scripts/validate-ticket-pr.sh <ticket-file-path>
# 退出码: 0=合规, 1=违规
#
# 校验规则（4条）：
#   TICKET_FILE_NOT_FOUND       — 文件必须存在
#   MISSING_PR_URL              — 必须含 PR/branch 字段
#   MISSING_TEST_OUTPUT         — 必须含测试输出字段
#   TEST_OUTPUT_IS_PLACEHOLDER  — 测试输出不得含占位符词

set -uo pipefail
export LC_ALL=C.UTF-8
export LANG=C.UTF-8

# ─── 参数检查 ─────────────────────────────────────────────────────────────────
TICKET_FILE="${1:-}"

if [[ -z "$TICKET_FILE" ]]; then
  echo "Usage: $0 <ticket-file-path>"
  exit 1
fi

# ─── 提取 ticket ID（文件名去掉扩展名） ─────────────────────────────────────
TICKET_ID="$(basename "$TICKET_FILE" .md)"

# ─── 规则 1: TICKET_FILE_NOT_FOUND ───────────────────────────────────────────
if [[ ! -f "$TICKET_FILE" ]]; then
  echo "TICKET_FILE_NOT_FOUND: Ticket file does not exist: $TICKET_FILE"
  exit 1
fi

# ─── 读取文件内容 ─────────────────────────────────────────────────────────────
CONTENT="$(cat "$TICKET_FILE")"

# ─── 规则 2: MISSING_PR_URL ───────────────────────────────────────────────────
# 合规条件：含有以下任意一行：
#   - ^PR: ...
#   - pr_link: ...
#   - branch: ...
#   - feature/ (分支名引用)
if ! echo "$CONTENT" | grep -qiE '(^PR:|pr_link:|branch:|feature/)'; then
  echo "MISSING_PR_URL: Ticket '$TICKET_ID' has no PR URL or branch reference (need PR:, pr_link:, branch:, or feature/ line)"
  exit 1
fi

# ─── 规则 3: MISSING_TEST_OUTPUT ─────────────────────────────────────────────
# 合规条件：含有以下任意一行：
#   - ## Test (测试章节标题)
#   - Tests: (测试结果字段)
#   - npm test (测试命令记录)
if ! echo "$CONTENT" | grep -qiE '(^##\s+Test|Tests:|npm test)'; then
  echo "MISSING_TEST_OUTPUT: Ticket '$TICKET_ID' has no test output section (need '## Test', 'Tests:', or 'npm test' line)"
  exit 1
fi

# ─── 规则 4: TEST_OUTPUT_IS_PLACEHOLDER ──────────────────────────────────────
# 违规条件：存在仅含占位符词的行（截图/手动/todo/tbd，不区分大小写）
# 使用逐行检查，匹配整行（允许前后空格）为占位符词
PLACEHOLDER_LINE=""
while IFS= read -r line; do
  # 去除首尾空白后检查是否为纯占位符词
  trimmed="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if echo "$trimmed" | grep -qiE '^(截图|手动|todo|tbd)$'; then
    PLACEHOLDER_LINE="$trimmed"
    break
  fi
done <<< "$CONTENT"

if [[ -n "$PLACEHOLDER_LINE" ]]; then
  echo "TEST_OUTPUT_IS_PLACEHOLDER: Ticket '$TICKET_ID' test output contains placeholder: '$PLACEHOLDER_LINE'"
  exit 1
fi

# ─── 所有检查通过 ─────────────────────────────────────────────────────────────
echo "VALID: $TICKET_ID"
exit 0
