#!/usr/bin/env bash
# 检查 done ticket 是否有对应 memory 条目（仅 warn，不阻断）
TICKET_ID="${1:-}"
if [ -z "$TICKET_ID" ]; then exit 0; fi

if ! grep -r "$TICKET_ID" confluence/memory/ >/dev/null 2>&1; then
  echo "⚠️  WARN: $TICKET_ID 完成但未找到 confluence/memory/ 对应条目，建议沉淀经验"
fi
exit 0
