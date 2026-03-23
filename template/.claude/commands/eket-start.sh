#!/bin/bash
# /eket-start - EKET 实例启动和初始化逻辑 (v0.5)
# Master/Slaver 模式自动检测 + Worktree 同步 + 时间追踪 + 权限控制 + Mock 检测

set -e

echo "========================================"
echo "EKET 实例启动 v0.4"
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

# 模式
AUTO_MODE=false
PROJECT_ROOT="$(pwd)"

# 检查参数
while getopts "ah" opt; do
    case $opt in
        a)
            AUTO_MODE=true
            echo -e "${BLUE}✓${NC} 自动模式已启用"
            ;;
        h)
            echo "用法：/eket-start [-a] [-h]"
            echo ""
            echo "选项:"
            echo "  -a    启用自动模式 (默认：手动模式)"
            echo "  -h    显示帮助"
            echo ""
            exit 0
            ;;
    esac
done

# ==========================================
# 步骤 1: 检查 Master 标记
# ==========================================
echo -e "${BLUE}## 步骤 1: 检查 Master 标记${NC}"
echo ""

MASTER_EXISTS=false

if [ -f "confluence/.eket_master_marker" ]; then
    MASTER_EXISTS=true
    echo -e "${GREEN}✓${NC} Confluence: Master 标记存在"
elif [ -f "jira/.eket_master_marker" ]; then
    MASTER_EXISTS=true
    echo -e "${GREEN}✓${NC} Jira: Master 标记存在"
elif [ -f "code_repo/.eket_master_marker" ] || [ -f "src/.eket_master_marker" ]; then
    MASTER_EXISTS=true
    MARKER_FILE="code_repo/.eket_master_marker"
    [ -f "src/.eket_master_marker" ] && MARKER_FILE="src/.eket_master_marker"
    echo -e "${GREEN}✓${NC} 代码仓库：Master 标记存在"
else
    echo -e "${YELLOW}○${NC} 未发现 Master 标记"
fi

echo ""

# ==========================================
# 步骤 2: 检查三仓库状态
# ==========================================
echo -e "${BLUE}## 步骤 2: 检查三仓库状态${NC}"
echo ""

CONFLUENCE_EXISTS=false
JIRA_EXISTS=false
CODE_REPO_EXISTS=false
CONFLUENCE_HAS_CONTENT=false
JIRA_HAS_CONTENT=false
CODE_REPO_HAS_CONTENT=false

# Confluence
if [ -d "confluence" ]; then
    CONFLUENCE_EXISTS=true
    echo -e "${GREEN}✓${NC} Confluence 仓库存在"
    if [ "$(find confluence -name '*.md' 2>/dev/null | wc -l)" -gt 0 ]; then
        CONFLUENCE_HAS_CONTENT=true
        echo -e "${GREEN}  ✓${NC} 发现文档内容"
    fi
else
    echo -e "${YELLOW}○${NC} Confluence 仓库不存在"
fi

# Jira
if [ -d "jira" ]; then
    JIRA_EXISTS=true
    echo -e "${GREEN}✓${NC} Jira 仓库存在"
    if [ "$(find jira -name '*.md' 2>/dev/null | wc -l)" -gt 0 ]; then
        JIRA_HAS_CONTENT=true
        echo -e "${GREEN}  ✓${NC} 发现任务内容"
    fi
else
    echo -e "${YELLOW}○${NC} Jira 仓库不存在"
fi

# Code Repo
if [ -d "code_repo" ] || [ -d "src" ]; then
    CODE_REPO_EXISTS=true
    echo -e "${GREEN}✓${NC} 代码仓库存在"
    if [ -d "code_repo" ] && [ "$(find code_repo -type f 2>/dev/null | wc -l)" -gt 0 ]; then
        CODE_REPO_HAS_CONTENT=true
        echo -e "${GREEN}  ✓${NC} 发现代码内容"
    elif [ -d "src" ] && [ "$(find src -type f 2>/dev/null | wc -l)" -gt 0 ]; then
        CODE_REPO_HAS_CONTENT=true
        echo -e "${GREEN}  ✓${NC} 发现代码内容"
    fi
else
    echo -e "${YELLOW}○${NC} 代码仓库不存在"
fi

echo ""

# ==========================================
# 步骤 3: 决定实例角色
# ==========================================
echo -e "${BLUE}## 步骤 3: 决定实例角色${NC}"
echo ""

if [ "$MASTER_EXISTS" = true ]; then
    INSTANCE_ROLE="slaver"
    echo -e "${GREEN}检测到 Master 已初始化${NC}"
    echo -e "实例角色：${MAGENTA}Slaver (执行实例)${NC}"
elif [ "$CONFLUENCE_EXISTS" = false ] || [ "$JIRA_EXISTS" = false ] || [ "$CODE_REPO_EXISTS" = false ]; then
    INSTANCE_ROLE="master"
    echo -e "${GREEN}检测到项目未初始化${NC}"
    echo -e "实例角色：${CYAN}Master (协调实例)${NC}"
else
    INSTANCE_ROLE="slaver"
    echo -e "${GREEN}检测到项目已初始化${NC}"
    echo -e "实例角色：${MAGENTA}Slaver (执行实例)${NC}"
fi

# 保存实例状态
mkdir -p ".eket/state"
cat > ".eket/state/instance_config.yml" << EOF
# EKET 实例配置
# 自动生成于：$(date -Iseconds)

# 实例角色
role: "${INSTANCE_ROLE}"

# Slaver 角色类型（仅在 role=slaver 时有效）
agent_type: null

# 实例状态
status: "initializing"

# 工作区配置
workspace:
  confluence_initialized: $CONFLUENCE_EXISTS
  jira_initialized: $JIRA_EXISTS
  code_repo_initialized: $CODE_REPO_EXISTS

# 运行模式
auto_mode: $AUTO_MODE
EOF

echo -e "${GREEN}✓${NC} 实例状态已保存到 .eket/state/instance_config.yml"
echo ""

# ==========================================
# 步骤 4: 执行对应角色逻辑
# ==========================================
if [ "$INSTANCE_ROLE" = "master" ]; then
    # ========== Master 模式 ==========
    echo -e "${BLUE}## 步骤 4: Master 模式 - 协调实例初始化${NC}"
    echo ""

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              Master 模式 - 协调实例                           │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  职责：                                                       │"
    echo "│  • 任务分析 - 分析人类输入的需求                               │"
    echo "│  • 任务拆解 - 拆解为 Epic 和 Jira tickets                       │"
    echo "│  • 进度 Check - 定时检查 Slaver 任务进度                        │"
    echo "│  • 代码 Review - 审核 Slaver 提交的 PR                         │"
    echo "│  • 合并到主分支 - 审核通过后合并到 main 分支                    │"
    echo "│                                                               │"
    echo "│  权限：                                                       │"
    echo "│  • 唯一可以操作主分支 (main) 的实例                             │"
    echo "│  • 创建/更新 Jira tickets                                     │"
    echo "│  • 创建/更新 Confluence 文档                                   │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""

    # ==========================================
    # 步骤 4.1: 创建三仓库目录和 Master 标记
    # ==========================================
    echo -e "${BLUE}## 步骤 4.1: 创建三仓库目录结构${NC}"
    echo ""

    # Confluence
    if [ ! -d "confluence" ]; then
        mkdir -p "confluence/projects"
        mkdir -p "confluence/memory/best-practices"
        mkdir -p "confluence/templates"
        echo "# Confluence 文档中心" > "confluence/README.md"
        echo "initialized_at: $(date -Iseconds)" >> "confluence/README.md"
        echo "initialized_by: master" > "confluence/.eket_master_marker"
        echo "master_instance: true" >> "confluence/.eket_master_marker"
        echo -e "${GREEN}✓${NC} Confluence 仓库已创建 (Master 标记已设置)"
    elif [ ! -f "confluence/.eket_master_marker" ]; then
        echo "initialized_by: master" > "confluence/.eket_master_marker"
        echo "master_instance: true" >> "confluence/.eket_master_marker"
        echo -e "${GREEN}✓${NC} Confluence: Master 标记已添加"
    else
        echo -e "${GREEN}✓${NC} Confluence 仓库已存在 (Master 已初始化)"
    fi

    # Jira
    if [ ! -d "jira" ]; then
        mkdir -p "jira/epics"
        mkdir -p "jira/tickets/feature"
        mkdir -p "jira/tickets/bugfix"
        mkdir -p "jira/tickets/task"
        mkdir -p "jira/state"
        echo "# Jira 任务管理" > "jira/README.md"
        echo "initialized_at: $(date -Iseconds)" >> "jira/README.md"
        echo "initialized_by: master" > "jira/.eket_master_marker"
        echo "master_instance: true" >> "jira/.eket_master_marker"
        echo -e "${GREEN}✓${NC} Jira 仓库已创建 (Master 标记已设置)"
    elif [ ! -f "jira/.eket_master_marker" ]; then
        echo "initialized_by: master" > "jira/.eket_master_marker"
        echo "master_instance: true" >> "jira/.eket_master_marker"
        echo -e "${GREEN}✓${NC} Jira: Master 标记已添加"
    else
        echo -e "${GREEN}✓${NC} Jira 仓库已存在 (Master 已初始化)"
    fi

    # Code Repo
    if [ ! -d "code_repo" ] && [ ! -d "src" ]; then
        mkdir -p "code_repo/src"
        mkdir -p "code_repo/tests"
        mkdir -p "code_repo/configs"
        mkdir -p "code_repo/deployments"
        echo "# 代码仓库" > "code_repo/README.md"
        echo "initialized_at: $(date -Iseconds)" >> "code_repo/README.md"
        echo "initialized_by: master" > "code_repo/.eket_master_marker"
        echo "master_instance: true" >> "code_repo/.eket_master_marker"
        echo -e "${GREEN}✓${NC} 代码仓库已创建 (Master 标记已设置)"
    elif [ ! -f "code_repo/.eket_master_marker" ] && [ ! -f "src/.eket_master_marker" ]; then
        MARKER_PATH="code_repo/.eket_master_marker"
        [ -d "src" ] && MARKER_PATH="src/.eket_master_marker"
        echo "initialized_by: master" > "$MARKER_PATH"
        echo "master_instance: true" >> "$MARKER_PATH"
        echo -e "${GREEN}✓${NC} 代码仓库：Master 标记已添加"
    else
        echo -e "${GREEN}✓${NC} 代码仓库已存在 (Master 已初始化)"
    fi

    echo ""

    # ==========================================
    # 步骤 4.2: 初始化主分支 Git 配置
    # ==========================================
    echo -e "${BLUE}## 步骤 4.2: 配置主分支权限${NC}"
    echo ""

    if [ ! -d ".git" ]; then
        git init -b main
        git config user.name "eket-master"
        git config user.email "master@eket.local"
        echo -e "${GREEN}✓${NC} Git 仓库初始化完成 (主分支：main)"
    else
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
        if [ "$CURRENT_BRANCH" != "main" ]; then
            echo -e "${YELLOW}⚠${NC} 当前分支为 $CURRENT_BRANCH，Master 实例应使用 main 分支"
            echo "   是否切换到 main 分支？[y/N] "
            read -r RESPONSE
            if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
                git checkout main 2>/dev/null || git checkout -b main
                echo -e "${GREEN}✓${NC} 已切换到 main 分支"
            fi
        else
            echo -e "${GREEN}✓${NC} 已在 main 分支"
        fi
    fi

    echo ""

    # ==========================================
    # 步骤 4.3: 启动 Master 监控服务 (v0.5.1)
    # ==========================================
    echo -e "${BLUE}## 步骤 4.3: 启动 Master 监控服务${NC}"
    echo ""

    # 启动心跳监控守护进程
    if [ -f "../../scripts/heartbeatmonitor.sh" ]; then
        echo -e "${GREEN}✓${NC} 启动心跳监控守护进程..."
        ../../scripts/heartbeatmonitor.sh --daemon &>/dev/null &
        echo -e "${GREEN}  ✓${NC} 心跳监控已启动 (后台守护进程)"
    else
        echo -e "${YELLOW}⚠${NC} 心跳监控脚本未找到"
    fi

    # 启动 Memory Review Agent (v0.5.1)
    if [ -f "../../scripts/memory-review-agent.sh" ]; then
        echo -e "${GREEN}✓${NC} 启动 Memory Review Agent..."
        ../../scripts/memory-review-agent.sh --daemon &>/dev/null &
        echo -e "${GREEN}  ✓${NC} Memory Review Agent 已启动 (后台守护进程)"
    else
        echo -e "${YELLOW}⚠${NC} Memory Review Agent 脚本未找到"
    fi

    # 配置验证 (v0.5.1)
    if [ -f "../../scripts/validate-config.sh" ]; then
        echo -e "${BLUE}## 验证配置文件${NC}"
        ../../scripts/validate-config.sh 2>/dev/null && \
            echo -e "${GREEN}  ✓${NC} 配置文件验证通过" || \
            echo -e "${YELLOW}  ⚠${NC} 配置文件验证失败 (可选)"
    fi

    echo ""

    # ==========================================
    # 步骤 4.4: 检查/创建需求输入文件
    # ==========================================
    echo -e "${BLUE}## 步骤 4.4: 检查需求输入${NC}"
    echo ""

    if [ -f "inbox/human_input.md" ]; then
        HAS_INPUT=$(grep -v "^#" "inbox/human_input.md" | grep -v "^$" | grep -v "^---" | wc -l)
        if [ "$HAS_INPUT" -gt 5 ]; then
            echo -e "${GREEN}✓${NC} 检测到人类输入需求"
            echo ""
            echo "需求摘要:"
            head -15 "inbox/human_input.md"
            echo ""
            echo "┌──────────────────────────────────────────────────────────────┐"
            echo "│  Master 下一步：分析需求并拆解任务                            │"
            echo "│  - 调用 requirement_analysis SKILL                          │"
            echo "│  - 创建 Epic 和功能 tickets                                  │"
            echo "│  - 更新 Confluence 文档                                       │"
            echo "└──────────────────────────────────────────────────────────────┘"
        else
            echo -e "${YELLOW}⚠${NC} inbox/human_input.md 内容不完整"
            echo "请补充项目愿景、目标用户、核心功能等信息"
        fi
    else
        echo -e "${YELLOW}⚠${NC} inbox/human_input.md 不存在"
        echo "创建需求输入模板..."
        mkdir -p inbox
        cat > "inbox/human_input.md" << 'EOF'
# 项目需求输入

## 项目愿景
<!-- 请详细描述你的项目愿景 -->

## 目标用户
<!-- 谁是目标用户？他们有什么痛点？ -->

## 核心功能
<!-- 列出 3-5 个核心功能 -->
- [ ]
- [ ]
- [ ]

## 技术栈偏好 (可选)
<!-- 例如：React + Node.js + PostgreSQL -->

## 其他说明
<!-- 预算、时间限制、特殊要求等 -->
EOF
        echo -e "${GREEN}✓${NC} 已创建 inbox/human_input.md"
    fi

else
    # ========== Slaver 模式 ==========
    echo -e "${BLUE}## 步骤 4: Slaver 模式 - 执行实例初始化${NC}"
    echo ""

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              Slaver 模式 - 执行实例                           │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  职责：                                                       │"
    echo "│  • 领取 Jira tickets 并执行                                    │"
    echo "│  • 自主规划任务、开发、测试、迭代                              │"
    echo "│  • 提交 PR 请求 Master 审核                                    │"
    echo "│                                                               │"
    echo "│  运行模式：                                                   │"
    echo "│  • 自动模式 - 根据 ticket 优先级自动领取并执行                  │"
    echo "│  • 手动模式 - 分析项目状态，由人类协助决策                     │"
    echo "│                                                               │"
    echo "│  约束：                                                       │"
    echo "│  • 每个 Slaver 是独立的 instance/session                       │"
    echo "│  • 启动时创建 worktree 同步三仓库状态                           │"
    echo "│  • 不得直接操作主分支 (main)                                   │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""

    # ==========================================
    # 步骤 4.1: 创建/同步 Worktree
    # ==========================================
    echo -e "${BLUE}## 步骤 4.1: 创建/同步 Worktree${NC}"
    echo ""

    WORKTREE_DIR=".eket/worktrees/slaver_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$WORKTREE_DIR"

    # 检查是否有远程配置
    if git remote -v | grep -q "origin"; then
        echo -e "${GREEN}✓${NC} 检测到远程仓库，准备同步..."

        # 尝试 fetch 最新状态
        git fetch origin 2>/dev/null && echo -e "${GREEN}✓${NC} 已获取远程状态" || \
            echo -e "${YELLOW}⚠${NC} 无法连接远程，使用本地状态"
    fi

    # 保存三仓库路径（用于 worktree 访问）
    cat > ".eket/state/worktree_paths.yml" << EOF
# Worktree 路径配置
# 自动生成于：$(date -Iseconds)

confluence_path: "$(pwd)/confluence"
jira_path: "$(pwd)/jira"
code_repo_path: "$(pwd)/code_repo"
worktree_path: "$WORKTREE_DIR"
EOF
    echo -e "${GREEN}✓${NC} Worktree 路径已配置"
    echo ""

    # ==========================================
    # 步骤 4.2: 读取项目状态
    # ==========================================
    echo -e "${BLUE}## 步骤 4.2: 分析项目状态${NC}"
    echo ""

    # 读取 Confluence 文档
    if [ -d "confluence/projects" ]; then
        DOC_COUNT=$(find confluence/projects -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✓${NC} Confluence: $DOC_COUNT 篇文档"
    fi

    # 读取 Jira tickets
    if [ -d "jira/tickets" ]; then
        EPIC_COUNT=$(find jira/epics -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        FEATURE_COUNT=$(find jira/tickets/feature -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        BUGFIX_COUNT=$(find jira/tickets/bugfix -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        TASK_COUNT=$(find jira/tickets/task -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✓${NC} Jira: $EPIC_COUNT Epics, $FEATURE_COUNT Features, $BUGFIX_COUNT Bugfixes, $TASK_COUNT Tasks"
    fi

    echo ""

    # ==========================================
    # 步骤 4.3: 检查角色设置
    # ==========================================
    echo -e "${BLUE}## 步骤 4.3: 检查角色配置${NC}"
    echo ""

    AGENT_TYPE=$(grep "^agent_type:" ".eket/state/instance_config.yml" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "null")

    if [ "$AGENT_TYPE" = "null" ] || [ -z "$AGENT_TYPE" ]; then
        echo -e "${YELLOW}⚠${NC} 尚未设置角色类型"
        echo ""
        echo "可用角色:"
        echo "  - product_manager: 产品经理 (需求分析、任务拆解)"
        echo "  - frontend_dev: 前端开发"
        echo "  - backend_dev: 后端开发"
        echo "  - designer: 设计师"
        echo "  - tester: 测试员"
        echo "  - devops: 运维工程师"
        echo "  - fullstack: 全栈开发"
        echo ""
        echo "设置方法：编辑 .eket/state/instance_config.yml 或运行 /eket-role <role>"
        echo ""
    else
        echo -e "${GREEN}✓${NC} 当前角色：${MAGENTA}$AGENT_TYPE${NC}"
    fi

    # ==========================================
    # 步骤 4.4: 根据模式执行不同逻辑
    # ==========================================
    echo -e "${BLUE}## 步骤 4.4: 执行模式逻辑${NC}"
    echo ""

    # ==========================================
    # v0.5 新增：Slaver 权限和计时初始化
    # ==========================================
    echo -e "${BLUE}## v0.5.1: 初始化 Slaver 权限和监控${NC}"
    echo ""

    # 检查权限脚本
    if [ -f "../../scripts/slaver-permissions.sh" ]; then
        echo -e "${GREEN}✓${NC} Slaver 权限控制已加载"
    else
        echo -e "${YELLOW}⚠${NC} Slaver 权限脚本未找到"
    fi

    # Mock 检测（仅在自动模式执行）
    if [ "$AUTO_MODE" = true ] && [ -f "../../scripts/mock-detector.sh" ]; then
        echo -e "${BLUE}## 执行 Mock 实现检测${NC}"
        ../../scripts/mock-detector.sh detect code_repo/src 2>/dev/null || true
    fi

    # Merge Validator (v0.5.1) - 配置合并验证逻辑
    if [ -f "../../scripts/merge-validator.sh" ]; then
        echo -e "${GREEN}✓${NC} Merge Validator 已配置"
    else
        echo -e "${YELLOW}⚠${NC} Merge Validator 脚本未找到"
    fi

    # 测试门禁系统集成 (v0.5.1)
    if [ -f "../../scripts/test-gate-system.sh" ]; then
        echo -e "${GREEN}✓${NC} 测试门禁系统已就绪"
    else
        echo -e "${YELLOW}⚠${NC} 测试门禁系统脚本未找到"
    fi

    echo ""

    if [ "$AUTO_MODE" = true ]; then
        # ========== 自动模式 ==========
        echo -e "${GREEN}✓${NC} 运行模式：${YELLOW}自动模式${NC}"
        echo ""
        echo "┌──────────────────────────────────────────────────────────────┐"
        echo "│  自动模式流程：                                              │"
        echo "│  1. 分析 Jira tickets 优先级                                  │"
        echo "│  2. 初始化 Profile (根据任务类型匹配角色)                     │"
        echo "│  3. 领取最高优先级任务                                       │"
        echo "│  4. 更新任务状态为 in_progress                               │"
        echo "│  5. 启动任务计时器 (v0.5)                                   │"
        echo "│  6. 自主规划 → 开发 → 测试 → 迭代                            │"
        echo "│  7. 定期更新心跳 (v0.5)                                     │"
        echo "│  8. 提交 PR 到 testing 分支                                   │"
        echo "│  9. 请求 Master 审核                                         │"
        echo "└──────────────────────────────────────────────────────────────┘"
        echo ""

        # 查找待领取任务
        if [ -d "jira/tickets" ]; then
            READY_COUNT=$(grep -l "status: ready" jira/tickets/*/*.md 2>/dev/null | wc -l | tr -d ' ')
            BACKLOG_COUNT=$(grep -l "status: backlog" jira/tickets/*/*.md 2>/dev/null | wc -l | tr -d ' ')
            echo "待领取任务：ready=$READY_COUNT, backlog=$BACKLOG_COUNT"

            if [ "$READY_COUNT" -gt 0 ]; then
                echo ""
                echo "下一步：分析任务优先级并领取..."
                echo -e "${BLUE}v0.5: 领取任务后将自动启动计时器和心跳机制${NC}"
            fi
        fi

    else
        # ========== 手动模式 ==========
        echo -e "${GREEN}✓${NC} 运行模式：${YELLOW}手动模式${NC}"
        echo ""
        echo "┌──────────────────────────────────────────────────────────────┐"
        echo "│  手动模式 - 项目状态分析                                     │"
        echo "├──────────────────────────────────────────────────────────────┤"

        # 项目背景
        echo "│  【项目背景】                                                 │"
        if [ -f "confluence/projects/"*"/requirements/"*.md ]; then
            echo "│  ✓ 需求文档已存在                                           │"
        else
            echo "│  ○ 需求文档缺失                                             │"
        fi

        # 当前状态
        echo "│                                                              │"
        echo "│  【当前状态】                                                 │"
        echo "│  - Confluence: ${DOC_COUNT:-0} 篇文档                              │"
        printf "│  - Jira: %-35s│\n" "$EPIC_COUNT Epics, $FEATURE_COUNT Features..."
        echo "│  - 代码仓库：$(find code_repo/src src -type f 2>/dev/null | wc -l | tr -d ' ') 个文件                       │"

        # 建议
        echo "│                                                              │"
        echo "│  【处理建议】                                                 │"
        if [ "$READY_COUNT" -gt 0 ]; then
            echo "│  1. 查看 ready 状态的任务列表                                 │"
            echo "│  2. 人类选择要领取的任务                                  │"
            echo "│  3. 更新任务状态并开始执行                                │"
        else
            echo "│  1. 无待处理任务，建议联系 Master 创建新任务                 │"
        fi
        echo "└──────────────────────────────────────────────────────────────┘"
        echo ""
        echo "下一步：等待人类指示或运行 /eket-status 查看详细任务列表"
    fi
fi

# ==========================================
# 完成
# ==========================================
echo ""
echo "========================================"
echo "实例启动完成"
echo "========================================"
echo ""
echo "当前状态:"
echo "  实例角色：$INSTANCE_ROLE"
echo "  自动模式：$AUTO_MODE"
echo "  项目根目录：$PROJECT_ROOT"
echo ""

# 更新状态为 ready
sed -i '' "s/status: \"initializing\"/status: \"ready\"/" ".eket/state/instance_config.yml" 2>/dev/null || \
sed -i "s/status: \"initializing\"/status: \"ready\"/" ".eket/state/instance_config.yml"

if [ "$INSTANCE_ROLE" = "master" ]; then
    echo "Master 职责:"
    echo "  - 任务分析 → 任务拆解 → 进度 Check → 代码 Review → 合并到 main"
    echo ""
    echo "v0.5 新增功能:"
    echo "  - 时间监控：监控所有任务超时和无响应状态"
    echo "  - 合并验证：功能点/UT/Review 三项验证"
    echo "  - 记忆 Review：独立进程监控记忆质量"
    echo "  - Sprint/Retrospective: 每 2 个 Sprint 后回顾"
    echo ""
    echo "可用命令:"
    echo "  /eket-analyze     - 分析需求并拆解任务"
    echo "  /eket-review-pr   - 审核 Slaver 提交的 PR"
    echo "  /eket-merge       - 合并 PR 到 main 分支"
    echo "  /eket-check-progress - 检查 Slaver 任务进度"
    echo "  /eket-monitor     - 启动 Master 监控 (v0.5)"
else
    echo "Slaver 职责:"
    echo "  - 领取任务 → 自主规划 → 开发 → 测试 → 提交 PR"
    echo ""
    echo "v0.5 新增功能:"
    echo "  - 时间追踪：任务领取后自动启动计时器"
    echo "  - 心跳机制：定期更新任务状态避免超时重置"
    echo "  - 权限控制：allow/question/reject 三级权限"
    echo "  - Mock 检测：自动检测空实现并创建依赖任务"
    echo "  - Worktree 隔离：slaver_name-ticket_id 命名"
    echo ""
    echo "可用命令:"
    echo "  /eket-claim       - 领取任务"
    echo "  /eket-submit-pr   - 提交 PR 请求审核"
    echo "  /eket-heartbeat   - 更新任务心跳 (v0.5)"
    echo "  /eket-checkpoint  - 创建检查点 (v0.5)"
fi

echo ""
