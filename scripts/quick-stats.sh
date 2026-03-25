#!/bin/bash
# scripts/quick-stats.sh - 快速统计信息（显示在终端）

# 不使用 set -e，避免在可恢复错误处退出

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 统计函数
count_by_status() {
    local status="$1"
    local count=0

    if [ -d "jira/tickets" ]; then
        for type_dir in jira/tickets/*/; do
            if [ -d "$type_dir" ]; then
                for ticket_file in "$type_dir"*.md; do
                    if [ -f "$ticket_file" ]; then
                        ticket_status=$(grep -E "^status:|^状态:" "$ticket_file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
                        if [ "$ticket_status" = "$status" ]; then
                            count=$((count + 1))
                        fi
                    fi
                done
            fi
        done
    fi

    echo "$count"
}

# 获取总数
total=0
for status in backlog analysis approved design ready in_progress test review passed changes_requested done; do
    count=$(count_by_status "$status")
    total=$((total + count))
done

# 获取各状态数量
backlog=$(count_by_status "backlog")
ready=$(count_by_status "ready")
in_progress=$(count_by_status "in_progress")
test=$(count_by_status "test")
review=$(count_by_status "review")
done=$(count_by_status "done")

# 计算出进行中的数量
active=$((in_progress + test + review))

# 计算完成率
completion_rate=0
if [ "$total" -gt 0 ]; then
    completion_rate=$((done * 100 / total))
fi

# 显示统计
echo -e "${BLUE}┌────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│${NC}  ${GREEN}EKET Project Stats${NC}                              ${BLUE}│${NC}"
echo -e "${BLUE}├────────────────────────────────────────────────┤${NC}"
echo -e "${BLUE}│${NC}                                            ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  Total: ${total}                               ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}                                            ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  📋 Backlog: ${backlog}                          ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  ✅ Ready: ${ready}                            ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  🔄 In Progress: ${in_progress}                      ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  🧪 Testing: ${test}                           ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  👀 Review: ${review}                           ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  ✨ Done: ${done}                             ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}                                            ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}  Completion: ${completion_rate}%                             ${BLUE}│${NC}"
echo -e "${BLUE}│${NC}                                            ${BLUE}│${NC}"
echo -e "${BLUE}└────────────────────────────────────────────────┘${NC}"
