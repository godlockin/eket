#!/bin/bash
# /eket-mode - 切换 EKET 任务模式

set -e

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 模式切换"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 当前模式
MODE_FILE=".eket/state/mode.yml"

if [ -f "$MODE_FILE" ]; then
    CURRENT_MODE=$(grep "^mode:" "$MODE_FILE" | cut -d' ' -f2)
    echo "当前模式：${YELLOW}${CURRENT_MODE}${NC}"
else
    CURRENT_MODE="unknown"
    echo -e "${YELLOW}⚠${NC} 未检测到模式配置，运行 /eket-init 初始化"
    exit 1
fi

echo ""

# 检查参数
if [ $# -eq 0 ]; then
    echo "用法：/eket-mode <mode>"
    echo ""
    echo "可用模式:"
    echo "  setup      - 任务设定模式 (需求分析、任务拆解)"
    echo "  execution  - 任务承接模式 (任务执行、代码开发)"
    echo ""
    echo "示例:"
    echo "  /eket-mode setup"
    echo "  /eket-mode execution"
    echo ""
    exit 1
fi

NEW_MODE="$1"

# 验证模式
if [ "$NEW_MODE" != "setup" ] && [ "$NEW_MODE" != "execution" ]; then
    echo -e "${RED}✗${NC} 无效的模式：$NEW_MODE"
    echo "可用模式：setup, execution"
    exit 1
fi

# 检查是否需要切换
if [ "$CURRENT_MODE" = "$NEW_MODE" ]; then
    echo -e "${GREEN}✓${NC} 当前已是 $NEW_MODE 模式"
    exit 0
fi

# 确认切换
echo "切换到 $NEW_MODE 模式..."
echo ""

if [ "$NEW_MODE" = "setup" ]; then
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│                    任务设定模式                               │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  协调智能体将执行：                                          │"
    echo "│  • 需求分析                                                  │"
    echo "│  • 任务拆解                                                  │"
    echo "│  • 架构设计                                                  │"
    echo "│  • 创建初始任务                                              │"
    echo "│                                                              │"
    echo "│  输出位置：                                                  │"
    echo "│  • confluence/projects/requirements/                        │"
    echo "│  • confluence/projects/architecture/                        │"
    echo "│  • jira/epics/                                              │"
    echo "│  • jira/tickets/                                            │"
    echo "└──────────────────────────────────────────────────────────────┘"
else
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│                    任务承接模式                               │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  执行智能体将执行：                                          │"
    echo "│  • 任务领取                                                  │"
    echo "│  • 代码开发                                                  │"
    echo "│  • 测试编写                                                  │"
    echo "│  • PR 提交                                                    │"
    echo "│                                                              │"
    echo "│  输出位置：                                                  │"
    echo "│  • code_repo/src/                                           │"
    echo "│  • code_repo/tests/                                         │"
    echo "│  • Pull Requests                                            │"
    echo "└──────────────────────────────────────────────────────────────┘"
fi

echo ""
read -p "确定要切换模式吗？(y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠${NC} 操作已取消"
    exit 0
fi

# 执行切换
mkdir -p ".eket/state"
echo "mode: $NEW_MODE" > "$MODE_FILE"
echo "switched_at: $(date -Iseconds)" >> "$MODE_FILE"
echo "previous_mode: $CURRENT_MODE" >> "$MODE_FILE"

echo ""
echo -e "${GREEN}✓${NC} 模式已切换到 ${YELLOW}$NEW_MODE${NC}"
echo ""

# 模式切换后的动作
if [ "$NEW_MODE" = "setup" ]; then
    echo "下一步:"
    echo "  1. 在 inbox/human_input.md 中描述需求"
    echo "  2. 协调智能体会开始分析需求"
    echo ""
else
    echo "下一步:"
    echo "  1. 运行 /eket-status 查看待处理任务"
    echo "  2. 领取任务并开始执行"
    echo ""
fi

# 通知消息
echo "========================================"
echo "模式切换完成"
echo "========================================"
