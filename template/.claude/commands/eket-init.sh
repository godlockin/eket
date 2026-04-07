#!/bin/bash
# EKET Init - 初始化 EKET 项目（支持并发多实例）
# Version: 2.0.1

set -e

# 加载公共函数
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_eket_common.sh"

# 生成 instance ID
generate_instance_id() {
    local role=$1
    local specialty=$2
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local pid=$$
    
    if [ "$role" = "master" ]; then
        echo "master_${timestamp}_${pid}"
    else
        if [ -n "$specialty" ] && [ "$specialty" != "none" ]; then
            echo "slaver_${specialty}_${timestamp}_${pid}"
        else
            echo "slaver_${timestamp}_${pid}"
        fi
    fi
}

# 检查项目初始化状态
check_initialization_status() {
    local status="empty"
    local missing_components=()
    
    # 检查关键目录
    [ ! -d "confluence" ] && missing_components+=("confluence")
    [ ! -d "jira" ] && missing_components+=("jira")
    [ ! -d "code_repo" ] && missing_components+=("code_repo")
    [ ! -d "inbox" ] && missing_components+=("inbox")
    [ ! -d "outbox" ] && missing_components+=("outbox")
    
    if [ ${#missing_components[@]} -eq 0 ]; then
        status="complete"
    elif [ ${#missing_components[@]} -lt 5 ]; then
        status="partial"
    fi
    
    echo "$status|${missing_components[*]}"
}

# 决定角色
decide_role() {
    local init_status=$1
    
    if [ "$init_status" = "complete" ]; then
        echo "slaver"
    else
        echo "master"
    fi
}

# 创建实例目录和身份文件
create_instance() {
    local instance_id=$1
    local role=$2
    local specialty=$3
    
    local instance_dir=".eket/instances/$instance_id"
    mkdir -p "$instance_dir/workspace"
    
    # 创建 identity.yml
    cat > "$instance_dir/identity.yml" <<EOF
instance_id: $instance_id
role: $role
specialty: ${specialty:-none}
created_at: $(date -Iseconds)
project_dir: $(pwd)
pid: $$
ppid: $PPID
EOF
    
    # 创建初始 session.log
    echo "[$(date -Iseconds)] Instance created: $instance_id" > "$instance_dir/session.log"
    
    # 创建心跳文件
    date +%s > "$instance_dir/heartbeat.txt"
    
    # 如果是 Slaver，创建 claimed_tasks 文件
    if [ "$role" = "slaver" ]; then
        touch "$instance_dir/claimed_tasks.txt"
    fi
    
    echo "$instance_dir"
}

# 更新活跃实例列表
update_alive_instances() {
    local instance_id=$1
    local role=$2
    local specialty=$3
    
    mkdir -p .eket
    
    # 简单的文本格式（不依赖 jq）
    if [ ! -f ".eket/alive_instances.txt" ]; then
        echo "# EKET Active Instances" > .eket/alive_instances.txt
        echo "# Format: instance_id|role|specialty|started_at|pid" >> .eket/alive_instances.txt
    fi
    
    echo "$instance_id|$role|$specialty|$(date -Iseconds)|$$" >> .eket/alive_instances.txt
}

# 创建项目初始化状态文件
create_initialization_status() {
    local initialized_by=$1
    
    mkdir -p .eket
    
    # 如果文件已存在且是完整状态，不覆盖
    if [ -f ".eket/initialization_status.yml" ]; then
        local existing_status=$(grep "^overall_status:" .eket/initialization_status.yml | awk '{print $2}')
        if [ "$existing_status" = "complete" ]; then
            return  # 不覆盖已完成的初始化
        fi
    fi
    
    # 检查各组件状态
    local confluence_status="missing"
    local jira_status="missing"
    local code_repo_status="missing"
    local inbox_status="missing"
    local outbox_status="missing"
    
    [ -d "confluence" ] && confluence_status="initialized"
    [ -d "jira" ] && jira_status="initialized"
    [ -d "code_repo" ] && code_repo_status="initialized"
    [ -d "inbox" ] && inbox_status="initialized"
    [ -d "outbox" ] && outbox_status="initialized"
    
    # 判断整体状态
    local overall="empty"
    if [ "$confluence_status" = "initialized" ] && \
       [ "$jira_status" = "initialized" ] && \
       [ "$code_repo_status" = "initialized" ]; then
        overall="complete"
    elif [ "$confluence_status" = "initialized" ] || \
         [ "$jira_status" = "initialized" ] || \
         [ "$code_repo_status" = "initialized" ]; then
        overall="partial"
    fi
    
    cat > .eket/initialization_status.yml <<EOF
version: 2.0.0
initialized_at: $(date -Iseconds)
initialized_by: $initialized_by

components:
  confluence:
    status: $confluence_status
    path: ./confluence
    git_initialized: $([ -d "confluence/.git" ] && echo "true" || echo "false")
  
  jira:
    status: $jira_status
    path: ./jira
    git_initialized: $([ -d "jira/.git" ] && echo "true" || echo "false")
  
  code_repo:
    status: $code_repo_status
    path: ./code_repo
    git_initialized: $([ -d "code_repo/.git" ] && echo "true" || echo "false")
  
  inbox:
    status: $inbox_status
    path: ./inbox
  
  outbox:
    status: $outbox_status
    path: ./outbox

overall_status: $overall
master_marker: $initialized_by
EOF
}

# 创建基础目录结构
create_basic_structure() {
    echo -e "${CYAN}创建基础目录结构...${NC}"
    
    mkdir -p inbox/human_feedback
    mkdir -p outbox/review_requests
    mkdir -p outbox/tasks
    mkdir -p .eket/state
    mkdir -p .eket/logs
    mkdir -p .eket/memory
    
    # 创建 inbox/human_input.md
    if [ ! -f "inbox/human_input.md" ]; then
        cat > inbox/human_input.md <<'EOF'
# 人类需求输入

> 在此描述你的需求，Master 会分析并拆解为具体任务

## 需求描述

<!-- 在此输入你的需求 -->

## 验收标准

- [ ] 标准 1
- [ ] 标准 2

## 附加信息

<!-- 任何额外的背景信息、参考资料等 -->

EOF
        echo -e "${GREEN}✓${NC} 创建 inbox/human_input.md"
    fi
    
    # 创建 README.md（如果不存在）
    if [ ! -f "README.md" ]; then
        cat > README.md <<'EOF'
# EKET 项目

基于 EKET Agent Framework 的 AI 驱动项目

## 快速开始

1. 编辑 `inbox/human_input.md` 输入需求
2. 启动 Master: `/eket-init`
3. Master 分析需求并创建任务
4. 启动 Slaver: `/eket-init`（在新会话中）
5. Slaver 领取任务并开发

## 文档

- 完整指南: `CLAUDE.md` (项目根目录)
- 帮助: `/eket-help`

EOF
        echo -e "${GREEN}✓${NC} 创建 README.md"
    fi
}

# 主流程
main() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}              EKET 项目初始化 v2.0.1                            ${NC}"
    echo -e "${BLUE}            （支持并发多实例）                                  ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # 检查是否已有此 session 的实例 ID
    local existing_id=$(get_my_instance_id)
    if [ -n "$existing_id" ]; then
        echo -e "${YELLOW}⚠ 当前 session 已初始化${NC}"
        echo ""
        show_my_info
        echo ""
        echo "如果需要创建新实例，请在新的 Claude Code 会话中运行"
        exit 0
    fi
    
    # 检查项目初始化状态
    echo -e "${CYAN}检查项目状态...${NC}"
    local status_result=$(check_initialization_status)
    local status=$(echo "$status_result" | cut -d'|' -f1)
    local missing=$(echo "$status_result" | cut -d'|' -f2)
    
    echo -e "项目状态: ${YELLOW}$status${NC}"
    if [ "$status" != "complete" ]; then
        echo -e "缺失组件: ${RED}$missing${NC}"
    fi
    echo ""
    
    # 决定角色
    local role=$(decide_role "$status")
    echo -e "${CYAN}建议角色: ${GREEN}$role${NC}"
    echo ""
    
    # 如果是 Slaver，询问专长
    local specialty="none"
    if [ "$role" = "slaver" ]; then
        echo -e "${CYAN}请选择你的专长:${NC}"
        echo "1) frontend"
        echo "2) backend"
        echo "3) fullstack"
        echo "4) qa"
        echo "5) devops"
        echo "6) designer"
        echo "7) other"
        echo ""
        echo -n "选择 (1-7) 或直接输入: "
        read -r choice
        
        case $choice in
            1) specialty="frontend" ;;
            2) specialty="backend" ;;
            3) specialty="fullstack" ;;
            4) specialty="qa" ;;
            5) specialty="devops" ;;
            6) specialty="designer" ;;
            7) 
                echo -n "输入专长: "
                read -r specialty
                ;;
            *) specialty="$choice" ;;
        esac
        
        echo -e "专长: ${GREEN}$specialty${NC}"
        echo ""
    fi
    
    # 生成 instance ID
    local instance_id=$(generate_instance_id "$role" "$specialty")
    echo -e "${GREEN}实例 ID: $instance_id${NC}"
    echo -e "${GRAY}进程 ID: $$${NC}"
    echo ""
    
    # 保存到 session 文件
    save_my_instance_id "$instance_id"
    echo -e "${GREEN}✓${NC} Instance ID 已保存到当前 session"
    echo ""
    
    # 创建实例
    echo -e "${CYAN}创建实例目录...${NC}"
    local instance_dir=$(create_instance "$instance_id" "$role" "$specialty")
    echo -e "${GREEN}✓${NC} 实例目录: $instance_dir"
    echo ""
    
    # 如果是 Master，创建基础结构
    if [ "$role" = "master" ]; then
        create_basic_structure
        echo ""
    fi
    
    # 创建/更新初始化状态文件
    create_initialization_status "$instance_id"
    echo -e "${GREEN}✓${NC} 更新初始化状态文件"
    echo ""
    
    # 更新活跃实例列表
    update_alive_instances "$instance_id" "$role" "$specialty"
    echo -e "${GREEN}✓${NC} 更新活跃实例列表"
    echo ""
    
    # 清理过期 session
    cleanup_stale_sessions
    
    # 显示完成信息
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ 初始化完成！${NC}"
    echo ""
    show_my_info
    echo ""
    
    if [ "$role" = "master" ]; then
        echo -e "${CYAN}下一步 (Master):${NC}"
        echo "1. 编辑 inbox/human_input.md 输入需求"
        echo "2. 运行 /eket-analyze 分析需求（待实现）"
        echo "3. 运行 /eket-check-progress 监控进度"
    else
        echo -e "${CYAN}下一步 (Slaver):${NC}"
        echo "1. 运行 /eket-status 查看可用任务"
        echo "2. 运行 /eket-claim <id> 领取任务"
        echo "3. 开始开发工作"
    fi
    echo ""
    echo -e "运行 ${GREEN}/eket-help${NC} 查看所有命令"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
}

main "$@"
