#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <PR_NUMBER>"
  echo ""
  echo "Manually generate a PR retrospective locally."
  echo "Requires: gh CLI, claude CLI, ANTHROPIC_API_KEY env var"
  echo ""
  echo "The retro file is written to:"
  echo "  confluence/memory/lessons/YYYYMM-PR<N>-<TASK-ID>.md"
  exit 1
}

[ $# -eq 1 ] || usage
[ "$1" = "--help" ] && usage

PR_NUM="$1"

# Validate PR_NUM is a number
if ! [[ "$PR_NUM" =~ ^[0-9]+$ ]]; then
  echo "Error: PR_NUMBER must be a number, got: $PR_NUM"
  exit 1
fi

# Check required tools
for tool in gh claude git; do
  if ! command -v "$tool" &>/dev/null; then
    echo "Error: '$tool' not found in PATH"
    exit 1
  fi
done

# Check ANTHROPIC_API_KEY
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY not set"
  exit 1
fi

# Move to repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "Fetching PR #${PR_NUM} data..."

# Extract PR info
gh pr view "$PR_NUM" --json title,body,reviews,commits > /tmp/pr-data.json

PR_TITLE=$(gh pr view "$PR_NUM" --json title --jq '.title')
BASE_SHA=$(gh pr view "$PR_NUM" --json baseRefOid --jq '.baseRefOid')
HEAD_SHA=$(gh pr view "$PR_NUM" --json headRefOid --jq '.headRefOid')

TASK_ID=$(echo "$PR_TITLE" | grep -oE 'TASK-[0-9]+' | head -1 || true)

if [ -z "$TASK_ID" ]; then
  echo "Warning: No TASK-xxx found in PR title: '$PR_TITLE'"
  echo "Continuing without TASK_ID..."
  TASK_ID="NOTASK"
fi

echo "PR: #${PR_NUM} - ${PR_TITLE}"
echo "Task: ${TASK_ID}"

# Get commit messages
git log --format="%s%n%b" "${BASE_SHA}..${HEAD_SHA}" > /tmp/commits.txt 2>/dev/null || \
  echo "(commits not available locally)" > /tmp/commits.txt

# Get ticket content if exists
TICKET_FILE="jira/tickets/${TASK_ID}.md"
if [ -f "$TICKET_FILE" ]; then
  cp "$TICKET_FILE" /tmp/ticket.md
  echo "Found ticket: $TICKET_FILE"
else
  echo "No ticket file found" > /tmp/ticket.md
fi

TODAY=$(date +%Y-%m-%d)
YYYYMM=$(date +%Y%m)

echo "Generating retrospective with Claude..."

PROMPT="You are writing a structured retrospective for a completed PR in the EKET multi-agent framework project.

PR #${PR_NUM}: ${PR_TITLE}
Task: ${TASK_ID}

PR data:
$(cat /tmp/pr-data.json)

Commit messages:
$(cat /tmp/commits.txt)

Ticket content:
$(cat /tmp/ticket.md)

Write a concise retrospective in this exact markdown format:
# 复盘：${PR_TITLE}（PR #${PR_NUM}，${TASK_ID}）

**时间**: ${TODAY}
**自动生成**: scripts/generate-retro.sh

## 亮点
- [2-3 specific positive outcomes from this PR]

## 踩坑
- [1-2 specific problems encountered, or '无' if none apparent]

## 下次改进
- [1-2 concrete actionable improvements for future similar work]

Keep each bullet point specific and actionable. Under 100 words total."

echo "$PROMPT" | claude -p --output-format text > /tmp/retro-output.md

mkdir -p confluence/memory/lessons
RETRO_FILE="confluence/memory/lessons/${YYYYMM}-PR${PR_NUM}-${TASK_ID}.md"
cp /tmp/retro-output.md "$RETRO_FILE"

echo ""
echo "✓ Retro written to: $RETRO_FILE"
echo ""
cat "$RETRO_FILE"
