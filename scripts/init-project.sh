#!/bin/bash
# EKET 项目初始化脚本

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
        "outbox"
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
            sed -i '' "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "CLAUDE.md" 2>/dev/null || \
            sed -i "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "CLAUDE.md"
            echo -e "${GREEN}✓${NC} CLAUDE.md"
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
            sed -i '' "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${PROJECT_NAME}/$PROJECT_NAME/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/\${CREATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${CREATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/\${UPDATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${UPDATE_DATE}/$(date -I)/g" "SYSTEM-SETTINGS.md"
            sed -i '' "s/\${MAINTAINER}/$(whoami)/g" "SYSTEM-SETTINGS.md" 2>/dev/null || \
            sed -i "s/\${MAINTAINER}/$(whoami)/g" "SYSTEM-SETTINGS.md"
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
    else
        echo -e "${YELLOW}⚠${NC} 未找到 template 目录，跳过文件复制"
    fi
}

# 配置 Git 仓库信息
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
    echo "请配置以下 Git 远程仓库信息（可选，跳过请输入 -）"
    echo ""

    # 配置主代码仓库 remote
    read -p "主仓库 Remote URL (例如：git@github.com:org/project.git): " CODE_REPO_URL
    if [ -n "$CODE_REPO_URL" ] && [ "$CODE_REPO_URL" != "-" ]; then
        git remote add origin "$CODE_REPO_URL" 2>/dev/null || git remote set-url origin "$CODE_REPO_URL"
        echo -e "${GREEN}✓${NC} 主仓库 remote 已配置：$CODE_REPO_URL"
    fi

    # ==========================================
    # 初始化三仓库架构
    # ==========================================
    echo ""
    echo "----------------------------------------"
    echo "EKET 使用三仓库架构 (Confluence/Jira/CodeRepo)"
    echo "----------------------------------------"
    echo ""

    # Confluence 仓库
    read -p "Confluence 仓库 URL (或留空创建本地仓库): " CONFLUENCE_URL
    if [ -n "$CONFLUENCE_URL" ] && [ "$CONFLUENCE_URL" != "-" ]; then
        if git ls-remote "$CONFLUENCE_URL" &>/dev/null; then
            git clone "$CONFLUENCE_URL" confluence
            echo -e "${GREEN}✓${NC} Confluence 仓库已 clone"
        else
            echo -e "${YELLOW}⚠${NC} 远程仓库不可访问，创建本地仓库"
            mkdir -p confluence
            cd confluence
            git init -b main
            git config user.name "eket-agent"
            git config user.email "agent@eket.local"
            mkdir -p projects/"$PROJECT_NAME"/{requirements,architecture,design,specifications,meetings,releases}
            mkdir -p memory/{best-practices,decisions,lessons-learned}
            mkdir -p templates
            echo "# $PROJECT_NAME Confluence" > README.md
            git add . && git commit -m "init: Confluence 仓库初始化"
            cd ..
            echo -e "${GREEN}✓${NC} Confluence 本地仓库已创建"
        fi
    else
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
        git add . && git commit -m "init: Confluence 仓库初始化"
        cd ..
        echo -e "${GREEN}✓${NC} Confluence 本地仓库已创建"
    fi

    # Jira 仓库
    read -p "Jira 仓库 URL (或留空创建本地仓库): " JIRA_URL
    if [ -n "$JIRA_URL" ] && [ "$JIRA_URL" != "-" ]; then
        if git ls-remote "$JIRA_URL" &>/dev/null; then
            git clone "$JIRA_URL" jira
            echo -e "${GREEN}✓${NC} Jira 仓库已 clone"
        else
            echo -e "${YELLOW}⚠${NC} 远程仓库不可访问，创建本地仓库"
            mkdir -p jira
            cd jira
            git init -b main
            git config user.name "eket-agent"
            git config user.email "agent@eket.local"
            mkdir -p {epics,tickets/feature,tickets/bugfix,tickets/task,index/{by-feature,by-status,by-assignee},state,templates}
            echo "# $PROJECT_NAME Jira" > README.md
            git add . && git commit -m "init: Jira 仓库初始化"
            cd ..
            echo -e "${GREEN}✓${NC} Jira 本地仓库已创建"
        fi
    else
        echo "创建 Jira 本地仓库..."
        mkdir -p jira
        cd jira
        git init -b main
        git config user.name "eket-agent"
        git config user.email "agent@eket.local"
        mkdir -p {epics,tickets/feature,tickets/bugfix,tickets/task,index/{by-feature,by-status,by-assignee},state,templates}
        echo "# $PROJECT_NAME Jira" > README.md
        git add . && git commit -m "init: Jira 仓库初始化"
        cd ..
        echo -e "${GREEN}✓${NC} Jira 本地仓库已创建"
    fi

    # Code 仓库
    read -p "Code 仓库 URL (或留空创建本地仓库): " CODE_SUB_REPO_URL
    if [ -n "$CODE_SUB_REPO_URL" ] && [ "$CODE_SUB_REPO_URL" != "-" ]; then
        if git ls-remote "$CODE_SUB_REPO_URL" &>/dev/null; then
            git clone "$CODE_SUB_REPO_URL" code_repo
            echo -e "${GREEN}✓${NC} Code 仓库已 clone"
        else
            echo -e "${YELLOW}⚠${NC} 远程仓库不可访问，创建本地仓库"
            mkdir -p code_repo
            cd code_repo
            git init -b main
            git config user.name "eket-agent"
            git config user.email "agent@eket.local"
            mkdir -p {src,tests,configs,deployments,docs}
            echo "# $PROJECT_NAME Code Repository" > README.md
            git add . && git commit -m "init: Code 仓库初始化"
            cd ..
            echo -e "${GREEN}✓${NC} Code 本地仓库已创建"
        fi
    else
        echo "创建 Code 本地仓库..."
        mkdir -p code_repo
        cd code_repo
        git init -b main
        git config user.name "eket-agent"
        git config user.email "agent@eket.local"
        mkdir -p {src,tests,configs,deployments,docs}
        echo "# $PROJECT_NAME Code Repository" > README.md
        git add . && git commit -m "init: Code 仓库初始化"
        cd ..
        echo -e "${GREEN}✓${NC} Code 本地仓库已创建"
    fi

    # 配置 submodule
    echo ""
    echo "配置 Git Submodules..."
    if [ -d "confluence/.git" ]; then
        git submodule add ./confluence confluence 2>/dev/null || echo "Confluence submodule 已配置"
    fi
    if [ -d "jira/.git" ]; then
        git submodule add ./jira jira 2>/dev/null || echo "Jira submodule 已配置"
    fi
    if [ -d "code_repo/.git" ]; then
        git submodule add ./code_repo code_repo 2>/dev/null || echo "Code submodule 已配置"
    fi
    echo -e "${GREEN}✓${NC} Git Submodules 配置完成"
}

# 配置 Slaver 模式和自动执行
configure_slaver_mode() {
    echo ""
    echo "========================================"
    echo "配置 Slaver 模式和自动执行"
    echo "========================================"
    echo ""

    cd "$PROJECT_ROOT"

    # 选择角色模式
    echo "请选择实例角色:"
    echo "  1) Master - 协调实例 (负责任务分析和 Review)"
    echo "  2) Slaver - 执行实例 (负责领取和执行任务)"
    echo ""
    read -p "选择 [1/2]，默认 2: " ROLE_CHOICE

    if [ "$ROLE_CHOICE" = "1" ]; then
        INSTANCE_ROLE="master"
        echo -e "${BLUE}✓${NC} 已选择：Master 模式"
    else
        INSTANCE_ROLE="slaver"
        echo -e "${BLUE}✓${NC} 已选择：Slaver 模式"
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

        echo "实例配置:"
        echo "  角色：$ROLE"
        if [ "$ROLE" = "slaver" ]; then
            echo "  专家类型：$AGENT_TYPE"
            echo "  自动执行：$AUTO_MODE"
        fi
        echo ""
    fi

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
    configure_slaver_mode
    show_guide
}

main "$@"
