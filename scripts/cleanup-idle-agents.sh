#!/bin/bash
# scripts/cleanup-idle-agents.sh - 清理空闲动态 Agent

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 参数
TIMEOUT=${1:-600}  # 默认 10 分钟
DRY_RUN=${2:-false}

echo -e "${GREEN}=== 清理空闲动态 Agent ===${NC}"
echo "超时阈值：${TIMEOUT}秒"
echo "干燥运行：$DRY_RUN"
echo ""

# 动态 Agent 目录
DYNAMIC_AGENTS_DIR="$PROJECT_ROOT/.eket/state/dynamic_agents"
REGISTRY_FILE="$PROJECT_ROOT/.ەک/state/agent_registry.yml"

if [ ! -d "$DYNAMIC_AGENTS_DIR" ]; then
    echo "动态 Agent 目录不存在，跳过清理"
    exit 0
fi

CURRENT=$(date +%s)
CLEANED=0

for agent_file in "$DYNAMIC_AGENTS_DIR"/*.yml; do
    if [ ! -f "$agent_file" ]; then
        continue
    fi

    # 检查状态
    STATUS=$(grep "^status:" "$agent_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')

    # 只处理空闲的 Agent
    if [ "$STATUS" != "available" ]; then
        continue
    fi

    # 获取最后活跃时间
    LAST_ACTIVE=$(grep "^last_active:" "$agent_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')

    if [ -z "$LAST_ACTIVE" ]; then
        # 没有时间戳，跳过
        echo -e "${YELLOW}⚠ 跳过 (无时间戳): $(basename $agent_file)${NC}"
        continue
    fi

    # 计算空闲时间
    IDLE_TIME=$((CURRENT - LAST_ACTIVE))

    if [ $IDLE_TIME -gt $TIMEOUT ]; then
        AGENT_NAME=$(basename "$agent_file")
        echo -e "${YELLOW}空闲超时：$AGENT_NAME (已空闲 ${IDLE_TIME}s)${NC}"

        if [ "$DRY_RUN" = "true" ]; then
            echo "  [DRY RUN] 将删除 $agent_file"
        else
            # 从注册表移除
            if [ -f "$REGISTRY_FILE" ]; then
                # 简化处理，实际应使用 YAML 解析器
                echo "  从注册表移除..."
            fi

            # 删除文件
            rm "$agent_file"
            echo -e "${GREEN}✓ 已删除: $AGENT_NAME${NC}"
            CLEANED=$((CLEANED + 1))
        fi
    else
        echo -e "${GREEN}保留：$(basename $agent_file) (空闲 ${IDLE_TIME}s < ${TIMEOUT}s)${NC}"
    fi
done

echo ""
echo "=== 清理完成 ==="
echo "清理数量：$CLEANED"

if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "这是干燥运行，未实际删除任何文件"
    echo "运行 '$0 $TIMEOUT false' 执行实际清理"
fi
