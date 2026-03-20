#!/bin/bash
# EKET 项目清理脚本

# 使用方法:
# 1. 清理当前目录:
#    ./cleanup-project.sh
#
# 2. 指定项目根目录:
#    ./cleanup-project.sh /path/to/project
#
# 3. 完全清理（包括 Git 仓库）:
#    ./cleanup-project.sh --full /path/to/project

set -e

PROJECT_ROOT="${2:-$(pwd)}"
FULL_CLEAN=false

# 检查参数
if [ "$1" = "--full" ]; then
    FULL_CLEAN=true
    PROJECT_ROOT="${2:-$(pwd)}"
elif [ -n "$1" ]; then
    PROJECT_ROOT="$1"
fi

# ==========================================
# 安全验证 - 防止误删
# ==========================================
validate_project_root() {
    local root="$1"

    # 转换为绝对路径
    root="$(cd "$root" 2>/dev/null && pwd)" || {
        echo -e "\033[0;31m✗ 错误：项目根目录不存在或无法访问\033[0m"
        exit 1
    }

    # 禁止在根目录、家目录执行
    if [[ "$root" == "/" || "$root" == "$HOME" || "$root" == ~* ]]; then
        echo -e "\033[0;31m✗ 错误：不允许在系统目录或家目录执行清理\033[0m"
        exit 1
    fi

    # 禁止路径包含危险模式
    if [[ "$root" =~ ^/usr || "$root" =~ ^/etc || "$root" =~ ^/var ]]; then
        echo -e "\033[0;31m✗ 错误：不允许在系统目录执行清理\033[0m"
        exit 1
    fi

    # 必须有 .eket 目录才认为是有效项目（完全清理模式除外）
    if [[ "$FULL_CLEAN" == "false" && ! -d "$root/.eket" ]]; then
        echo -e "\033[0;31m✗ 错误：未找到有效的 EKET 项目结构 (.eket 目录)\033[0m"
        echo -e "\033[0;31m   当前路径：$root\033[0m"
        exit 1
    fi

    echo -e "\033[0;32m✓ 项目根目录验证通过：$root\033[0m"
}

# 执行验证
validate_project_root "$PROJECT_ROOT"

echo "========================================"
echo "EKET 项目清理"
echo "========================================"
echo ""
echo "项目根目录：$PROJECT_ROOT"
echo "清理模式：$([ "$FULL_CLEAN" = true ] && echo "完全清理（包括 Git）" || echo "标准清理")"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 确认提示
confirm() {
    if [ "$FULL_CLEAN" = true ]; then
        echo -e "${YELLOW}⚠${NC} 警告：此操作将删除以下内容："
        echo "   - .git/ (Git 仓库)"
        echo "   - .gitignore"
        echo "   - .claude/ (Claude Code 配置)"
        echo "   - CLAUDE.md"
        echo "   - README.md"
        echo "   - tasks/"
        echo "   - inbox/human_feedback/"
        echo "   - outbox/review_requests/"
        echo "   - .eket/state/"
        echo "   - .eket/logs/"
        echo "   - .eket/memory/"
        echo ""
    else
        echo -e "${YELLOW}⚠${NC} 警告：此操作将删除以下目录的所有内容："
        echo "   - tasks/"
        echo "   - inbox/human_feedback/"
        echo "   - outbox/review_requests/"
        echo "   - .eket/state/"
        echo "   - .eket/logs/"
        echo "   - .eket/memory/"
        echo ""
    fi
    if [ "$FULL_CLEAN" = true ]; then
        echo -e "${YELLOW}⚠${NC} 配置文件和代码将保留（源码、.eket/config.yml 等）"
    else
        echo -e "${YELLOW}⚠${NC} 配置文件和代码将保留"
    fi
    echo ""
    read -p "确定要继续吗？(y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚠${NC} 操作已取消"
        exit 0
    fi
}

# 清理项目内容
cleanup_project() {
    echo "清理项目内容..."

    # 进入项目根目录
    cd "$PROJECT_ROOT"

    # 完全清理模式
    if [ "$FULL_CLEAN" = true ]; then
        if [ -d ".git" ]; then
            rm -rf ".git"
            echo -e "${GREEN}✓${NC} .git/ (已删除)"
        fi
        if [ -f ".gitignore" ]; then
            rm ".gitignore"
            echo -e "${GREEN}✓${NC} .gitignore (已删除)"
        fi
        if [ -d ".claude" ]; then
            rm -rf ".claude"
            echo -e "${GREEN}✓${NC} .claude/ (已删除)"
        fi
        if [ -f "CLAUDE.md" ]; then
            rm "CLAUDE.md"
            echo -e "${GREEN}✓${NC} CLAUDE.md (已删除)"
        fi
        if [ -f "README.md" ]; then
            rm "README.md"
            echo -e "${GREEN}✓${NC} README.md (已删除)"
        fi
    fi

    # 要清理的目录
    directories=(
        "tasks"
        "inbox/human_feedback"
        "outbox/review_requests"
        ".eket/state"
        ".eket/logs"
        ".eket/memory"
    )

    for dir in "${directories[@]}"; do
        if [ -d "$dir" ]; then
            rm -rf "$dir"/*
            echo -e "${GREEN}✓${NC} $dir (已清理)"
        else
            echo -e "${YELLOW}⚠${NC} $dir (不存在)"
        fi
    done

    # 清理临时文件
    if [ -f "inbox/human_input.md" ]; then
        # 保留文件但清空内容（重置为模板）
        cat > "inbox/human_input.md" << 'EOF'
# 人类输入

# 位置：inbox/human_input.md
# 在此描述你的需求，智能体会自动处理

---
timestamp: ""
priority: "normal"  # low, normal, high, urgent
---

# 需求描述

## 我想要

<!-- 在这里描述你想要的功能或任务 -->


## 背景/目的

<!-- 可选：说明为什么需要这个 -->


## 期望结果

<!-- 可选：描述你期望的最终结果 -->


## 验收标准

<!-- 列出完成的标准 -->
- [ ]
- [ ]
- [ ]


## 补充说明

<!-- 任何其他相关信息 -->


---
*智能体将分析此输入并开始处理*
EOF
        echo -e "${GREEN}✓${NC} inbox/human_input.md (已重置)"
    fi

    # 清理 human_feedback（保留模板）
    if [ -d "inbox/human_feedback" ]; then
        find "inbox/human_feedback" -type f ! -name "README.md" ! -name "status-report-template.md" -delete
        echo -e "${GREEN}✓${NC} inbox/human_feedback/ (保留模板)"
    fi

    # 清理 .claude 生成的状态文件（如果有）
    if [ "$FULL_CLEAN" = false ] && [ -d ".claude" ]; then
        echo -e "${GREEN}✓${NC} .claude/ (保留配置)"
    fi
}

# 显示完成信息
show_summary() {
    echo ""
    echo "========================================"
    echo "清理完成!"
    echo "========================================"
    echo ""
    echo "项目信息:"
    echo "  位置：$PROJECT_ROOT"
    echo ""
    if [ "$FULL_CLEAN" = true ]; then
        echo "下一步：重新初始化项目"
        echo ""
        echo "运行初始化脚本:"
        echo "  /path/to/eket/scripts/init-project.sh <project-name> $PROJECT_ROOT"
        echo ""
    else
        echo "下一步:"
        echo ""
        echo "1. 进入项目目录:"
        echo "   cd $PROJECT_ROOT"
        echo ""
        echo "2. 在 inbox/human_input.md 中描述新的需求"
        echo ""
        echo "3. 启动 Claude Code:"
        echo "   claude"
        echo ""
    fi
    echo "========================================"
}

# 主流程
main() {
    confirm
    cleanup_project
    show_summary
}

main "$@"
