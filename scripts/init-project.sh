#!/bin/bash
# EKET 项目初始化脚本
#
# 文件分类策略：见 template/FILE-CLASSIFICATION.md
# - A 类：运行时可变文件（创建空目录/初始文件）
# - B 类：框架契约/规范（复制到项目）
# - C 类：模板文件（复制到项目，按需实例化）
# - D 类：记忆加载文件（不复制，仅加载到上下文）

# 使用方法:
# 1. 在当前目录初始化:
#    ./init-project.sh <project-name>
#
# 2. 指定项目根目录:
#    ./init-project.sh <project-name> /path/to/project
#
# 3. 从 eket 目录运行（推荐）:
#    ./scripts/init-project.sh <project-name> /path/to/project

# 不使用 set -e，避免在可恢复错误处退出

PROJECT_NAME="${1:-my-project}"
PROJECT_ROOT="${2:-$(pwd)}"
EKET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EKET_TEMPLATE_DIR="$EKET_ROOT/template"

echo "========================================"
echo "EKET 项目初始化"
echo "========================================"
echo ""
echo "项目名称：$PROJECT_NAME"
echo "项目根目录：$PROJECT_ROOT"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 创建目录结构
create_directories() {
    echo "创建目录结构..."

    # 进入项目根目录
    mkdir -p "$PROJECT_ROOT"
    cd "$PROJECT_ROOT"

    directories=(
        ".eket"
        ".eket/state"
        ".eket/memory/long_term"
        ".eket/memory/docs"
        ".eket/logs"
        "inbox"
        "inbox/human_feedback"
        "outbox"
        "outbox/review_requests"
        "tasks"
        "shared/message_queue/inbox"
        "shared/message_queue/outbox"
        "shared/message_queue/broadcast"
        "shared/message_queue/dead_letter"
    )

    for dir in "${directories[@]}"; do
        if [ -d "$dir" ]; then
            echo -e "${GREEN}✓${NC} $dir (已存在)"
        else
            mkdir -p "$dir"
            echo -e "${GREEN}✓${NC} $dir"
        fi
    done
}

# 复制模板文件
copy_templates() {
    echo ""
    echo "复制模板文件..."

    # 从 eket template 目录复制
    if [ -d "$EKET_TEMPLATE_DIR" ]; then
        # 复制 CLAUDE.md
        if [ ! -f "CLAUDE.md" ]; then
            cp "$EKET_TEMPLATE_DIR/CLAUDE.md" "CLAUDE.md"
            # 替换占位符
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "CLAUDE.md" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "CLAUDE.md"
            echo -e "${GREEN}✓${NC} CLAUDE.md"
        fi

        # 复制 AGENTS.md（通用大模型引导文件）
        if [ ! -f "AGENTS.md" ]; then
            if [ -f "$EKET_TEMPLATE_DIR/AGENTS.md" ]; then
                cp "$EKET_TEMPLATE_DIR/AGENTS.md" "AGENTS.md"
                echo -e "${GREEN}✓${NC} AGENTS.md (universal AI agent guide)"
            fi
        fi

        # 复制配置文件
        if [ ! -f ".eket/config.yml" ]; then
            cp "$EKET_TEMPLATE_DIR/.eket/config.yml" ".eket/config.yml"
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" ".eket/config.yml" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" ".eket/config.yml"
            sed -i '' "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" ".eket/config.yml" 2>/dev/null || \
            sed -i "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" ".eket/config.yml"
            sed -i '' "s/{{TIMESTAMP}}/$(date -Iseconds)/g" ".eket/config.yml" 2>/dev/null || \
            sed -i "s/{{TIMESTAMP}}/$(date -Iseconds)/g" ".eket/config.yml"
            echo -e "${GREEN}✓${NC} .eket/config.yml"
        fi

        # 复制 inbox 模板
        if [ ! -f "inbox/human_input.md" ]; then
            cp "$EKET_TEMPLATE_DIR/inbox/human_input.md" "inbox/human_input.md"
            echo -e "${GREEN}✓${NC} inbox/human_input.md"
        fi

        # 复制依赖追问模板
        if [ ! -f "inbox/dependency-clarification.md" ]; then
            if [ -f "$EKET_TEMPLATE_DIR/inbox/dependency-clarification.md" ]; then
                cp "$EKET_TEMPLATE_DIR/inbox/dependency-clarification.md" "inbox/dependency-clarification.md"
                echo -e "${GREEN}✓${NC} inbox/dependency-clarification.md (依赖追问模板)"
            fi
        fi

        # 复制 README
        if [ ! -f "README.md" ]; then
            cp "$EKET_TEMPLATE_DIR/README.md" "README.md"
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "README.md" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "README.md"
            echo -e "${GREEN}✓${NC} README.md"
        fi

        # 复制 SYSTEM-SETTINGS.md (系统设定模板)
        if [ ! -f "SYSTEM-SETTINGS.md" ]; then
            cp "$EKET_TEMPLATE_DIR/SYSTEM-SETTINGS.md" "SYSTEM-SETTINGS.md"
            # 替换占位符
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/{{CREATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{CREATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/{{UPDATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{UPDATE_DATE}}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/{{MAINTAINER}}/$(whoami)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/{{MAINTAINER}}/$(whoami)/g" "SYSTEM-SETTINGS.md"
            echo -e "${GREEN}✓${NC} SYSTEM-SETTINGS.md (系统设定模板)"
            echo -e "${YELLOW}  → 请编辑此文件，替换所有占位符和不适用的章节${NC}"
        fi

        # 复制 .claude 配置（Claude Code Commands）
        if [ -d "$EKET_TEMPLATE_DIR/.claude/commands" ]; then
            mkdir -p ".claude/commands"
            cp "$EKET_TEMPLATE_DIR/.claude/commands/"*.sh ".claude/commands/" 2>/dev/null || true
            echo -e "${GREEN}✓${NC} .claude/commands/"
        fi
        # 复制追问脚本
        if [ -f "$EKET_ROOT/scripts/dependency-check.sh" ]; then
            mkdir -p ".claude/commands"
            cp "$EKET_ROOT/scripts/dependency-check.sh" ".claude/commands/eket-ask.sh"
            chmod +x ".claude/commands/eket-ask.sh"
            echo -e "${GREEN}✓${NC} .claude/commands/eket-ask.sh (依赖追问)"
        fi
        if [ -f "$EKET_TEMPLATE_DIR/.claude/settings.json" ] && [ ! -f ".claude/settings.json" ]; then
            cp "$EKET_TEMPLATE_DIR/.claude/settings.json" ".claude/settings.json"
            echo -e "${GREEN}✓${NC} .claude/settings.json"
        fi
        if [ -f "$EKET_TEMPLATE_DIR/.claude/CLAUDE.md" ] && [ ! -f ".claude/CLAUDE.md" ]; then
            cp "$EKET_TEMPLATE_DIR/.claude/CLAUDE.md" ".claude/CLAUDE.md"
            echo -e "${GREEN}✓${NC} .claude/CLAUDE.md"
        fi

        # 复制 human_feedback 模板
        if [ -d "$EKET_TEMPLATE_DIR/inbox/human_feedback" ]; then
            mkdir -p "inbox/human_feedback"
            cp "$EKET_TEMPLATE_DIR/inbox/human_feedback/"*.md "inbox/human_feedback/" 2>/dev/null || true
            echo -e "${GREEN}✓${NC} inbox/human_feedback/ (模板)"
        fi

        # 复制 .eket 工具脚本
        if [ -f "$EKET_TEMPLATE_DIR/.eket/health_check.sh" ]; then
            mkdir -p ".eket"
            cp "$EKET_TEMPLATE_DIR/.eket/health_check.sh" ".eket/health_check.sh"
            chmod +x ".eket/health_check.sh"
            echo -e "${GREEN}✓${NC} .eket/health_check.sh"
        fi

        # 复制 IDENTITY.md 并替换动态变量
        if [ -f "$EKET_TEMPLATE_DIR/.eket/IDENTITY.md" ]; then
            mkdir -p ".eket"
            cp "$EKET_TEMPLATE_DIR/.eket/IDENTITY.md" ".eket/IDENTITY.md"
            # 注意：IDENTITY.md 中的动态字段由 eket-start.sh 在运行时写入 instance_config.yml
            # 这里不需要替换，因为模板已经指导用户读取 instance_config.yml
            echo -e "${GREEN}✓${NC} .eket/IDENTITY.md"
        fi

        if [ -f "$EKET_TEMPLATE_DIR/.eket/version.yml" ]; then
            mkdir -p ".eket"
            cp "$EKET_TEMPLATE_DIR/.eket/version.yml" ".eket/version.yml"
            # 替换占位符
            sed -i '' "s/{{TIMESTAMP}}/$(date -Iseconds)/g" ".eket/version.yml" 2>/dev/null || \
            sed -i "s/{{TIMESTAMP}}/$(date -Iseconds)/g" ".eket/version.yml"
            sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" ".eket/version.yml" 2>/dev/null || \
            sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" ".eket/version.yml"
            echo -e "${GREEN}✓${NC} .eket/version.yml"
        fi

        # 复制 .eket/config/ 子配置目录（模块化配置）
        if [ -d "$EKET_TEMPLATE_DIR/.eket/config" ]; then
            mkdir -p ".eket/config"
            # 幂等：只复制尚不存在的文件
            for cfg in "$EKET_TEMPLATE_DIR/.eket/config/"*.yml; do
                cfg_name="$(basename "$cfg")"
                if [ ! -f ".eket/config/$cfg_name" ]; then
                    cp "$cfg" ".eket/config/$cfg_name"
                fi
            done
            echo -e "${GREEN}✓${NC} .eket/config/ (模块化子配置)"
        fi

        # 复制 .eket/analysis-roles/ 目录（分析角色定义）
        if [ -d "$EKET_TEMPLATE_DIR/.eket/analysis-roles" ] && [ ! -d ".eket/analysis-roles" ]; then
            cp -r "$EKET_TEMPLATE_DIR/.eket/analysis-roles" ".eket/analysis-roles"
            echo -e "${GREEN}✓${NC} .eket/analysis-roles/ (分析角色定义)"
        fi

        # 复制 examples 目录（快速开始示例）
        if [ -d "$EKET_TEMPLATE_DIR/examples" ]; then
            mkdir -p "examples"
            cp -r "$EKET_TEMPLATE_DIR/examples/"* "examples/" 2>/dev/null || true
            echo -e "${GREEN}✓${NC} examples/ (快速开始示例)"
        fi

        # 复制 .gitignore（敏感信息保护）
        if [ -f "$EKET_TEMPLATE_DIR/.gitignore" ] && [ ! -f ".gitignore" ]; then
            cp "$EKET_TEMPLATE_DIR/.gitignore" ".gitignore"
            echo -e "${GREEN}✓${NC} .gitignore (敏感信息保护)"
        fi

        # 复制 SECURITY.md（安全指南）
        if [ -f "$EKET_TEMPLATE_DIR/SECURITY.md" ] && [ ! -f "SECURITY.md" ]; then
            cp "$EKET_TEMPLATE_DIR/SECURITY.md" "SECURITY.md"
            echo -e "${GREEN}✓${NC} SECURITY.md (安全指南)"
        fi

        # 复制 .github/workflows（CI/CD 配置）
        if [ -d "$EKET_TEMPLATE_DIR/.github/workflows" ]; then
            mkdir -p ".github/workflows"
            cp "$EKET_TEMPLATE_DIR/.github/workflows/"*.yml ".github/workflows/" 2>/dev/null || true
            echo -e "${GREEN}✓${NC} .github/workflows/ (CI/CD 配置)"
        fi

        # 复制 scripts 目录（工具脚本）
        if [ -d "$EKET_ROOT/scripts" ]; then
            mkdir -p "scripts"
            for script in "$EKET_ROOT/scripts/"*.sh; do
                if [ -f "$script" ]; then
                    cp "$script" "scripts/"
                    chmod +x "scripts/$(basename "$script")"
                fi
            done
            echo -e "${GREEN}✓${NC} scripts/ (工具脚本)"
        fi

        # 复制 skills 目录（Skills 定义）
        if [ -d "$EKET_TEMPLATE_DIR/skills" ]; then
            mkdir -p "skills"
            cp -r "$EKET_TEMPLATE_DIR/skills/"* "skills/" 2>/dev/null || true
            echo -e "${GREEN}✓${NC} skills/ (Skills 定义)"
        fi

        # 复制 docs 目录（文档）
        if [ -d "$EKET_TEMPLATE_DIR/docs" ]; then
            mkdir -p "docs"
            cp -r "$EKET_TEMPLATE_DIR/docs/"* "docs/" 2>/dev/null || true
            echo -e "${GREEN}✓${NC} docs/ (项目文档)"
        fi

        # 复制 FILE-CLASSIFICATION.md（文件分类策略）
        if [ -f "$EKET_TEMPLATE_DIR/FILE-CLASSIFICATION.md" ] && [ ! -f "FILE-CLASSIFICATION.md" ]; then
            cp "$EKET_TEMPLATE_DIR/FILE-CLASSIFICATION.md" "FILE-CLASSIFICATION.md"
            echo -e "${GREEN}✓${NC} FILE-CLASSIFICATION.md (文件分类策略)"
        fi

        # 复制 INIT-GUIDE.md（初始化快速指南）
        if [ -f "$EKET_TEMPLATE_DIR/INIT-GUIDE.md" ] && [ ! -f "INIT-GUIDE.md" ]; then
            cp "$EKET_TEMPLATE_DIR/INIT-GUIDE.md" "INIT-GUIDE.md"
            echo -e "${GREEN}✓${NC} INIT-GUIDE.md (初始化快速指南)"
        fi

        # 复制 Jira 索引结构文档
        if [ -f "$EKET_TEMPLATE_DIR/jira/INDEX-STRUCTURE.md" ] && [ ! -f "jira/INDEX-STRUCTURE.md" ]; then
            mkdir -p "jira"
            cp "$EKET_TEMPLATE_DIR/jira/INDEX-STRUCTURE.md" "jira/INDEX-STRUCTURE.md"
            echo -e "${GREEN}✓${NC} jira/INDEX-STRUCTURE.md"
        fi

        # 复制 Ticket 编号规则
        if [ -f "$EKET_TEMPLATE_DIR/jira/TICKET-NUMBERING.md" ] && [ ! -f "jira/TICKET-NUMBERING.md" ]; then
            mkdir -p "jira"
            cp "$EKET_TEMPLATE_DIR/jira/TICKET-NUMBERING.md" "jira/TICKET-NUMBERING.md"
            echo -e "${GREEN}✓${NC} jira/TICKET-NUMBERING.md"
        fi

        # 创建 Jira 初始状态文件（空骨架）
        if [ ! -f "jira/state/ticket-index.yml" ]; then
            mkdir -p "jira/state"
            cat > "jira/state/ticket-index.yml" <<'EOF'
# Ticket 索引文件（Single Source of Truth）
# 最后更新：待更新

# 按状态分组
status_index:
  backlog: []
  ready: []
  in_progress: []
  analysis_review: []
  approved: []
  review: []
  changes_requested: []
  rejected: []
  done: []
  blocked: []

# 按 ID 快速查找
by_id: {}

# Slaver 工作负载
slaver_workload: {}

# 最后更新时间
last_updated: null
EOF
            echo -e "${GREEN}✓${NC} jira/state/ticket-index.yml (空骨架)"
        fi

        # 创建项目状态初始文件
        if [ ! -f "jira/state/project-status.yml" ]; then
            cat > "jira/state/project-status.yml" <<'EOF'
# 项目状态报告
# 由 Master 每 10 分钟更新

# 上次更新时间
last_updated: null

# Slaver 状态
slavers:
  active: []
  idle: []
  busy: []

# 所有 Cards 状态
cards:
  milestones: []
  sprints: []
  epics: []
  tickets: []

# 项目进度
progress:
  sprint_target: null
  deadline: null
  days_remaining: null
  completed: 0
  total: 0
  completion_rate: 0%

# 风险与卡点
risks: []

# 待办事项
action_items: []
EOF
            echo -e "${GREEN}✓${NC} jira/state/project-status.yml (空骨架)"
        fi
    else
        echo -e "${YELLOW}⚠${NC} 未找到 template 目录，跳过文件复制"
    fi
}

# 配置 Git 仓库信息（简化版 - 只创建本地仓库）
configure_git_repos() {
    echo ""
    echo "========================================"
    echo "配置 Git 项目信息"
    echo "========================================"
    echo ""

    cd "$PROJECT_ROOT"

    # 初始化主仓库
    if [ ! -d ".git" ]; then
        git init -b main
        git config user.name "eket-agent"
        git config user.email "agent@eket.local"
        echo -e "${GREEN}✓${NC} 主仓库 Git 初始化完成"
    else
        echo -e "${GREEN}✓${NC} 主仓库 Git 已存在"
    fi

    echo ""
    echo "Git 远程仓库配置可在实例初始化时完成"
    echo "支持："
    echo "  - 完整 Git 模式（远程仓库）"
    echo "  - 本地 Git 模式（本地仓库）"
    echo "  - 降级模式（纯文件系统）"
    echo ""

    # ==========================================
    # 初始化三仓库架构（本地模式）
    # ==========================================
    echo "----------------------------------------"
    echo "EKET 使用三仓库架构 (Confluence/Jira/CodeRepo)"
    echo "----------------------------------------"
    echo ""

    # Confluence 仓库（本地）
    echo "创建 Confluence 本地仓库..."
    mkdir -p confluence
    cd confluence
    git init -b main
    git config user.name "eket-agent"
    git config user.email "agent@eket.local"
    mkdir -p projects/"$PROJECT_NAME"/{requirements,architecture,design,specifications,meetings,releases}
    mkdir -p memory/{best-practices,decisions,lessons-learned}
    mkdir -p templates
    echo "# $PROJECT_NAME Confluence" > README.md
    git add . && git commit -m "init: Confluence 仓库初始化" -q
    cd ..
    echo -e "${GREEN}✓${NC} Confluence 本地仓库已创建"

    # Jira 仓库（本地）
    echo "创建 Jira 本地仓库..."
    mkdir -p jira
    cd jira
    git init -b main
    git config user.name "eket-agent"
    git config user.email "agent@eket.local"
    mkdir -p {epics,tickets/feature,tickets/bugfix,tickets/task,index/{by-feature,by-status,by-assignee},state,templates}
    mkdir -p tickets/feature/.gitkeep
    mkdir -p tickets/bugfix/.gitkeep
    mkdir -p tickets/task/.gitkeep
    echo "# $PROJECT_NAME Jira" > README.md
    git add . && git commit -m "init: Jira 仓库初始化" -q
    cd ..
    echo -e "${GREEN}✓${NC} Jira 本地仓库已创建"

    # Code 仓库（本地）
    echo "创建 Code 本地仓库..."
    mkdir -p code_repo
    cd code_repo
    git init -b main
    git config user.name "eket-agent"
    git config user.email "agent@eket.local"
    mkdir -p {src,tests,configs,deployments,docs}
    echo "# $PROJECT_NAME Code Repository" > README.md
    git add . && git commit -m "init: Code 仓库初始化" -q
    cd ..
    echo -e "${GREEN}✓${NC} Code 本地仓库已创建"

    # 配置 submodule
    echo ""
    echo "配置 Git Submodules..."
    git submodule add ./confluence confluence 2>/dev/null || echo "Confluence submodule 已配置"
    git submodule add ./jira jira 2>/dev/null || echo "Jira submodule 已配置"
    git submodule add ./code_repo code_repo 2>/dev/null || echo "Code submodule 已配置"
    echo -e "${GREEN}✓${NC} Git Submodules 配置完成"

    # 创建连接配置
    mkdir -p ".eket/config"
    cat > ".eket/config/connection.yml" << EOF
# 连接管理器配置
# 支持四级降级：远程 Redis → 本地 Redis → SQLite → 文件系统

# Git 模式配置
git_mode:
  enabled: true
  type: "local"  # local | remote
  # 远程配置（可选，在实例初始化时设置）
  # remote:
  #   main_repo: ""
  #   confluence_repo: ""
  #   jira_repo: ""
  #   code_repo: ""

# 降级模式配置
fallback:
  # 1. 远程 Redis (可选)
  remote_redis:
    enabled: false
    # host: \${EKET_REMOTE_REDIS_HOST}
    # port: 6379

  # 2. 本地 Redis (可选)
  local_redis:
    enabled: false
    # host: localhost
    # port: 6380

  # 3. SQLite
  sqlite:
    enabled: true
    path: ".eket/data/sqlite/eket.db"

  # 4. 文件系统（最终降级）
  filesystem:
    enabled: true
    base_dir: ".eket/data/fs"
EOF
    echo -e "${GREEN}✓${NC} 连接配置文件已创建"
}

# 检查和初始化高效通信后端
check_and_start_backend() {
    echo ""
    echo "========================================"
    echo "检查和启动高效通信后端"
    echo "========================================"
    echo ""

    cd "$PROJECT_ROOT"

    echo "EKET 支持四级降级通信方式："
    echo "  1. 远程 Redis（分布式多实例）"
    echo "  2. 本地 Redis（单机多实例）"
    echo "  3. SQLite（单机单实例）"
    echo "  4. 文件系统（降级模式，无依赖）"
    echo ""

    # 检测 Docker 是否可用
    local docker_available=false
    if command -v docker &> /dev/null && docker ps &> /dev/null; then
        docker_available=true
        echo -e "${GREEN}✓${NC} Docker 可用"
    else
        echo -e "${YELLOW}○${NC} Docker 不可用，跳过 Redis Docker 容器启动"
    fi

    # 检测 Redis 是否已运行
    local redis_running=false
    if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
        redis_running=true
        echo -e "${GREEN}✓${NC} Redis 已在运行"
    fi

    # 检测 SQLite 是否可用
    local sqlite_available=false
    if command -v sqlite3 &> /dev/null; then
        sqlite_available=true
        echo -e "${GREEN}✓${NC} SQLite 可用"
    else
        echo -e "${YELLOW}⚠${NC} SQLite 不可用，将使用文件系统降级模式"
    fi

    echo ""
    echo "请选择通信后端："
    echo "  1) Redis (Docker)  ← 推荐，支持多实例分布式通信"
    echo "  2) Redis (本地已运行)"
    echo "  3) SQLite (本地文件数据库)"
    echo "  4) 文件系统 (无依赖，仅测试用)"
    echo ""
    printf "选择 [1-4]，默认 3: "
    read -r backend_choice

    case "$backend_choice" in
        1)
            if [ "$docker_available" = true ]; then
                echo "启动 Redis Docker 容器..."
                docker run -d --name eket-redis -p 6379:6379 redis:latest 2>/dev/null || {
                    echo -e "${YELLOW}⚠${NC} Redis 容器可能已在运行"
                }
                echo -e "${GREEN}✓${NC} Redis Docker 容器已启动"

                # 更新配置文件
                sed -i '' 's/local_redis:\n    enabled: false/local_redis:\n    enabled: true/' ".eket/config/connection.yml" 2>/dev/null || \
                sed -i 's/local_redis:\n    enabled: false/local_redis:\n    enabled: true/' ".eket/config/connection.yml"

                echo -e "${GREEN}✓${NC} 已配置使用 Redis 通信"
            else
                echo -e "${YELLOW}⚠${NC} Docker 不可用，降级到 SQLite"
                backend_choice=3
            fi
            ;;
        2)
            if [ "$redis_running" = true ]; then
                echo -e "${GREEN}✓${NC} 已配置使用本地 Redis"
                # 更新配置文件
                sed -i '' 's/local_redis:\n    enabled: false/local_redis:\n    enabled: true/' ".eket/config/connection.yml" 2>/dev/null || \
                sed -i 's/local_redis:\n    enabled: false/local_redis:\n    enabled: true/' ".eket/config/connection.yml"
            else
                echo -e "${RED}✗${NC} Redis 未运行，降级到 SQLite"
                backend_choice=3
            fi
            ;;
        3)
            if [ "$sqlite_available" = true ]; then
                echo -e "${GREEN}✓${NC} 已配置使用 SQLite"
                # 创建 SQLite 数据目录
                mkdir -p ".eket/data/sqlite"
                # 更新配置文件
                sed -i '' 's/sqlite:\n    enabled: false/sqlite:\n    enabled: true/' ".eket/config/connection.yml" 2>/dev/null || \
                sed -i 's/sqlite:\n    enabled: false/sqlite:\n    enabled: true/' ".eket/config/connection.yml"
            else
                echo -e "${RED}✗${NC} SQLite 不可用，降级到文件系统"
                backend_choice=4
            fi
            ;;
        4)
            echo -e "${YELLOW}○${NC} 使用文件系统降级模式（仅测试用，性能较低）"
            ;;
        *)
            echo "默认使用 SQLite"
            ;;
    esac

    # 创建数据目录
    mkdir -p ".eket/data"
    mkdir -p ".eket/data/sqlite"
    mkdir -p ".eket/data/fs"

    echo ""
    echo "通信后端配置完成。"
    echo ""
    echo "重要说明："
    echo "  - 节点间通信优先使用高效后端（Redis/SQLite）"
    echo "  - 文字记录（inbox/outbox/文件）仅用于需要被记录和追溯的内容"
    echo "  - 如需修改配置，编辑 .eket/config/connection.yml"
}

# 配置 Slaver 模式和自动执行
configure_slaver_mode() {
    echo ""
    echo "========================================"
    echo "配置实例模式和存储后端"
    echo "========================================"
    echo ""

    cd "$PROJECT_ROOT"

    # 选择角色模式
    echo "请选择实例角色:"
    echo "  1) Master - 协调实例 (负责任务分析和 Review)"
    echo "  2) Slaver - 执行实例 (负责领取和执行任务)"
    echo ""
    read -p "选择 [1/2]，默认 1 (Master): " ROLE_CHOICE

    if [ "$ROLE_CHOICE" = "2" ]; then
        INSTANCE_ROLE="slaver"
        echo -e "${BLUE}✓${NC} 已选择：Slaver 模式"
    else
        INSTANCE_ROLE="master"
        echo -e "${BLUE}✓${NC} 已选择：Master 模式"
    fi

    # 写入初始实例配置
    mkdir -p ".eket/state"
    cat > ".eket/state/instance_config.yml" << EOF
# EKET 实例配置
# 生成于：$(date -Iseconds)

# 实例角色
role: "${INSTANCE_ROLE}"

# Slaver 角色类型（仅在 role=slaver 时有效，由 Slaver 启动时填写）
agent_type: null

# 实例状态
status: "initialized"

# 启动时间
start_time: "$(date -Iseconds)"

# 实例 ID（自动生成）
instance_id: "$(echo $INSTANCE_ROLE)_$(date +%Y%m%d%H%M%S)"
EOF
    echo -e "${GREEN}✓${NC} 实例配置已写入 .eket/state/instance_config.yml"
    echo ""

    # ==========================================
    # 配置存储后端（Git 模式或降级模式）
    # ==========================================
    echo ""
    echo "----------------------------------------"
    echo "配置存储后端"
    echo "----------------------------------------"
    echo ""
    echo "选择存储模式:"
    echo "  1) Git 完整模式 - 使用 Git 进行版本控制和状态管理"
    echo "  2) Git + SQLite 模式 - Git 代码 + SQLite 状态存储"
    echo "  3) 降级模式 - 纯文件系统（无 Git 依赖）"
    echo ""
    read -p "选择 [1-3]，默认 1: " STORAGE_CHOICE

    case "$STORAGE_CHOICE" in
        2)
            STORAGE_MODE="git_sqlite"
            echo -e "${GREEN}✓${NC} 已选择：Git + SQLite 模式"
            ;;
        3)
            STORAGE_MODE="filesystem"
            echo -e "${GREEN}✓${NC} 已选择：降级模式（纯文件系统）"
            ;;
        *)
            STORAGE_MODE="git_full"
            echo -e "${GREEN}✓${NC} 已选择：Git 完整模式"
            ;;
    esac

    # 配置远程仓库（仅 Git 模式）
    if [ "$STORAGE_MODE" = "git_full" ] || [ "$STORAGE_MODE" = "git_sqlite" ]; then
        echo ""
        echo "----------------------------------------"
        echo "配置 Git 远程仓库（可选）"
        echo "----------------------------------------"
        echo ""
        read -p "主仓库 Remote URL (留空跳过): " MAIN_REMOTE
        if [ -n "$MAIN_REMOTE" ]; then
            git remote add origin "$MAIN_REMOTE" 2>/dev/null || git remote set-url origin "$MAIN_REMOTE"
            echo -e "${GREEN}✓${NC} 主仓库 remote 已配置"
        fi

        read -p "Confluence 仓库 Remote URL (留空跳过): " CONFLUENCE_REMOTE
        if [ -n "$CONFLUENCE_REMOTE" ]; then
            cd confluence
            git remote add origin "$CONFLUENCE_REMOTE" 2>/dev/null || git remote set-url origin "$CONFLUENCE_REMOTE"
            cd ..
            echo -e "${GREEN}✓${NC} Confluence remote 已配置"
        fi

        read -p "Jira 仓库 Remote URL (留空跳过): " JIRA_REMOTE
        if [ -n "$JIRA_REMOTE" ]; then
            cd jira
            git remote add origin "$JIRA_REMOTE" 2>/dev/null || git remote set-url origin "$JIRA_REMOTE"
            cd ..
            echo -e "${GREEN}✓${NC} Jira remote 已配置"
        fi

        read -p "Code 仓库 Remote URL (留空跳过): " CODE_REMOTE
        if [ -n "$CODE_REMOTE" ]; then
            cd code_repo
            git remote add origin "$CODE_REMOTE" 2>/dev/null || git remote set-url origin "$CODE_REMOTE"
            cd ..
            echo -e "${GREEN}✓${NC} Code remote 已配置"
        fi
    fi

    # Slaver 特有配置
    if [ "$INSTANCE_ROLE" = "slaver" ]; then
        echo ""
        echo "----------------------------------------"
        echo "Slaver 角色配置"
        echo "----------------------------------------"
        echo ""

        echo "选择 Slaver 专家角色:"
        echo "  1) frontend_dev - 前端开发 (React/Vue/TypeScript)"
        echo "  2) backend_dev - 后端开发 (Node.js/Python/Go)"
        echo "  3) fullstack - 全栈开发"
        echo "  4) tester - 测试工程师"
        echo "  5) devops - 运维工程师"
        echo ""
        read -p "选择 [1-5]，默认 1: " SLAVER_ROLE_CHOICE

        case "$SLAVER_ROLE_CHOICE" in
            1) AGENT_TYPE="frontend_dev" ;;
            2) AGENT_TYPE="backend_dev" ;;
            3) AGENT_TYPE="fullstack" ;;
            4) AGENT_TYPE="tester" ;;
            5) AGENT_TYPE="devops" ;;
            *) AGENT_TYPE="frontend_dev" ;;
        esac
        echo -e "${GREEN}✓${NC} 已选择角色：$AGENT_TYPE"

        echo ""
        echo "----------------------------------------"
        echo "自动执行配置"
        echo "----------------------------------------"
        echo ""
        echo "Slaver 自动执行流程:"
        echo "  1. 查看 Jira tickets 并按优先级排序"
        echo "  2. 选择一个 ticket 并修改状态 (ready → in_progress)"
        echo "  3. 创建 worktree/分支"
        echo "  4. 设计并编写测试 (TDD)"
        echo "  5. 实现功能/修复"
        echo "  6. 测试/迭代/完善"
        echo "  7. 提交 PR 并等待 Review"
        echo ""
        read -p "是否启用自动执行？[y/N]: " AUTO_EXEC_CHOICE

        if [[ "$AUTO_EXEC_CHOICE" =~ ^[Yy]$ ]]; then
            AUTO_MODE="true"
            echo -e "${GREEN}✓${NC} 已启用自动执行模式"
        else
            AUTO_MODE="false"
            echo -e "${YELLOW}⚠${NC} 已禁用自动执行模式 (手动模式)"
        fi
    else
        AGENT_TYPE="null"
        AUTO_MODE="false"
    fi

    # 创建实例配置文件
    mkdir -p ".eket/state"
    cat > ".eket/state/instance_config.yml" << EOF
# EKET 实例配置
# 自动生成于：$(date -Iseconds)

# 实例角色
role: "${INSTANCE_ROLE}"

# Slaver 角色类型（仅在 role=slaver 时有效）
agent_type: "${AGENT_TYPE}"

# 自动模式
auto_mode: ${AUTO_MODE}

# 存储模式
# git_full: 完整 Git 模式
# git_sqlite: Git + SQLite
# filesystem: 纯文件系统（降级模式）
storage_mode: "${STORAGE_MODE}"

# 实例状态
status: "initialized"

# 工作区配置
workspace:
  confluence_initialized: true
  jira_initialized: true
  code_repo_initialized: true

# Slaver 自动执行配置（v0.9.2）
slaver_auto_exec:
  enabled: ${AUTO_MODE}
  role: "${AGENT_TYPE}"
  # 自动处理流程
  workflow:
    - "fetch_tickets"        # 获取 Jira tickets
    - "sort_by_priority"     # 按优先级排序
    - "select_ticket"        # 选择一个 ticket
    - "update_status"        # 更新状态为 in_progress
    - "create_worktree"      # 创建 worktree/分支
    - "design_tests"          # 设计测试 (TDD)
    - "implement"             # 实现功能
    - "test_iterate"          # 测试/迭代/完善
    - "submit_pr"             # 提交 PR
    - "wait_review"           # 等待 Review
EOF

    echo ""
    echo -e "${GREEN}✓${NC} 实例配置已保存到 .eket/state/instance_config.yml"

    # 更新连接配置
    cat > ".eket/config/connection.yml" << EOF
# 连接管理器配置
# 支持四级降级：远程 Redis → 本地 Redis → SQLite → 文件系统

# Git 模式配置
git_mode:
  enabled: $([ "$STORAGE_MODE" != "filesystem" ] && echo "true" || echo "false")
  type: "${STORAGE_MODE}"

# 降级模式配置
fallback:
  # 1. 远程 Redis (可选)
  remote_redis:
    enabled: false
    # host: \${EKET_REMOTE_REDIS_HOST}
    # port: 6379

  # 2. 本地 Redis (可选)
  local_redis:
    enabled: false
    # host: localhost
    # port: 6380

  # 3. SQLite
  sqlite:
    enabled: $([ "$STORAGE_MODE" = "git_sqlite" ] || [ "$STORAGE_MODE" = "filesystem" ] && echo "true" || echo "false")
    path: ".eket/data/sqlite/eket.db"

  # 4. 文件系统（最终降级）
  filesystem:
    enabled: true
    base_dir: ".eket/data/fs"

# 状态存储
state_storage:
$(if [ "$STORAGE_MODE" = "filesystem" ]; then
    echo "  primary: \"filesystem\""
    echo "  fallback: null"
else
    echo "  primary: \"git\""
    echo "  fallback: \"sqlite\""
fi)
EOF
    echo -e "${GREEN}✓${NC} 连接配置已更新"

    # 创建 Slaver Profile 配置（如果是 Slaver 模式）
    if [ "$INSTANCE_ROLE" = "slaver" ]; then
        mkdir -p ".eket/state/profiles"
        cat > ".eket/state/profiles/${AGENT_TYPE}.yml" << EOF
# ${AGENT_TYPE} 专家角色配置

role: "${AGENT_TYPE}"
skills:
  - "requirements_analysis"
  - "technical_design"
EOF

        # 根据角色添加特定 skills
        case "$AGENT_TYPE" in
            frontend_dev)
                cat >> ".eket/state/profiles/${AGENT_TYPE}.yml" << 'EOF'
  - "react_development"
  - "typescript"
  - "tailwindcss"
  - "unit_testing"
  - "e2e_testing"
EOF
                ;;
            backend_dev)
                cat >> ".eket/state/profiles/${AGENT_TYPE}.yml" << 'EOF'
  - "api_design"
  - "database_design"
  - "nodejs"
  - "unit_testing"
EOF
                ;;
            fullstack)
                cat >> ".eket/state/profiles/${AGENT_TYPE}.yml" << 'EOF'
  - "react_development"
  - "api_design"
  - "database_design"
  - "fullstack_testing"
EOF
                ;;
        esac

        echo -e "${GREEN}✓${NC} Slaver Profile 已创建"
    fi

    # ==========================================
    # 安装角色对应的 settings.json（物理级权限约束）
    # ==========================================
    echo ""
    echo "----------------------------------------"
    echo "安装角色权限配置（settings.json）"
    echo "----------------------------------------"
    mkdir -p ".claude"
    if [ "$INSTANCE_ROLE" = "master" ]; then
        if [ -f "$EKET_TEMPLATE_DIR/.claude/settings.master.json" ]; then
            cp "$EKET_TEMPLATE_DIR/.claude/settings.master.json" ".claude/settings.json"
            echo -e "${GREEN}✓${NC} .claude/settings.json (Master 权限配置 — 禁止写 node/src/**)"
        else
            echo -e "${YELLOW}⚠${NC} 未找到 settings.master.json，跳过权限配置安装"
        fi
    elif [ "$INSTANCE_ROLE" = "slaver" ]; then
        if [ -f "$EKET_TEMPLATE_DIR/.claude/settings.slaver.json" ]; then
            cp "$EKET_TEMPLATE_DIR/.claude/settings.slaver.json" ".claude/settings.json"
            echo -e "${GREEN}✓${NC} .claude/settings.json (Slaver 权限配置 — 禁止 force push 到受保护分支)"
        else
            echo -e "${YELLOW}⚠${NC} 未找到 settings.slaver.json，跳过权限配置安装"
        fi
    fi
}

# 显示使用指南
show_guide() {
    echo ""
    echo "========================================"
    echo "初始化完成!"
    echo "========================================"
    echo ""
    echo "项目信息:"
    echo "  名称：$PROJECT_NAME"
    echo "  位置：$PROJECT_ROOT"
    echo ""

    # 读取实例配置
    if [ -f ".eket/state/instance_config.yml" ]; then
        ROLE=$(grep "^role:" ".eket/state/instance_config.yml" | cut -d':' -f2 | tr -d ' "')
        AGENT_TYPE=$(grep "^agent_type:" ".eket/state/instance_config.yml" | cut -d':' -f2 | tr -d ' "')
        AUTO_MODE=$(grep "^auto_mode:" ".eket/state/instance_config.yml" | cut -d':' -f2 | tr -d ' ')
        STORAGE_MODE=$(grep "^storage_mode:" ".eket/state/instance_config.yml" | cut -d':' -f2 | tr -d ' "')

        echo "实例配置:"
        echo "  角色：$ROLE"
        echo "  存储模式：$STORAGE_MODE"
        if [ "$ROLE" = "slaver" ]; then
            echo "  专家类型：$AGENT_TYPE"
            echo "  自动执行：$AUTO_MODE"
        fi
        echo ""
    fi

    # 显示存储模式说明
    echo "存储模式说明:"
    case "$STORAGE_MODE" in
        git_full)
            echo "  Git 完整模式 - 使用 Git 进行版本控制和状态管理"
            echo "  - 代码仓库：Git"
            echo "  - 状态存储：Git + 文件"
            ;;
        git_sqlite)
            echo "  Git + SQLite 模式 - Git 代码 + SQLite 状态存储"
            echo "  - 代码仓库：Git"
            echo "  - 状态存储：SQLite"
            ;;
        filesystem)
            echo "  降级模式 - 纯文件系统（无 Git 依赖）"
            echo "  - 代码仓库：文件"
            echo "  - 状态存储：文件"
            ;;
    esac
    echo ""

    echo "目录结构:"
    echo "  .claude/commands/     - Claude Code 命令"
    echo "  .eket/                - EKET 配置和状态"
    echo "  inbox/                - 输入目录"
    echo "  outbox/               - 输出目录"
    echo "  tasks/                - 任务目录"
    echo "  skills/               - Skills 定义"
    echo "  scripts/              - 工具脚本"
    echo "  confluence/           - 文档仓库 (Git)"
    echo "  jira/                 - 任务仓库 (Git)"
    echo "  code_repo/            - 代码仓库 (Git)"
    echo ""
    echo "快速开始:"
    echo ""
    echo "1. 进入项目目录:"
    echo "   cd $PROJECT_ROOT"
    echo ""

    # 根据角色显示不同指南
    if [ "$ROLE" = "slaver" ]; then
        if [ "$AUTO_MODE" = "true" ]; then
            echo "2. 启动 Slaver (自动模式):"
            echo "   /eket-start -a"
            echo ""
            echo "   Slaver 将自动执行:"
            echo "   - 查看 Jira tickets 并按优先级排序"
            echo "   - 选择一个 ticket 并更新状态"
            echo "   - 创建分支进行开发"
            echo "   - 编写测试并实现功能"
            echo "   - 提交 PR 并等待 Review"
        else
            echo "2. 启动 Slaver (手动模式):"
            echo "   /eket-start"
            echo ""
            echo "   然后:"
            echo "   - /eket-status   查看任务列表"
            echo "   - /eket-claim    领取任务"
            echo "   - /eket-submit-pr 提交 PR"
        fi
    else
        echo "2. 启动 Master:"
        echo "   /eket-start"
        echo ""
        echo "   Master 职责:"
        echo "   - /eket-analyze   分析需求并拆解任务"
        echo "   - /eket-review-pr 审核 PR"
        echo "   - /eket-merge     合并到 main"
    fi

    echo ""
    echo "3. 查看智能体输出:"
    echo "   - outbox/review_requests/  - Review 请求"
    echo "   - tasks/                   - 任务列表"
    echo "   - jira/tickets/            - Jira 票证"
    echo ""
    echo "========================================"
    echo ""
}

# 主流程
main() {
    create_directories
    copy_templates
    configure_git_repos
    check_and_start_backend    # 新增：检查和启动高效通信后端
    configure_slaver_mode
    show_guide
}

main "$@"
