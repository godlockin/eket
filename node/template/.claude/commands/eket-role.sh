#!/bin/bash
# EKET Role - 设置或切换角色
# Version: 2.0.0

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

show_usage() {
    echo "用法: /eket-role [role] [specialty]"
    echo ""
    echo "角色:"
    echo "  master         - 协调实例"
    echo "  slaver         - 执行实例"
    echo ""
    echo "专长（Slaver only）:"
    echo "  frontend       - 前端开发"
    echo "  backend        - 后端开发"
    echo "  fullstack      - 全栈开发"
    echo "  qa             - 质量保证"
    echo "  devops         - 运维"
    echo "  designer       - 设计"
    echo ""
    echo "示例:"
    echo "  /eket-role master"
    echo "  /eket-role slaver frontend"
}

main() {
    if [ ! -f ".eket/.instance_id" ]; then
        echo -e "${RED}✗ 未找到实例 ID${NC}"
        echo "请先运行 /eket-init"
        exit 1
    fi
    
    local instance_id=$(cat .eket/.instance_id)
    local identity_file=".eket/instances/$instance_id/identity.yml"
    
    if [ ! -f "$identity_file" ]; then
        echo -e "${RED}✗ 身份文件不存在${NC}"
        exit 1
    fi
    
    # 显示当前角色
    local current_role=$(grep "^role:" "$identity_file" | awk '{print $2}')
    local current_specialty=$(grep "^specialty:" "$identity_file" | awk '{print $2}')
    
    echo -e "${CYAN}当前角色:${NC} $current_role"
    if [ "$current_specialty" != "none" ]; then
        echo -e "${CYAN}当前专长:${NC} $current_specialty"
    fi
    echo ""
    
    # 如果没有参数，只显示当前状态
    if [ $# -eq 0 ]; then
        show_usage
        exit 0
    fi
    
    local new_role=$1
    local new_specialty=${2:-none}
    
    # 验证角色
    if [ "$new_role" != "master" ] && [ "$new_role" != "slaver" ]; then
        echo -e "${RED}✗ 无效角色: $new_role${NC}"
        echo ""
        show_usage
        exit 1
    fi
    
    # 更新身份文件
    sed -i.bak "s/^role:.*/role: $new_role/" "$identity_file"
    sed -i.bak "s/^specialty:.*/specialty: $new_specialty/" "$identity_file"
    rm -f "$identity_file.bak"
    
    echo -e "${GREEN}✓ 角色已更新${NC}"
    echo -e "  新角色: ${GREEN}$new_role${NC}"
    if [ "$new_specialty" != "none" ]; then
        echo -e "  新专长: ${GREEN}$new_specialty${NC}"
    fi
    echo ""
    
    # 记录到日志
    echo "[$(date -Iseconds)] Role changed to: $new_role ($new_specialty)" >> ".eket/instances/$instance_id/session.log"
}

main "$@"
