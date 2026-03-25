#!/bin/bash
# EKET 项目健康检查脚本

# 不使用 set -e，避免在可恢复错误处退出

echo "========================================"
echo "EKET 项目健康检查"
echo "========================================"
echo ""

PROJECT_ROOT="${1:-$(pwd)}"
cd "$PROJECT_ROOT"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 计数器
passed=0
warning=0
error=0

check_file() {
    local file="$1"
    local required="${2:-true}"

    if [[ -f "$file" ]]; then
        echo -e "${GREEN}✓${NC} $file"
        ((passed++))
    elif [[ "$required" == "true" ]]; then
        echo -e "${RED}✗${NC} $file (缺失)"
        ((error++))
    else
        echo -e "${YELLOW}○${NC} $file (可选)"
        ((warning++))
    fi
}

check_dir() {
    local dir="$1"
    local required="${2:-true}"

    if [[ -d "$dir" ]]; then
        echo -e "${GREEN}✓${NC} $dir"
        ((passed++))
    elif [[ "$required" == "true" ]]; then
        echo -e "${RED}✗${NC} $dir (缺失)"
        ((error++))
    else
        echo -e "${YELLOW}○${NC} $dir (可选)"
        ((warning++))
    fi
}

check_executable() {
    local file="$1"

    if [[ -x "$file" ]]; then
        echo -e "${GREEN}✓${NC} $file (可执行)"
        ((passed++))
    elif [[ -f "$file" ]]; then
        echo -e "${YELLOW}⚠${NC} $file (需要 chmod +x)"
        ((warning++))
    else
        echo -e "${RED}✗${NC} $file (缺失)"
        ((error++))
    fi
}

echo "## 核心文件"
echo "----------------------------------------"
check_file "CLAUDE.md"
check_file ".eket/config.yml"
check_file "inbox/human_input.md"
check_file ".gitignore"

echo ""
echo "## Claude Code 配置"
echo "----------------------------------------"
check_dir ".claude"
check_file ".claude/settings.json"
check_dir ".claude/commands"

echo ""
echo "## EKET 目录结构"
echo "----------------------------------------"
check_dir ".eket"
check_dir ".eket/state"
check_dir ".eket/memory"
check_dir ".eket/logs"

echo ""
echo "## 通信目录"
echo "----------------------------------------"
check_dir "inbox"
check_dir "inbox/human_feedback"
check_dir "outbox"
check_dir "outbox/review_requests"
check_dir "tasks"

echo ""
echo "## 脚本文件"
echo "----------------------------------------"
check_executable "scripts/init-project.sh"
check_executable "scripts/cleanup-project.sh"

echo ""
echo "## Git 状态"
echo "----------------------------------------"
if [[ -d ".git" ]]; then
    echo -e "${GREEN}✓${NC} Git 仓库已初始化"
    ((passed++))

    # 检查当前分支
    branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    echo "  当前分支：$branch"

    # 检查是否有未提交的更改
    changes=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$changes" -eq 0 ]]; then
        echo -e "  ${GREEN}工作区干净${NC}"
    else
        echo -e "  ${YELLOW}有 $changes 个未提交的更改${NC}"
        ((warning++))
    fi
else
    echo -e "${YELLOW}○${NC} Git 仓库未初始化 (可选)"
    ((warning++))
fi

echo ""
echo "========================================"
echo "检查结果汇总"
echo "========================================"
echo -e "${GREEN}通过：$passed${NC}"
echo -e "${YELLOW}警告：$warning${NC}"
echo -e "${RED}错误：$error${NC}"
echo ""

if [[ $error -gt 0 ]]; then
    echo -e "${RED}✗ 项目配置存在问题，请检查上述错误${NC}"
    exit 1
elif [[ $warning -gt 0 ]]; then
    echo -e "${YELLOW}⚠ 项目配置基本正常，但有 $warning 个警告${NC}"
    exit 0
else
    echo -e "${GREEN}✓ 项目配置完全正常${NC}"
    exit 0
fi
