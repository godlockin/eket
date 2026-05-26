#!/bin/bash
# PostToolUse hook for Edit tool
# Runs format checks based on file type

# Read tool input from stdin
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [[ -z "$file_path" ]]; then
  exit 0
fi

# Check file type and run appropriate formatter
if [[ "$file_path" == *.rs ]]; then
  cd rust 2>/dev/null && cargo fmt --check "$file_path" 2>/dev/null || true
elif [[ "$file_path" == *.py ]]; then
  ruff check --fix "$file_path" 2>/dev/null || true
fi

exit 0
