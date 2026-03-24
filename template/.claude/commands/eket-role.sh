#!/bin/bash
# /eket-role - 设置 Slaver 实例的角色类型

set -e

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 角色设置 v0.5"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查参数
if [ -z "$1" ]; then
    echo -e "${YELLOW}⚠${NC} 请指定角色类型"
    echo ""
    echo "用法：/eket-role <role>"
    echo ""
    echo "可用角色:"
    echo ""
    echo "  ${CYAN}协调层智能体${NC}:"
    echo "    product_manager    - 产品经理 (需求分析、任务拆解)"
    echo "    architect          - 架构师 (系统设计、技术选型)"
    echo ""
    echo "  ${MAGENTA}执行层智能体${NC}:"
    echo "    frontend_dev       - 前端开发 (UI 实现、状态管理)"
    echo "    backend_dev        - 后端开发 (API 设计、数据库设计)"
    echo "    qa_engineer        - 测试工程师 (测试用例、E2E 测试)"
    echo "    devops_engineer    - 运维工程师 (CI/CD、部署、监控)"
    echo "    reviewer           - 审核员 (代码 Review、合并审核)"
    echo ""
    echo "示例:"
    echo "  /eket-role frontend_dev"
    echo "  /eket-role backend_dev"
    echo ""
    exit 1
fi

ROLE="$1"

# 验证角色
VALID_ROLES="product_manager architect frontend_dev backend_dev qa_engineer devops_engineer reviewer"

if ! echo "$VALID_ROLES" | grep -qw "$ROLE"; then
    echo -e "${RED}✗${NC} 无效的角色类型：$ROLE"
    echo ""
    echo "可用角色：$VALID_ROLES"
    echo ""
    exit 1
fi

# 检查实例配置
CONFIG_FILE=".eket/state/instance_config.yml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}⚠${NC} 实例配置文件不存在"
    echo "请先运行 /eket-start 初始化实例"
    exit 1
fi

# 检查实例角色
INSTANCE_ROLE=$(grep "^role:" "$CONFIG_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' "' || echo "null")

if [ "$INSTANCE_ROLE" = "master" ]; then
    echo -e "${RED}✗${NC} 当前实例为 Master 角色，不需要设置 agent_type"
    echo "Master 实例负责需求分析、任务拆解和 PR 审核"
    exit 1
fi

# 更新配置
echo -e "${BLUE}## 更新角色配置${NC}"
echo ""

# 备份原配置
cp "$CONFIG_FILE" "${CONFIG_FILE}.bak"

# 更新 agent_type
if grep -q "^agent_type:" "$CONFIG_FILE"; then
    # macOS sed 需要空参数
    sed -i '' "s/^agent_type:.*/agent_type: \"$ROLE\"/" "$CONFIG_FILE" 2>/dev/null || \
    sed -i "s/^agent_type:.*/agent_type: \"$ROLE\"/" "$CONFIG_FILE"
else
    # 如果不存在则添加
    sed -i '' "s/^role: \"slaver\"/role: \"slaver\"\nagent_type: \"$ROLE\"/" "$CONFIG_FILE" 2>/dev/null || \
    sed -i "s/^role: \"slaver\"/role: \"slaver\"\nagent_type: \"$ROLE\"/" "$CONFIG_FILE"
fi

echo -e "${GREEN}✓${NC} 角色已设置：${MAGENTA}$ROLE${NC}"
echo ""

# 删除备份
rm "${CONFIG_FILE}.bak"

# 显示角色信息
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│              角色配置已更新                                   │"
echo "├──────────────────────────────────────────────────────────────┤"

case "$ROLE" in
    product_manager)
        echo "│  角色：产品经理 (Product Manager)                           │"
        echo "│  职责：需求收集、需求分析、任务拆解、优先级设定              │"
        echo "│  技能：requirement_analysis, task_decomposition           │"
        ;;
    architect)
        echo "│  角色：架构师 (Architect)                                   │"
        echo "│  职责：系统设计、技术选型、架构评审                         │"
        echo "│  技能：architecture_design, tech_stack_selection          │"
        ;;
    frontend_dev)
        echo "│  角色：前端开发 (Frontend Developer)                        │"
        echo "│  职责：前端开发、UI 实现、状态管理                           │"
        echo "│  技能：frontend_development, ui_implementation            │"
        ;;
    backend_dev)
        echo "│  角色：后端开发 (Backend Developer)                         │"
        echo "│  职责：后端开发、API 设计、数据库设计                        │"
        echo "│  技能：backend_development, api_design                    │"
        ;;
    qa_engineer)
        echo "│  角色：测试工程师 (QA Engineer)                             │"
        echo "│  职责：测试用例、单元测试、E2E 测试                            │"
        echo "│  技能：test_development, e2e_testing                      │"
        ;;
    devops_engineer)
        echo "│  角色：运维工程师 (DevOps Engineer)                         │"
        echo "│  职责：CI/CD、部署、监控                                     │"
        echo "│  技能：docker_build, kubernetes_deploy                    │"
        ;;
    reviewer)
        echo "│  角色：审核员 (Reviewer)                                    │"
        echo "│  职责：代码 Review、合并审核                                 │"
        echo "│  技能：code_review, quality_assurance                     │"
        ;;
esac

echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 检查任务
if [ -d "jira/tickets" ]; then
    READY_COUNT=$(grep -l "status: ready" jira/tickets/*/*.md 2>/dev/null | wc -l | tr -d ' ')
    if [ "$READY_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} 发现 $READY_COUNT 个待领取任务"
        echo "运行 /eket-claim 领取任务并开始工作"
    else
        echo "当前无待处理任务"
    fi
fi

echo ""
echo "========================================"
echo "角色设置完成"
echo "========================================"
echo ""
