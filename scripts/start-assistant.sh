#!/bin/bash
# start-assistant.sh - Launch an assistant subagent for Master delegation
#
# Usage:
#   bash scripts/start-assistant.sh <role> [options]
#
# Roles:
#   pr_reviewer      - PR code review (4-Level Verification)
#   scrum_master     - Progress monitoring and reminders
#   incident_reviewer - Timeout diagnosis
#   analysis_reviewer - Analysis report review
#   test_reviewer    - Test results review
#
# Options:
#   --input <json>   - Input parameters for the assistant (required)
#   --background     - Run in background mode
#   --timeout <sec>  - Execution timeout (default: 600)
#
# Examples:
#   bash scripts/start-assistant.sh pr_reviewer --input '{"ticket_id":"TASK-101","pr_number":"feature/TASK-101"}'
#   bash scripts/start-assistant.sh scrum_master --input '{"check_scope":"all"}' --background

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EKET_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPTS_DIR="$EKET_ROOT/template/prompts/assistants"
LOG_DIR="$EKET_ROOT/.eket/logs"

# Valid roles
VALID_ROLES=("pr_reviewer" "scrum_master" "incident_reviewer" "analysis_reviewer" "test_reviewer")

# Defaults
TIMEOUT=600
BACKGROUND=false
INPUT=""

# ==============================================================================
# Functions
# ==============================================================================

usage() {
  cat <<EOF
Usage: $(basename "$0") <role> [options]

Roles:
  pr_reviewer       PR code review (4-Level Verification)
  scrum_master      Progress monitoring and reminders
  incident_reviewer Timeout diagnosis
  analysis_reviewer Analysis report review
  test_reviewer     Test results review

Options:
  --input <json>    Input parameters (required)
  --background      Run in background
  --timeout <sec>   Timeout in seconds (default: 600)
  --help            Show this help

Examples:
  $(basename "$0") pr_reviewer --input '{"ticket_id":"TASK-101"}'
  $(basename "$0") scrum_master --input '{"check_scope":"all"}' --background
EOF
  exit 1
}

log() {
  echo "[$(date -Iseconds)] [assistant] $*" | tee -a "$LOG_DIR/assistant.log"
}

validate_role() {
  local role="$1"
  for valid in "${VALID_ROLES[@]}"; do
    if [[ "$role" == "$valid" ]]; then
      return 0
    fi
  done
  echo "Error: Invalid role '$role'"
  echo "Valid roles: ${VALID_ROLES[*]}"
  exit 1
}

# ==============================================================================
# Parse Arguments
# ==============================================================================

if [[ $# -lt 1 ]]; then
  usage
fi

# Handle --help as first argument
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
  usage
fi

ROLE="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      INPUT="$2"
      shift 2
      ;;
    --background)
      BACKGROUND=true
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# ==============================================================================
# Validation
# ==============================================================================

validate_role "$ROLE"

if [[ -z "$INPUT" ]]; then
  echo "Error: --input is required"
  usage
fi

PROMPT_FILE="$PROMPTS_DIR/${ROLE}.md"
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: Prompt file not found: $PROMPT_FILE"
  exit 1
fi

# Validate JSON
if ! echo "$INPUT" | jq . >/dev/null 2>&1; then
  echo "Error: Invalid JSON input"
  exit 1
fi

# ==============================================================================
# Prepare Prompt
# ==============================================================================

mkdir -p "$LOG_DIR"

# Read prompt template
PROMPT_CONTENT=$(cat "$PROMPT_FILE")

# Append input section
FULL_PROMPT="$PROMPT_CONTENT

---

## 本次任务输入

\`\`\`json
$INPUT
\`\`\`

---

请开始执行审核任务，将结果写入指定的 assistant_report 目录。"

# ==============================================================================
# Launch Assistant
# ==============================================================================

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TASK_ID="${ROLE}_${TIMESTAMP}"

log "Starting assistant: $ROLE (task: $TASK_ID)"
log "Input: $INPUT"
log "Timeout: ${TIMEOUT}s, Background: $BACKGROUND"

if [[ "$BACKGROUND" == "true" ]]; then
  # Background mode - save prompt and launch
  PROMPT_TMP="$LOG_DIR/assistant_prompt_${TASK_ID}.md"
  echo "$FULL_PROMPT" > "$PROMPT_TMP"

  log "Prompt saved to: $PROMPT_TMP"
  log "Launch command: claude --print \"$PROMPT_TMP\" (background)"

  # Note: Actual Claude invocation depends on environment
  # This is a placeholder for the actual subagent launch
  echo "---"
  echo "Assistant $ROLE queued for background execution"
  echo "Task ID: $TASK_ID"
  echo "Monitor: tail -f $LOG_DIR/assistant.log"
  echo "---"
else
  # Foreground mode - print prompt for manual execution
  echo "---"
  echo "Assistant prompt prepared for: $ROLE"
  echo "Task ID: $TASK_ID"
  echo "---"
  echo ""
  echo "To execute, run Claude with this prompt:"
  echo ""
  echo "--- PROMPT START ---"
  echo "$FULL_PROMPT"
  echo "--- PROMPT END ---"
fi

log "Assistant $ROLE setup complete (task: $TASK_ID)"
