#!/bin/bash
# EKET Help - 显示帮助信息
# Version: 2.0.0

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 读取当前角色
get_role() {
    if [ -f ".eket/state/instance_config.yml" ]; then
        grep "^role:" ".eket/state/instance_config.yml" | awk '{print $2}' | tr -d '"'
    else
        echo "unknown"
    fi
}

ROLE=$(get_role)

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    EKET Agent Framework                        ${NC}"
echo -e "${BLUE}              AI Agent 协作开发框架 v2.0.0                       ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$ROLE" != "unknown" ]; then
    echo -e "${GREEN}当前角色:${NC} $ROLE"
    echo ""
fi

echo -e "${CYAN}## 通用命令${NC}"
echo ""
echo -e "  ${GREEN}/eket-help${NC}              显示此帮助信息"
echo -e "  ${GREEN}/eket-init${NC}              初始化 EKET 项目（首次运行）"
echo -e "  ${GREEN}/eket-start${NC}             启动实例（自动检测 Master/Slaver 模式）"
echo -e "  ${GREEN}/eket-start -a${NC}          自动模式启动（Slaver 自动领取任务）"
echo -e "  ${GREEN}/eket-status${NC}            查看状态和任务列表"
echo -e "  ${GREEN}/eket-role <role>${NC}       设置角色 (master/slaver)"
echo ""

if [ "$ROLE" = "master" ] || [ "$ROLE" = "unknown" ]; then
    echo -e "${CYAN}## Master 专用命令${NC}"
    echo ""
    echo -e "  ${GREEN}/eket-analyze${NC}           分析需求并拆解任务"
    echo -e "  ${GREEN}/eket-check-progress${NC}    检查 Slaver 任务进度"
    echo -e "  ${GREEN}/eket-review-pr <id>${NC}    审核指定 PR"
    echo -e "  ${GREEN}/eket-merge-pr <id>${NC}     合并已批准的 PR"
    echo ""
fi

if [ "$ROLE" = "slaver" ] || [ "$ROLE" = "unknown" ]; then
    echo -e "${CYAN}## Slaver 专用命令${NC}"
    echo ""
    echo -e "  ${GREEN}/eket-claim [id]${NC}        领取任务"
    echo -e "  ${GREEN}/eket-submit-pr${NC}         提交 PR 请求审核"
    echo -e "  ${GREEN}/eket-ask${NC}               依赖追问（缺少配置时）"
    echo ""
fi

echo -e "${CYAN}## 工作流程${NC}"
echo ""
if [ "$ROLE" = "master" ] || [ "$ROLE" = "unknown" ]; then
    echo -e "${YELLOW}Master 流程:${NC}"
    echo "  1. 检查 inbox/human_input.md 是否有新需求"
    echo "  2. /eket-analyze 分析需求并拆解任务"
    echo "  3. /eket-check-progress 监控 Slaver 进度"
    echo "  4. /eket-review-pr <id> 审核 PR"
    echo "  5. /eket-merge-pr <id> 合并通过的 PR"
    echo ""
fi

if [ "$ROLE" = "slaver" ] || [ "$ROLE" = "unknown" ]; then
    echo -e "${YELLOW}Slaver 流程:${NC}"
    echo "  1. /eket-status 查看可用任务"
    echo "  2. /eket-claim <id> 领取任务"
    echo "  3. 创建分析报告并提交审批"
    echo "  4. 审批通过后开发实现"
    echo "  5. /eket-submit-pr 提交 PR"
    echo "  6. 等待 Master 审核"
    echo ""
fi

echo -e "${CYAN}## 文档${NC}"
echo ""
echo -e "  完整文档: ${GREEN}template/CLAUDE.md${NC}"
echo -e "  身份说明: ${GREEN}.eket/IDENTITY.md${NC}"
echo -e "  Master 流程: ${GREEN}docs/MASTER-WORKFLOW.md${NC}"
echo -e "  Slaver 流程: ${GREEN}docs/SLAVER-AUTO-EXEC-GUIDE.md${NC}"
echo ""

echo -e "${CYAN}## 快速开始${NC}"
echo ""
if [ ! -f ".eket/state/instance_config.yml" ]; then
    echo -e "  ${YELLOW}⚠ 项目未初始化，请运行:${NC}"
    echo -e "  ${GREEN}/eket-init${NC}"
    echo ""
else
    echo -e "  ${GREEN}✓${NC} 项目已初始化"
    echo -e "  运行 ${GREEN}/eket-start${NC} 开始工作"
    echo ""
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
