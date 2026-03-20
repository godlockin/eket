#!/bin/bash
# scripts/init-three-repos.sh - 初始化三 Git 仓库架构

set -e

echo "========================================"
echo "EKET 三仓库初始化"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# 参数
PROJECT_NAME="${1:-my-project}"
ORG_NAME="${2:-my-org}"
REMOTE_TYPE="${3:-github}"  # github 或 gitlab

# 仓库 URL 前缀
if [ "$REMOTE_TYPE" = "github" ]; then
    BASE_URL="https://github.com/${ORG_NAME}"
else
    BASE_URL="https://gitlab.com/${ORG_NAME}"
fi

MAIN_REPO="${BASE_URL}/${PROJECT_NAME}.git"
CONFLUENCE_REPO="${BASE_URL}/${PROJECT_NAME}-confluence.git"
JIRA_REPO="${BASE_URL}/${PROJECT_NAME}-jira.git"

echo "项目信息:"
echo "  项目名称：$PROJECT_NAME"
echo "  组织名称：$ORG_NAME"
echo "  远程类型：$REMOTE_TYPE"
echo ""
echo "仓库 URL:"
echo "  主仓库：$MAIN_REPO"
echo "  Confluence: $CONFLUENCE_REPO"
echo "  Jira: $JIRA_REPO"
echo ""

# 确认
read -p "确定要继续吗？(y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠${NC} 操作已取消"
    exit 0
fi

# ==========================================
# 步骤 1: 初始化 Confluence 仓库
# ==========================================
echo ""
echo -e "${BLUE}## 步骤 1: 初始化 Confluence 仓库${NC}"
echo ""

if [ -d "confluence" ]; then
    echo -e "${YELLOW}⚠${NC} confluence/ 目录已存在，跳过初始化"
else
    echo "创建 Confluence 仓库结构..."

    # 如果远程仓库存在，clone 它
    if git ls-remote "$CONFLUENCE_REPO" &>/dev/null; then
        git clone "$CONFLUENCE_REPO" confluence
        echo -e "${GREEN}✓${NC} 从远程 clone Confluence 仓库"
    else
        # 创建本地仓库结构
        mkdir -p confluence
        cd confluence
        git init -b main

        # 创建目录结构
        mkdir -p projects/"$PROJECT_NAME"/requirements
        mkdir -p projects/"$PROJECT_NAME"/architecture
        mkdir -p projects/"$PROJECT_NAME"/design
        mkdir -p projects/"$PROJECT_NAME"/specifications
        mkdir -p projects/"$PROJECT_NAME"/meetings
        mkdir -p projects/"$PROJECT_NAME"/releases
        mkdir -p memory/best-practices
        mkdir -p memory/decisions
        mkdir -p memory/lessons-learned
        mkdir -p templates

        # 创建 README
        cat > README.md << EOF
# ${PROJECT_NAME} Confluence

项目文档中心

## 目录结构

- \`projects/\` - 项目文档
- \`memory/\` - 组织记忆
- \`templates/\` - 文档模板

## 快速开始

\`\`\`bash
# 查看需求文档
ls projects/${PROJECT_NAME}/requirements/

# 查看架构设计
ls projects/${PROJECT_NAME}/architecture/
\`\`\`
EOF

        git add .
        git commit -m "init: Confluence 仓库初始化"
        cd ..

        echo -e "${GREEN}✓${NC} Confluence 仓库结构创建完成"
    fi
fi

# ==========================================
# 步骤 2: 初始化 Jira 仓库
# ==========================================
echo ""
echo -e "${BLUE}## 步骤 2: 初始化 Jira 仓库${NC}"
echo ""

if [ -d "jira" ]; then
    echo -e "${YELLOW}⚠${NC} jira/ 目录已存在，跳过初始化"
else
    echo "创建 Jira 仓库结构..."

    # 如果远程仓库存在，clone 它
    if git ls-remote "$JIRA_REPO" &>/dev/null; then
        git clone "$JIRA_REPO" jira
        echo -e "${GREEN}✓${NC} 从远程 clone Jira 仓库"
    else
        # 创建本地仓库结构
        mkdir -p jira
        cd jira
        git init -b main

        # 创建目录结构
        mkdir -p epics
        mkdir -p tickets/feature
        mkdir -p tickets/bugfix
        mkdir -p tickets/task
        mkdir -p index/by-feature
        mkdir -p index/by-status
        mkdir -p index/by-assignee
        mkdir -p state
        mkdir -p templates

        # 创建初始化状态文件
        cat > state/active-tickets.json << EOF
{
  "last_updated": "$(date -Iseconds)",
  "tickets": []
}
EOF

        cat > state/dependencies.json << EOF
{
  "last_updated": "$(date -Iseconds)",
  "dependencies": []
}
EOF

        # 创建 README
        cat > README.md << EOF
# ${PROJECT_NAME} Jira

任务管理中心

## 目录结构

- \`epics/\` - Epic 管理
- \`tickets/\` - 任务票
  - \`feature/\` - 功能票
  - \`bugfix/\` - 缺陷票
  - \`task/\` - 任务票
- \`index/\` - 索引
- \`state/\` - 状态追踪
- \`templates/\` - 票证模板

## 票证状态

- \`backlog\` - 待分析
- \`analysis\` - 分析中
- \`approved\` - 已批准
- \`ready\` - 准备就绪
- \`dev\` - 开发中
- \`test\` - 测试中
- \`review\` - Review 中
- \`done\` - 已完成

## 快速开始

\`\`\`bash
# 查看所有票证
ls tickets/feature/

# 查看活跃任务
cat state/active-tickets.json
\`\`\`
EOF

        git add .
        git commit -m "init: Jira 仓库初始化"
        cd ..

        echo -e "${GREEN}✓${NC} Jira 仓库结构创建完成"
    fi
fi

# ==========================================
# 步骤 3: 配置 Submodule
# ==========================================
echo ""
echo -e "${BLUE}## 步骤 3: 配置 Submodule${NC}"
echo ""

# 检查是否已有 submodule
if [ -f ".gitmodules" ]; then
    echo -e "${YELLOW}⚠${NC} .gitmodules 已存在"

    if grep -q "confluence" ".gitmodules"; then
        echo -e "${GREEN}✓${NC} Confluence submodule 已配置"
    else
        echo "添加 Confluence submodule..."
        git submodule add "$CONFLUENCE_REPO" confluence
        echo -e "${GREEN}✓${NC} Confluence submodule 添加成功"
    fi

    if grep -q "jira" ".gitmodules"; then
        echo -e "${GREEN}✓${NC} Jira submodule 已配置"
    else
        echo "添加 Jira submodule..."
        git submodule add "$JIRA_REPO" jira
        echo -e "${GREEN}✓${NC} Jira submodule 添加成功"
    fi
else
    echo "创建 .gitmodules..."

    # 添加 Confluence submodule
    if [ -d "confluence/.git" ]; then
        git submodule add "$CONFLUENCE_REPO" confluence
    fi

    # 添加 Jira submodule
    if [ -d "jira/.git" ]; then
        git submodule add "$JIRA_REPO" jira
    fi

    echo -e "${GREEN}✓${NC} .gitmodules 创建完成"
fi

# ==========================================
# 步骤 4: 配置远程仓库
# ==========================================
echo ""
echo -e "${BLUE}## 步骤 4: 配置远程仓库${NC}"
echo ""

# 检查主仓库 remote
if git remote -v | grep -q "origin"; then
    echo -e "${GREEN}✓${NC} 主仓库 remote 已配置"
else
    echo "添加主仓库 remote..."
    git remote add origin "$MAIN_REPO"
    echo -e "${GREEN}✓${NC} 主仓库 remote 添加成功"
fi

# ==========================================
# 步骤 5: 提交配置
# ==========================================
echo ""
echo -e "${BLUE}## 步骤 5: 提交配置${NC}"
echo ""

git add .gitmodules
git commit -m "chore: 配置三仓库 submodule" || echo "无变更"

echo ""
echo "========================================"
echo "三仓库初始化完成!"
echo "========================================"
echo ""
echo "仓库结构:"
echo "  主仓库：$(pwd)"
echo "  Confluence: $(pwd)/confluence"
echo "  Jira: $(pwd)/jira"
echo ""
echo "下一步:"
echo "  1. 推送所有仓库到远程:"
echo "     git push -u origin main"
echo "     cd confluence && git push -u origin main"
echo "     cd ../jira && git push -u origin main"
echo ""
echo "  2. 运行 /eket-init 启动 EKET 框架"
echo ""
