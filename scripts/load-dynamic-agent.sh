#!/bin/bash
# scripts/load-dynamic-agent.sh - 动态 Agent 加载脚本

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 参数
AGENT_TYPE=$1
TICKET_ID=$2

usage() {
    echo "用法：$0 <agent_type> [ticket_id]"
    echo ""
    echo "参数:"
    echo "  agent_type   Agent 类型 (如：operation, ml_engineer, security)"
    echo "  ticket_id    可选，触发创建的任务 ID"
    echo ""
    echo "示例:"
    echo "  $0 operation OPS-001"
    echo "  $0 ml_engineer ML-001"
    echo "  $0 security"
    exit 1
}

if [ -z "$AGENT_TYPE" ]; then
    usage
fi

echo -e "${GREEN}=== 动态 Agent 加载 ===${NC}"
echo "Agent 类型：$AGENT_TYPE"
[ -n "$TICKET_ID" ] && echo "关联任务：$TICKET_ID"
echo ""

# 动态 Agent 目录
DYNAMIC_AGENTS_DIR="$PROJECT_ROOT/.eket/state/dynamic_agents"
REGISTRY_FILE="$PROJECT_ROOT/.eket/state/agent_registry.yml"
TEMPLATE_DIR="$PROJECT_ROOT/template/agents/dynamic"

# 确保目录存在
mkdir -p "$DYNAMIC_AGENTS_DIR"

# 1. 检查是否已有相同领域的动态 Agent
echo "1. 查找已有 Agent..."
EXISTING_AGENT=""
if [ -d "$DYNAMIC_AGENTS_DIR" ] && [ "$(ls -A $DYNAMIC_AGENTS_DIR 2>/dev/null)" ]; then
    for agent_file in "$DYNAMIC_AGENTS_DIR"/*.yml; do
        if [ -f "$agent_file" ]; then
            # 检查 domain 是否匹配
            if grep -q "domain: $AGENT_TYPE" "$agent_file" 2>/dev/null; then
                # 检查状态是否空闲
                STATUS=$(grep "^status:" "$agent_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
                if [ "$STATUS" = "available" ]; then
                    EXISTING_AGENT="$agent_file"
                    break
                fi
            fi
        fi
    done
fi

if [ -n "$EXISTING_AGENT" ]; then
    echo -e "${GREEN}✓ 找到已有空闲 Agent: $(basename $EXISTING_AGENT)${NC}"
    # 更新状态为 busy
    sed -i '' "s/^status: available/status: busy/" "$EXISTING_AGENT" 2>/dev/null || \
    sed -i "s/^status: available/status: busy/" "$EXISTING_AGENT"
    echo "$EXISTING_AGENT"
    exit 0
fi

# 2. 查找模板
echo "2. 查找 Agent 模板..."
TEMPLATE_FILE="$TEMPLATE_DIR/${AGENT_TYPE}_template.yml"

# 如果不是具体类型，尝试映射
case "$AGENT_TYPE" in
    operation|ops|analytics)
        TEMPLATE_FILE="$TEMPLATE_DIR/operation_expert_template.yml"
        AGENT_NAME="operation_expert"
        ;;
    ml|machine_learning|ai)
        TEMPLATE_FILE="$TEMPLATE_DIR/ml_engineer_template.yml"
        AGENT_NAME="ml_engineer"
        ;;
    security|audit)
        # 使用通用模板
        AGENT_NAME="security_expert"
        ;;
    marketing|brand)
        AGENT_NAME="marketing_expert"
        ;;
    *)
        AGENT_NAME="${AGENT_TYPE}_expert"
        ;;
esac

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${YELLOW}⚠ 未找到专用模板，使用通用模板${NC}"
    # 创建通用专家配置
    cat > "$TEMPLATE_FILE" << 'EOF'
name: ${AGENT_NAME}
type: executor
version: 1.0.0
description: ${AGENT_NAME}

personality:
  mbti: INTJ
  work_style:
    - 专业
    - 高效
  communication_style:
    tone: 专业
    detail_level: medium
  decision_style:
    risk_tolerance: medium
    analysis_depth: thorough

responsibilities:
  - ${AGENT_NAME}相关任务执行

skills:
  - development/python

inputs:
  - type: jira_ticket
    labels: [${AGENT_TYPE}]

outputs:
  - type: jira_transition
    action: transition_ticket

lifecycle:
  mode: on_demand
  auto_shutdown:
    enabled: true
    idle_timeout: 600
EOF
fi

# 3. 创建新 Agent
echo "3. 创建新 Agent..."
TIMESTAMP=$(date +%s)
AGENT_FILENAME="${AGENT_NAME}_${TIMESTAMP}.yml"
OUTPUT_FILE="$DYNAMIC_AGENTS_DIR/$AGENT_FILENAME"

# 从模板复制并替换变量
if [ -f "$TEMPLATE_FILE" ]; then
    cp "$TEMPLATE_FILE" "$OUTPUT_FILE"
    # 替换占位符
    sed -i '' "s/\${AGENT_NAME}/$AGENT_NAME/g" "$OUTPUT_FILE" 2>/dev/null || \
    sed -i "s/\${AGENT_NAME}/$AGENT_NAME/g" "$OUTPUT_FILE"
    sed -i '' "s/\${AGENT_TYPE}/$AGENT_TYPE/g" "$OUTPUT_FILE" 2>/dev/null || \
    sed -i "s/\${AGENT_TYPE}/$AGENT_TYPE/g" "$OUTPUT_FILE"

    # 添加动态字段
    cat >> "$OUTPUT_FILE" << EOF

# 动态添加字段
domain: $AGENT_TYPE
created_at: $(date -Iseconds)
status: busy
last_active: $TIMESTAMP
EOF

    echo -e "${GREEN}✓ 创建成功：$OUTPUT_FILE${NC}"
else
    echo -e "${RED}✗ 模板文件不存在：$TEMPLATE_FILE${NC}"
    exit 1
fi

# 4. 更新注册表
echo "4. 更新 Agent 注册表..."
if [ ! -f "$REGISTRY_FILE" ]; then
    cat > "$REGISTRY_FILE" << EOF
# Agent 注册表
version: 1.0.0
last_updated: $(date -Iseconds)

dynamic_agents: []
EOF
fi

# 检查 dynamic_agents 部分是否存在
if ! grep -q "dynamic_agents:" "$REGISTRY_FILE"; then
    echo "" >> "$REGISTRY_FILE"
    echo "dynamic_agents: []" >> "$REGISTRY_FILE"
fi

# 添加到注册表 (简化处理，实际应使用 YAML 解析器)
AGENT_ENTRY="  - name: ${AGENT_NAME}_${TIMESTAMP}
    type: executor
    domain: $AGENT_TYPE
    status: busy
    config: .eket/state/dynamic_agents/${AGENT_FILENAME}
    created_at: $(date -Iseconds)"

# 在 dynamic_agents 后添加
sed -i '' "/^dynamic_agents:/a\\
$AGENT_ENTRY" "$REGISTRY_FILE" 2>/dev/null || \
sed -i "/^dynamic_agents:/a\\
$AGENT_ENTRY" "$REGISTRY_FILE"

echo -e "${GREEN}✓ 注册表已更新${NC}"

# 5. 输出结果
echo ""
echo -e "${GREEN}=== 创建完成 ===${NC}"
echo "Agent 名称：$AGENT_NAME"
echo "配置文件：$OUTPUT_FILE"
[ -n "$TICKET_ID" ] && echo "关联任务：$TICKET_ID"
echo ""
echo "下一步:"
echo "  1. Agent 将自动处理关联任务"
echo "  2. 任务完成后 10 分钟无新任务将自动销毁"
echo "  3. 使用 ./scripts/manage.sh agents 查看所有 Agent 状态"
echo ""

echo "$OUTPUT_FILE"
