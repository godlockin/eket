#!/bin/bash
#
# /eket-start-human - 启动人类控制的 Instance
# Phase 4.2: 支持人类/AI Instance 初始化
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$ROOT_DIR")"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# 显示使用方法
show_usage() {
    echo "用法：/eket-start-human --role <role>"
    echo ""
    echo "启动人类控制的 EKET Instance，需要指定 Agent 角色"
    echo ""
    echo "选项:"
    echo "  --role <role>    指定 Agent 角色（必需）"
    echo "  --list-roles     列出所有可用角色"
    echo "  -h, --help       显示帮助"
    echo ""
    echo "可用角色:"
    echo "  协调员角色：product_manager, architect, tech_manager, doc_monitor"
    echo "  执行员角色：frontend_dev, backend_dev, qa_engineer, devops_engineer, designer, tester, fullstack"
    echo ""
}

# 列出可用角色
list_roles() {
    echo "可用 Agent 角色:"
    echo ""
    echo "协调员角色（Coordinators）:"
    echo "  product_manager   - 产品经理"
    echo "  architect         - 架构师"
    echo "  tech_manager      - 技术经理"
    echo "  doc_monitor       - 文档管理员"
    echo ""
    echo "执行员角色（Executors）:"
    echo "  frontend_dev      - 前端开发"
    echo "  backend_dev       - 后端开发"
    echo "  qa_engineer       - 测试工程师"
    echo "  devops_engineer   - 运维工程师"
    echo "  designer          - 设计师"
    echo "  tester            - 测试员"
    echo "  fullstack         - 全栈开发"
    echo ""
}

# 参数解析
ROLE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --role)
            ROLE="$2"
            shift 2
            ;;
        --list-roles)
            list_roles
            exit 0
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo -e "${RED}错误：未知参数 $1${NC}"
            show_usage
            exit 1
            ;;
    esac
done

# 检查角色是否指定
if [ -z "$ROLE" ]; then
    echo -e "${RED}错误：必须指定 --role 参数${NC}"
    show_usage
    exit 1
fi

echo "========================================"
echo "EKET 人类 Instance 启动"
echo "========================================"
echo ""

# 检查 Node.js CLI 是否可用
if command -v node &> /dev/null && [ -f "$ROOT_DIR/node/dist/index.js" ]; then
    echo -e "${BLUE}✓${NC} 使用 Node.js CLI 启动..."
    cd "$PROJECT_ROOT"
    node "$ROOT_DIR/node/dist/index.js" start:instance --human --role "$ROLE"
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo -e "${GREEN}人类 Instance 启动成功！${NC}"
        echo ""
        echo "实例角色：人类控制的 $ROLE"
        echo "下一步:"
        echo "  1. 查看任务列表：/eket-status"
        echo "  2. 领取任务：/eket-claim <task-id>"
        echo "  3. 提交 PR：/eket-submit-pr"
    else
        exit $EXIT_CODE
    fi
else
    echo -e "${YELLOW}⚠${NC} Node.js CLI 不可用，使用 Shell 脚本回退模式..."
    mkdir -p "$PROJECT_ROOT/.eket/state"
    cat > "$PROJECT_ROOT/.eket/state/instance_config.yml" << EOF
role: "slaver"
slaver_mode: "human"
agent_type: "$ROLE"
status: "ready"
auto_mode: false
EOF
    echo -e "${GREEN}✓${NC} 实例配置已保存"
    echo "实例角色：人类控制的 $ROLE"
fi
