#!/bin/bash
# /eket-start - EKET 实例启动和初始化逻辑 (v0.9.3)
# Master/Slaver 模式自动检测 + Worktree 同步 + 时间追踪 + 权限控制 + Mock 检测 + 身份卡片

# 不使用 set -e，避免在可恢复错误处退出

echo "========================================"
echo "EKET 实例启动 v0.9.3"
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
FORCE_ROLE=""
PROJECT_ROOT="$(pwd)"

# 路径配置 (v0.5.2)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

# 检查参数
while getopts "afr:h" opt; do
    case $opt in
        a)
            AUTO_MODE=true
            echo -e "${BLUE}✓${NC} 自动模式已启用"
            ;;
        f)
            FORCE_ROLE="master"
            echo -e "${BLUE}✓${NC} 强制模式：Master 角色"
            ;;
        r)
            FORCE_ROLE="$2"
            echo -e "${BLUE}✓${NC} 强制角色：$FORCE_ROLE"
            shift
            ;;
        h)
            echo "用法：/eket-start [-a] [-f] [-r <role>] [-h]"
            echo ""
            echo "选项:"
            echo "  -a    启用自动模式 (默认：手动模式)"
            echo "  -f    强制 Master 角色 (忽略自动检测)"
            echo "  -r    指定角色 (master/slaver)"
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

# 如果指定了强制角色，使用指定的角色
if [ -n "$FORCE_ROLE" ]; then
    INSTANCE_ROLE="$FORCE_ROLE"
    echo -e "${GREEN}✓${NC} 使用强制指定的角色：${INSTANCE_ROLE}"
elif [ "$MASTER_EXISTS" = true ]; then
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

    # 守护进程启动函数 (v0.6.1)
    start_daemon() {
        local script="$1"
        local name="$2"
        local pid_file=".eket/state/${name}.pid"

        # 检查是否已在运行
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${GREEN}✓${NC} $name 已在运行 (PID: $pid)"
                return 0
            fi
            # 清理 stale PID 文件
            rm -f "$pid_file"
        fi

        # 启动守护进程
        nohup "$script" --daemon > "logs/${name}.log" 2>&1 &
        local daemon_pid=$!
        echo "$daemon_pid" > "$pid_file"
        echo -e "${GREEN}✓${NC} $name 已启动 (PID: $daemon_pid)"
    }

    # 启动心跳监控守护进程
    if [ -f "$SCRIPTS_DIR/heartbeatmonitor.sh" ]; then
        start_daemon "$SCRIPTS_DIR/heartbeatmonitor.sh" "heartbeat-monitor"
    else
        echo -e "${YELLOW}⚠${NC} 心跳监控脚本未找到"
    fi

    # 启动 Memory Review Agent (v0.5.1)
    if [ -f "$SCRIPTS_DIR/memory-review-agent.sh" ]; then
        start_daemon "$SCRIPTS_DIR/memory-review-agent.sh" "memory-review-agent"
    else
        echo -e "${YELLOW}⚠${NC} Memory Review Agent 脚本未找到"
    fi

    # 配置验证 (v0.5.1)
    if [ -f "$SCRIPTS_DIR/validate-config.sh" ]; then
        echo -e "${BLUE}## 验证配置文件${NC}"
        "$SCRIPTS_DIR/validate-config.sh" 2>/dev/null && \
            echo -e "${GREEN}  ✓${NC} 配置文件验证通过" || \
            echo -e "${YELLOW}  ⚠${NC} 配置文件验证失败 (可选)"
    fi

    # 全量验证 (v0.5.2) - 可选，用于完整校验
    if [ -f "$SCRIPTS_DIR/validate-all.sh" ]; then
        echo -e "${BLUE}## EKET 全量验证 (v0.5.2)${NC}"
        if "$SCRIPTS_DIR/validate-all.sh" 2>/dev/null; then
            echo -e "${GREEN}  ✓${NC} 全量验证通过"
        else
            echo -e "${YELLOW}  ⚠${NC} 全量验证发现警告（可稍后修复）"
            echo "     运行：$SCRIPTS_DIR/validate-all.sh --fix 查看详细信息"
        fi
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
    # v0.5.1: 初始化 Slaver 权限和监控
    # ==========================================
    echo -e "${BLUE}## v0.5.1: 初始化 Slaver 权限和监控${NC}"
    echo ""

    # v0.6.0 新增：Docker 环境检测和容器启动
    echo -e "${BLUE}## v0.6.0: Docker 环境检测${NC}"
    echo ""

    if [ -x "$SCRIPTS_DIR/check-docker.sh" ]; then
        if "$SCRIPTS_DIR/check-docker.sh" --silent; then
            echo -e "${GREEN}✓${NC} Docker 环境检测通过"

            # 启动 SQLite 容器（如果未运行）
            if [ -x "$SCRIPTS_DIR/docker-sqlite.sh" ]; then
                if ! docker ps --filter "name=eket-sqlite" &>/dev/null; then
                    echo "启动 Docker SQLite 容器..."
                    "$SCRIPTS_DIR/docker-sqlite.sh" start || true
                else
                    echo -e "${GREEN}✓${NC} SQLite 容器已在运行"
                fi
            fi

            # 启动 Redis 容器（如果未运行）
            if [ -x "$SCRIPTS_DIR/docker-redis.sh" ]; then
                if ! docker ps --filter "name=eket-redis" &>/dev/null; then
                    echo "启动 Docker Redis 容器..."
                    "$SCRIPTS_DIR/docker-redis.sh" start || true
                else
                    echo -e "${GREEN}✓${NC} Redis 容器已在运行"
                fi
            fi
        else
            echo -e "${YELLOW}○${NC} Docker 未安装或未运行，跳过容器启动"
        fi
    else
        echo -e "${YELLOW}⚠${NC} Docker 检测脚本未找到"
    fi

    echo ""

    # 配置验证 (v0.5.2)
    if [ -f "$SCRIPTS_DIR/validate-all.sh" ]; then
        echo -e "${BLUE}## 验证配置文件 (v0.5.2)${NC}"
        if "$SCRIPTS_DIR/validate-all.sh" 2>/dev/null; then
            echo -e "${GREEN}  ✓${NC} 配置验证通过"
        else
            echo -e "${YELLOW}  ⚠${NC} 配置验证发现警告"
            echo "     运行：$SCRIPTS_DIR/validate-all.sh --fix 查看详情"
        fi
    fi

    # 检查权限脚本
    if [ -f "$SCRIPTS_DIR/slaver-permissions.sh" ]; then
        echo -e "${GREEN}✓${NC} Slaver 权限控制已加载"
    else
        echo -e "${YELLOW}⚠${NC} Slaver 权限脚本未找到"
    fi

    # Mock 检测（仅在自动模式执行）
    if [ "$AUTO_MODE" = true ] && [ -f "$SCRIPTS_DIR/mock-detector.sh" ]; then
        echo -e "${BLUE}## 执行 Mock 实现检测${NC}"
        "$SCRIPTS_DIR/mock-detector.sh" detect code_repo/src 2>/dev/null || true
    fi

    # Merge Validator (v0.5.1) - 配置合并验证逻辑
    if [ -f "$SCRIPTS_DIR/merge-validator.sh" ]; then
        echo -e "${GREEN}✓${NC} Merge Validator 已配置"
    else
        echo -e "${YELLOW}⚠${NC} Merge Validator 脚本未找到"
    fi

    # 测试门禁系统集成 (v0.5.1)
    if [ -f "$SCRIPTS_DIR/test-gate-system.sh" ]; then
        echo -e "${GREEN}✓${NC} 测试门禁系统已就绪"
    else
        echo -e "${YELLOW}⚠${NC} 测试门禁系统脚本未找到"
    fi

    echo ""

    # v0.6.0 新增：Slaver 进程注册
    echo -e "${BLUE}## v0.6.0: Slaver 进程注册${NC}"
    echo ""

    SLAVER_NAME="slaver_$(hostname)_$$"
    echo "Slaver 名称：$SLAVER_NAME"
    echo "进程 PID: $$"
    echo "主机：$(hostname)"

    # 获取当前任务 ID（如果有）
    CURRENT_TASK=""
    if [ -f ".eket/state/current_task.yml" ]; then
        CURRENT_TASK=$(grep "^task_id:" ".eket/state/current_task.yml" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
    fi

    if [ -n "$CURRENT_TASK" ]; then
        echo "当前任务：$CURRENT_TASK"
    else
        echo "当前任务：未分配"
    fi

    # 注册到文件和数据库
    if [ -x "$SCRIPTS_DIR/slaver-heartbeat.sh" ]; then
        "$SCRIPTS_DIR/slaver-heartbeat.sh" register "$SLAVER_NAME" "$CURRENT_TASK" || true

        # 启动心跳守护进程
        "$SCRIPTS_DIR/slaver-heartbeat.sh" start-daemon "$SLAVER_NAME" || true

        echo -e "${GREEN}✓${NC} Slaver 进程已注册"
        echo "  状态文件：.eket/state/slavers/${SLAVER_NAME}.yml"
        echo "  心跳间隔：${HEARTBEAT_INTERVAL:-30}秒"
        echo "  超时阈值：${HEARTBEAT_TIMEOUT:-300}秒"
    else
        echo -e "${YELLOW}⚠${NC} Slaver 心跳脚本未找到"

        # 回退：手动创建状态文件
        mkdir -p ".eket/state/slavers"
        cat > ".eket/state/slavers/${SLAVER_NAME}.yml" << EOF
# Slaver 进程状态文件
# 创建于：$(date -Iseconds)

slaver_name: $SLAVER_NAME
pid: $$
task_id: ${CURRENT_TASK:-null}
host: $(hostname)
status: active
started_at: $(date -Iseconds)
last_heartbeat: $(date -Iseconds)
heartbeat_count: 0
EOF
        echo "已创建状态文件：.eket/state/slavers/${SLAVER_NAME}.yml"
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

# ==========================================
# 步骤 5: 显示身份卡片 (v0.9.3)
# ==========================================
echo -e "${BLUE}## 步骤 5: 读取身份卡片${NC}"
echo ""

IDENTITY_FILE=".eket/IDENTITY.md"
if [ -f "$IDENTITY_FILE" ]; then
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  身份确认 - $INSTANCE_ROLE                                   │"
    echo "├──────────────────────────────────────────────────────────────┤"

    if [ "$INSTANCE_ROLE" = "master" ]; then
        echo "│                                                              │"
        echo "│  【Master 核心职责】                                         │"
        echo "│  1. 需求分析 → 分析人类输入，拆解为任务                      │"
        echo "│  2. 任务拆解 → 创建 Epic 和 Jira tickets                      │"
        echo "│  3. 架构设计 → 设计系统架构和技术方案                        │"
        echo "│  4. PR 审核 → 审核 Slaver 提交的代码                          │"
        echo "│  5. 代码合并 → 将审核通过的代码合并到 main 分支               │"
        echo "│  6. 进度检查 → 定期检查 Slaver 任务进度                       │"
        echo "│                                                              │"
        echo "│  【禁止操作】                                                │"
        echo "│  ❌ 直接修改功能代码 (应由 Slaver 完成)                        │"
        echo "│  ❌ 领取任务进行开发                                         │"
        echo "│  ❌ 绕过 Review 直接合并                                       │"
        echo "│                                                              │"
        echo "│  【启动检查清单】                                            │"
        echo "│  □ 已确认身份：我是 Master (协调实例)                          │"
        echo "│  □ 已检查 inbox/human_input.md 是否有新需求                   │"
        echo "│  □ 已检查 outbox/review_requests/是否有待审核 PR             │"
        echo "│  □ 已检查 jira/tickets/是否有进行中的任务                     │"
        echo "│  □ 已准备执行 Master 职责                                     │"
    else
        AGENT_TYPE=$(grep "^agent_type:" ".eket/state/instance_config.yml" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "未设置")
        echo "│                                                              │"
        echo "│  【Slaver 核心职责】                                         │"
        echo "│  1. 领取任务 → 从 Jira 领取匹配角色的 tickets                   │"
        echo "│  2. 自主规划 → 设计实现方案                                  │"
        echo "│  3. 开发实现 → 编写代码和测试                                │"
        echo "│  4. 提交 PR → 完成开发后提交 PR 请求审核                       │"
        echo "│  5. 修改迭代 → 根据 Review 意见修改代码                       │"
        echo "│                                                              │"
        echo "│  【当前角色】${AGENT_TYPE}"
        echo "│                                                              │"
        echo "│  【禁止操作】                                                │"
        echo "│  ❌ 合并代码到 main 分支                                       │"
        echo "│  ❌ 审核自己的 PR                                             │"
        echo "│  ❌ 领取超出能力范围的任务                                   │"
        echo "│  ❌ 跳过测试直接提交                                         │"
        echo "│                                                              │"
        echo "│  【启动检查清单】                                            │"
        echo "│  □ 已确认身份：我是 Slaver (执行实例)                          │"
        echo "│  □ 已确认角色：${AGENT_TYPE}"
        echo "│  □ 已检查 jira/tickets/中 ready 状态的任务                     │"
        echo "│  □ 已检查 outbox/review_requests/中自己的 PR 状态             │"
        echo "│  □ 已准备执行 Slaver 职责                                     │"
        echo "│                                                              │"
    fi
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""
    echo -e "${GREEN}✓${NC} 身份卡片已显示 (详见 $IDENTITY_FILE)"
else
    echo -e "${YELLOW}⚠${NC} 身份卡片文件不存在：$IDENTITY_FILE"
fi

echo ""

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
