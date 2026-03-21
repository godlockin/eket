#!/bin/bash
# /eket-init - EKET 框架完整初始化向导

set -e

echo "========================================"
echo "EKET 框架初始化向导"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# 模式：setup 或 execution
MODE="setup"

# ==========================================
# 步骤 1: 检查项目结构
# ==========================================
echo -e "${BLUE}## 步骤 1: 检查项目结构${NC}"
echo ""

REQUIRED_DIRS=(
    ".eket"
    ".eket/state"
    ".eket/memory"
    "inbox"
    "inbox/human_feedback"
    "outbox"
    "outbox/review_requests"
    "tasks"
)

REQUIRED_FILES=(
    "CLAUDE.md"
    ".eket/config.yml"
    "inbox/human_input.md"
)

all_ok=true

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $dir"
    else
        echo -e "${RED}✗${NC} $dir (缺失)"
        all_ok=false
    fi
done

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file (缺失)"
        all_ok=false
    fi
done

echo ""

if [ "$all_ok" = false ]; then
    echo -e "${RED}✗ 项目结构不完整${NC}"
    echo ""
    echo "请先运行项目初始化脚本:"
    echo "  /path/to/eket/scripts/init-project.sh <project-name> /path/to/project"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ 项目结构检查通过${NC}"
echo ""

# ==========================================
# 步骤 2: 检查三仓库配置
# ==========================================
echo -e "${BLUE}## 步骤 2: 检查三仓库配置${NC}"
echo ""

# 检查 submodule 配置
if [ -f ".gitmodules" ]; then
    echo -e "${GREEN}✓${NC} .gitmodules 存在"

    # 检查 Confluence submodule
    if grep -q "confluence" ".gitmodules"; then
        echo -e "${GREEN}✓${NC} Confluence 仓库已配置"
    else
        echo -e "${YELLOW}⚠${NC} Confluence 仓库未配置"
    fi

    # 检查 Jira submodule
    if grep -q "jira" ".gitmodules"; then
        echo -e "${GREEN}✓${NC} Jira 仓库已配置"
    else
        echo -e "${YELLOW}⚠${NC} Jira 仓库未配置"
    fi
else
    echo -e "${YELLOW}⚠${NC} .gitmodules 不存在"
    echo ""
    echo "提示：三仓库配置是可选的"
    echo "如需配置，运行:"
    echo "  git submodule add <confluence-repo-url> confluence"
    echo "  git submodule add <jira-repo-url> jira"
fi

# 检查远程仓库
if git remote -v | grep -q "origin"; then
    echo -e "${GREEN}✓${NC} 远程仓库已配置"
else
    echo -e "${YELLOW}⚠${NC} 远程仓库未配置"
fi

echo ""

# ==========================================
# 步骤 3: 运行健康检查
# ==========================================
echo -e "${BLUE}## 步骤 3: 运行健康检查${NC}"
echo ""

if [ -x ".eket/health_check.sh" ]; then
    ./.eket/health_check.sh || true
else
    echo -e "${YELLOW}⚠${NC} health_check.sh 不存在或不可执行"
fi

echo ""

# ==========================================
# 步骤 4: 初始化 CLAUDE.md
# ==========================================
echo -e "${BLUE}## 步骤 4: 初始化 CLAUDE.md${NC}"
echo ""

if [ -f "CLAUDE.md" ]; then
    echo -e "${GREEN}✓${NC} CLAUDE.md 已存在"
    echo ""
    echo "CLAUDE.md 内容摘要:"
    head -30 "CLAUDE.md" | grep -E "^[^#]" | head -10
else
    echo -e "${YELLOW}⚠${NC} CLAUDE.md 不存在"
    echo "从模板复制 CLAUDE.md..."
    cp "$(dirname "$0")/../../template/CLAUDE.md" "CLAUDE.md" 2>/dev/null || true
fi

echo ""

# ==========================================
# 步骤 5: 数据依赖追问检查
# ==========================================
echo -e "${BLUE}## 步骤 5: 数据依赖追问检查${NC}"
echo ""

# 检查 human_input.md 中是否包含数据依赖信息
HAS_DEPENDENCY_INFO=false

if [ -f "inbox/human_input.md" ]; then
    # 检查是否包含数据库、API 等关键词
    if grep -qiE "(database|mongodb|mysql|postgresql|sqlite|api.*key|api.*endpoint|存储 | 数据源|认证)" "inbox/human_input.md" 2>/dev/null; then
        HAS_DEPENDENCY_INFO=true
        echo -e "${GREEN}✓${NC} 检测到数据依赖信息"
    else
        echo -e "${YELLOW}⚠${NC} 未检测到数据依赖信息"
    fi
fi

# 检查是否已有依赖检查清单
if [ -f "inbox/dependency-checklist.md" ]; then
    echo -e "${GREEN}✓${NC} 依赖检查清单已填写"
    HAS_DEPENDENCY_INFO=true
fi

# 如果缺少依赖信息，创建追问文件
if [ "$HAS_DEPENDENCY_INFO" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠ 检测到缺失的依赖配置信息${NC}"
    echo ""
    echo " EKET 框架需要以下信息才能正确构建项目:"
    echo "  - 数据源配置 (数据库/API/存储)"
    echo "  - 认证和密钥管理方式"
    echo "  - 基础设施配置"
    echo ""

    # 复制追问模板
    if [ -f "$(dirname "$0")/../../template/inbox/dependency-clarification.md" ]; then
        cp "$(dirname "$0")/../../template/inbox/dependency-clarification.md" "inbox/dependency-clarification.md"
        echo -e "${GREEN}✓${NC} 已创建追问文件：inbox/dependency-clarification.md"
    fi

    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}需要用户补充依赖信息${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    echo "请完成以下操作之一:"
    echo ""
    echo "1. 编辑 inbox/human_input.md，补充数据依赖信息"
    echo "   或"
    echo "2. 填写 inbox/dependency-clarification.md 追问文件"
    echo ""
    echo "填写完成后，保存文件并重新运行 /eket-init"
    echo ""

    # 保存追问状态
    mkdir -p ".eket/state"
    cat > ".eket/state/dependency-status.yml" << EOF
status: pending_clarification
missing_categories:
  - data_sources
  - api_configuration
  - credentials_management
clarification_file: inbox/dependency-clarification.md
created_at: $(date -Iseconds)
retry_required: true
EOF

    exit 1
fi

echo ""
echo -e "${GREEN}✓${NC} 数据依赖信息完整"
echo ""

# ==========================================
# 步骤 6: 选择任务模式
# ==========================================
echo -e "${BLUE}## 步骤 6: 选择任务模式${NC}"
echo ""
echo "EKET 框架有两种任务模式:"
echo ""
echo "  1) 任务设定模式 (Task Setup Mode)"
echo "     - 项目初始化"
echo "     - 需求分析、任务拆解"
echo "     - 架构设计"
echo "     - 创建初始任务"
echo "     负责：协调智能体小组"
echo ""
echo "  2) 任务承接模式 (Task Execution Mode)"
echo "     - 任务领取"
echo "     - 代码开发"
echo "     - 测试编写"
echo "     - PR 提交"
echo "     负责：执行智能体"
echo ""

# 检查是否已有任务
task_count=$(ls -1 tasks/*.md 2>/dev/null | wc -l | tr -d ' ')
jira_exists=false
if [ -d "jira" ] && [ -d "jira/tickets" ]; then
    jira_exists=true
fi

if [ "$task_count" -eq 0 ] && [ "$jira_exists" = false ]; then
    echo -e "${GREEN}推荐${NC}: 任务设定模式 (首次启动)"
    MODE="setup"
else
    echo -e "${GREEN}推荐${NC}: 任务承接模式 (已有任务)"
    MODE="execution"
fi

echo ""
echo "当前选择：${YELLOW}$MODE${NC}"
echo ""

# ==========================================
# 步骤 7: 显示快速开始指南
# ==========================================
echo -e "${BLUE}## 步骤 7: 快速开始指南${NC}"
echo ""

if [ "$MODE" = "setup" ]; then
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              任务设定模式 - 快速开始                          │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│                                                              │"
    echo "│  1. 在 inbox/human_input.md 中描述你的项目愿景                 │"
    echo "│                                                              │"
    echo "│  2. 保存文件后，协调智能体会自动:                              │"
    echo "│     • 读取并分析需求                                          │"
    echo "│     • 拆解为 Epic 和功能任务                                   │"
    echo "│     • 创建架构设计文档                                        │"
    echo "│     • 创建任务文件到 jira/tickets/ 目录                       │"
    echo "│                                                              │"
    echo "│  3. 在 inbox/human_feedback/ 查看状态报告                     │"
    echo "│                                                              │"
    echo "│  4. 确认任务设定后，切换到任务承接模式                         │"
    echo "│                                                              │"
    echo "└──────────────────────────────────────────────────────────────┘"
else
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              任务承接模式 - 快速开始                          │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│                                                              │"
    echo "│  1. 查看待处理任务：                                          │"
    echo "│     /eket-status                                             │"
    echo "│                                                              │"
    echo "│  2. 领取任务：                                               │"
    echo "│     /eket-claim <task-id>                                    │"
    echo "│                                                              │"
    echo "│  3. 创建分支并开发：                                         │"
    echo "│     git checkout -b feature/<task-id>-desc                   │"
    echo "│                                                              │"
    echo "│  4. 完成开发后提交 PR：                                       │"
    echo "│     /eket-review <task-id>                                   │"
    echo "│                                                              │"
    echo "└──────────────────────────────────────────────────────────────┘"
fi

echo ""

# ==========================================
# 步骤 8: 显示当前输入状态
# ==========================================
echo -e "${BLUE}## 步骤 8: 显示当前输入状态${NC}"
echo ""

if [ -f "inbox/human_input.md" ]; then
    echo "inbox/human_input.md 内容:"
    echo "---"
    head -20 "inbox/human_input.md"
    echo "---"
    echo ""
    if [ "$MODE" = "setup" ]; then
        echo "提示：编辑此文件来描述你的项目愿景，然后保存"
    else
        echo "提示：查看此文件了解人类输入的需求"
    fi
else
    echo -e "${YELLOW}⚠${NC} inbox/human_input.md 不存在"
fi

echo ""
echo "========================================"
echo "初始化完成！"
echo "========================================"
echo ""
echo "当前模式：${YELLOW}$MODE${NC}"
echo ""

if [ "$MODE" = "setup" ]; then
    echo "下一步：在 inbox/human_input.md 中描述你的项目愿景"
else
    echo "下一步：运行 /eket-status 查看待处理任务"
fi

echo ""

# 保存模式状态
mkdir -p ".eket/state"
echo "mode: $MODE" > ".eket/state/mode.yml"
echo "initialized_at: $(date -Iseconds)" >> ".eket/state/mode.yml"

# 输出模式切换命令
echo "切换模式命令:"
echo "  /eket-mode setup      # 切换到任务设定模式"
echo "  /eket-mode execution  # 切换到任务承接模式"
echo ""
