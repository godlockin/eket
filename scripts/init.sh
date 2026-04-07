#!/bin/bash
# EKET 框架初始化脚本

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "EKET Agent Framework - 初始化"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Python 版本
check_python() {
    echo "检查 Python 环境..."

    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version)
        echo -e "${GREEN}✓${NC} $PYTHON_VERSION"
    elif command -v python &> /dev/null; then
        PYTHON_VERSION=$(python --version)
        echo -e "${GREEN}✓${NC} $PYTHON_VERSION"
    else
        echo -e "${RED}✗${NC} 未找到 Python"
        exit 1
    fi
}

# 检查 Git
check_git() {
    echo "检查 Git 环境..."

    if command -v git &> /dev/null; then
        GIT_VERSION=$(git --version)
        echo -e "${GREEN}✓${NC} $GIT_VERSION"
    else
        echo -e "${RED}✗${NC} 未找到 Git"
        exit 1
    fi
}

# 创建必要的目录
create_directories() {
    echo ""
    echo "创建目录结构..."

    directories=(
        "shared/confluence"
        "shared/code_repo"
        "shared/jira"
        "shared/message_queue/inbox"
        "shared/message_queue/outbox"
        "shared/message_queue/broadcast"
        "shared/message_queue/dead_letter"
        "shared/.state"
        "private/workspaces"
        "logs"
        "logs/agents"
        "logs/memory"
        "runtime/memory/short_term"
        "runtime/memory/long_term"
        "shared/confluence/memory"
    )

    for dir in "${directories[@]}"; do
        full_path="$ROOT_DIR/$dir"
        if [ -d "$full_path" ]; then
            echo -e "${GREEN}✓${NC} $dir (已存在)"
        else
            mkdir -p "$full_path"
            echo -e "${GREEN}✓${NC} $dir"
        fi
    done
}

# 初始化 Git 仓库
init_git_repos() {
    echo ""
    echo "初始化 Git 仓库..."

    repos=(
        "shared/confluence"
        "shared/code_repo"
        "shared/jira"
    )

    for repo in "${repos[@]}"; do
        repo_path="$ROOT_DIR/$repo"

        if [ -d "$repo_path/.git" ]; then
            echo -e "${GREEN}✓${NC} $repo (已初始化)"
        else
            cd "$repo_path"
            git init -b main
            git config user.name "eket-agent"
            git config user.email "agent@eket.local"

            # 创建初始提交
            echo "# $repo" > README.md
            echo "" >> README.md
            echo "初始化的 EKET $repo 仓库" >> README.md

            git add README.md
            git commit -m "init: 初始提交"

            echo -e "${GREEN}✓${NC} $repo"
            cd "$ROOT_DIR"
        fi
    done
}

# 设置 Git hooks
setup_git_hooks() {
    echo ""
    echo "设置 Git hooks..."

    hooks_dir="$ROOT_DIR/hooks"

    # 为每个仓库设置 hook 符号链接
    repos=(
        "shared/confluence"
        "shared/code_repo"
        "shared/jira"
    )

    for repo in "${repos[@]}"; do
        repo_path="$ROOT_DIR/$repo"
        hook_target="$repo_path/.git/hooks"

        if [ -d "$hook_target" ]; then
            # 创建 post-commit hook
            cat > "$hook_target/post-commit" << 'EOF'
#!/bin/bash
# Post-commit hook - 通知调度器

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_FILE="$WORKSPACE_ROOT/shared/.state/last_commit.json"

echo "{\"timestamp\": \"$(date -Iseconds)\", \"repo\": \"$(basename $(dirname $(dirname $WORKSPACE_ROOT)))\"}" > "$STATE_FILE"
EOF

            chmod +x "$hook_target/post-commit"
            echo -e "${GREEN}✓${NC} $repo/.git/hooks/post-commit"
        fi
    done
}

# 创建初始状态文件
create_state_files() {
    echo ""
    echo "创建状态文件..."

    state_dir="$ROOT_DIR/shared/.state"

    # agents.json
    if [ ! -f "$state_dir/agents.json" ]; then
        echo '{"agents": {}}' > "$state_dir/agents.json"
        echo -e "${GREEN}✓${NC} agents.json"
    fi

    # executor_registry.json
    if [ ! -f "$state_dir/executor_registry.json" ]; then
        cat > "$state_dir/executor_registry.json" << 'EOF'
{
  "executors": [],
  "last_updated": null
}
EOF
        echo -e "${GREEN}✓${NC} executor_registry.json"
    fi

    # last_commit.json
    echo '{"timestamp": null, "repo": null}' > "$state_dir/last_commit.json"
    echo -e "${GREEN}✓${NC} last_commit.json"
}

# 创建示例 Jira tickets
create_sample_tickets() {
    echo ""
    echo "创建示例数据..."

    tickets_dir="$ROOT_DIR/shared/jira/tickets"
    mkdir -p "$tickets_dir"

    # 示例 ticket
    sample_ticket='{
  "id": "FEAT-001",
  "type": "feat",
  "title": "示例功能",
  "description": "这是一个示例 Jira ticket，用于测试系统",
  "status": "backlog",
  "priority": "medium",
  "acceptance_criteria": [
    "功能可以正常工作",
    "通过所有测试"
  ],
  "created_at": "'"$(date -Iseconds)"'",
  "created_by": "system"
}'

    echo "$sample_ticket" > "$tickets_dir/FEAT-001.json"
    echo -e "${GREEN}✓${NC} 示例 ticket: FEAT-001"
}

# 验证配置
validate_config() {
    echo ""
    echo "验证配置..."

    config_files=(
        "config/system.yml"
        "config/agents.yml"
        "agents/agent_base_template.yml"
        "CLAUDE.md"
        "AGENTS.md"
        "SKILLS.md"
    )

    for file in "${config_files[@]}"; do
        full_path="$ROOT_DIR/$file"
        if [ -f "$full_path" ]; then
            echo -e "${GREEN}✓${NC} $file"
        else
            echo -e "${YELLOW}⚠${NC} $file (缺失)"
        fi
    done
}

# 显示使用指南
show_guide() {
    echo ""
    echo "========================================"
    echo "初始化完成!"
    echo "========================================"
    echo ""
    echo "快速开始:"
    echo ""
    echo "1. 启动实例:"
    echo "   node node/dist/index.js instance:start --auto"
    echo "   或使用 Claude Code 命令：/eket-start"
    echo ""
    echo "2. 查看智能体状态:"
    echo "   node node/dist/index.js pool:status"
    echo ""
    echo "3. 创建新任务:"
    echo "   编辑 jira/tickets/ 目录"
    echo ""
    echo "========================================"
    echo ""
}

# 主流程
main() {
    cd "$ROOT_DIR"

    check_python
    check_git
    create_directories
    init_git_repos
    setup_git_hooks
    create_state_files
    create_sample_tickets
    validate_config
    show_guide
}

main "$@"
