#!/bin/bash
# scripts/load-agent-profile.sh - 加载 Agent Profile 和 Skills

# 不使用 set -e，避免意外退出

TASK_ID="$1"
TASK_FILE="jira/tickets/*/$TASK_ID.md"

if [ -z "$TASK_ID" ]; then
    echo "用法：./load-agent-profile.sh <task-id>"
    exit 1
fi

# 查找任务文件
for file in jira/tickets/feature/"$TASK_ID".md jira/tickets/task/"$TASK_ID".md jira/tickets/bugfix/"$TASK_ID".md; do
    if [ -f "$file" ]; then
        TASK_FILE="$file"
        break
    fi
done

if [ ! -f "$TASK_FILE" ]; then
    echo "错误：任务 $TASK_ID 不存在"
    exit 1
fi

echo "加载 Agent Profile 和 Skills..."
echo ""

# 分析任务类型
TASK_TYPE=""
if [[ "$TASK_FILE" == *"/feature/"* ]]; then
    TASK_TYPE="feature"
elif [[ "$TASK_FILE" == *"/bugfix/"* ]]; then
    TASK_TYPE="bugfix"
else
    TASK_TYPE="task"
fi

# 读取任务信息
TITLE=$(grep "^title:" "$TASK_FILE" 2>/dev/null | cut -d':' -f2 | xargs)
PRIORITY=$(grep "^priority:" "$TASK_FILE" 2>/dev/null | cut -d' ' -f2)
LABELS=$(grep "^labels:" "$TASK_FILE" 2>/dev/null | cut -d':' -f2 | xargs)
DESCRIPTION=$(grep -A 20 "^## 描述" "$TASK_FILE" 2>/dev/null | tail -n +2 | head -10)

echo "任务信息:"
echo "  ID: $TASK_ID"
echo "  类型：$TASK_TYPE"
echo "  标题：$TITLE"
echo "  优先级：$PRIORITY"
echo "  标签：$LABELS"
echo ""

# 根据标签匹配 Agent Profile
echo "匹配 Agent Profile..."

AGENT_PROFILE=""
AGENT_SKILLS=""

if [[ "$LABELS" == *"frontend"* ]] || [[ "$LABELS" == *"ui"* ]] || [[ "$LABELS" == *"react"* ]] || [[ "$LABELS" == *"vue"* ]]; then
    AGENT_PROFILE="frontend_dev"
    AGENT_SKILLS="development/frontend_development development/test_development testing/unit_test"
    echo "  ✓ 匹配到：前端开发 Agent"
elif [[ "$LABELS" == *"backend"* ]] || [[ "$LABELS" == *"api"* ]] || [[ "$LABELS" == *"database"* ]]; then
    AGENT_PROFILE="backend_dev"
    AGENT_SKILLS="development/backend_development design/api_design design/database_design testing/unit_test"
    echo "  ✓ 匹配到：后端开发 Agent"
elif [[ "$LABELS" == *"design"* ]] || [[ "$LABELS" == *"ux"* ]] || [[ "$LABELS" == *"ui"* ]]; then
    AGENT_PROFILE="designer"
    AGENT_SKILLS="design/ui_ux_design design/icon_design documentation/technical_doc"
    echo "  ✓ 匹配到：设计师 Agent"
elif [[ "$LABELS" == *"test"* ]] || [[ "$LABELS" == *"qa"* ]]; then
    AGENT_PROFILE="tester"
    AGENT_SKILLS="testing/unit_test testing/e2e_test testing/integration_test development/test_development"
    echo "  ✓ 匹配到：测试员 Agent"
elif [[ "$LABELS" == *"devops"* ]] || [[ "$LABELS" == *"deploy"* ]] || [[ "$LABELS" == *"docker"* ]]; then
    AGENT_PROFILE="devops"
    AGENT_SKILLS="devops/docker_build devops/kubernetes_deploy devops/ci_cd_setup devops/monitoring_setup"
    echo "  ✓ 匹配到：运维 Agent"
elif [[ "$LABELS" == *"docs"* ]] || [[ "$LABELS" == *"documentation"* ]]; then
    AGENT_PROFILE="doc_monitor"
    AGENT_SKILLS="documentation/api_documentation documentation/user_guide documentation/technical_doc"
    echo "  ✓ 匹配到：文档监控员 Agent"
else
    # 根据任务类型默认匹配
    if [ "$TASK_TYPE" = "bugfix" ]; then
        AGENT_PROFILE="backend_dev"
        AGENT_SKILLS="development/backend_development testing/unit_test"
        echo "  ✓ 使用默认：后端开发 Agent (Bugfix)"
    else
        AGENT_PROFILE="backend_dev"
        AGENT_SKILLS="development/backend_development design/api_design"
        echo "  ✓ 使用默认：后端开发 Agent"
    fi
fi

echo ""
echo "加载 Skills..."
for skill in $AGENT_SKILLS; do
    SKILL_FILE="template/skills/${skill}.yml"
    if [ -f "$SKILL_FILE" ]; then
        echo "  ✓ $skill"
    else
        echo "  ○ $skill (未找到，使用默认实现)"
    fi
done

echo ""
echo "保存 Agent 上下文..."

# 保存 Agent 上下文到 state 文件
mkdir -p ".eket/state/agents"
cat > ".eket/state/agents/$TASK_ID.yml" << EOF
# Agent 上下文 - $TASK_ID
task_id: $TASK_ID
task_type: $TASK_TYPE
agent_profile: $AGENT_PROFILE
skills:
$(for skill in $AGENT_SKILLS; do echo "  - $skill"; done)
loaded_at: $(date -Iseconds)
status: active
EOF

echo "  ✓ Agent 上下文已保存到 .eket/state/agents/$TASK_ID.yml"
echo ""

echo "========================================"
echo "Agent Profile 加载完成"
echo "========================================"
echo ""
echo "配置:"
echo "  Agent Profile: $AGENT_PROFILE"
echo "  Skills: $AGENT_SKILLS"
echo ""
echo "下一步:"
echo "  1. 创建 Git 分支"
echo "     git checkout -b feature/$TASK_ID-$(echo "$TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | head -c 30)"
echo ""
echo "  2. 开始执行任务"
echo "     - 读取 Confluence 背景知识"
echo "     - 调用对应 Skills"
echo "     - 实现功能"
echo ""
