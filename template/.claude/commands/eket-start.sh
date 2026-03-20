#!/bin/bash
# /eket-start - EKET 实例启动和初始化逻辑

set -e

echo "========================================"
echo "EKET 实例启动"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
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
# 步骤 1: 检查三仓库目录
# ==========================================
echo ""
echo -e "${BLUE}## 步骤 1: 检查三仓库目录${NC}"
echo ""

CONFLUENCE_EXISTS=false
JIRA_EXISTS=false
CODE_REPO_EXISTS=false

if [ -d "confluence" ] && [ -f "confluence/README.md" ]; then
    CONFLUENCE_EXISTS=true
    echo -e "${GREEN}✓${NC} Confluence 仓库存在"
else
    echo -e "${YELLOW}○${NC} Confluence 仓库不存在"
fi

if [ -d "jira" ] && [ -f "jira/README.md" ]; then
    JIRA_EXISTS=true
    echo -e "${GREEN}✓${NC} Jira 仓库存在"
else
    echo -e "${YELLOW}○${NC} Jira 仓库不存在"
fi

if [ -d "code_repo" ] || [ -d "src" ]; then
    CODE_REPO_EXISTS=true
    echo -e "${GREEN}✓${NC} 代码仓库存在"
else
    echo -e "${YELLOW}○${NC} 代码仓库不存在"
fi

echo ""

# ==========================================
# 步骤 2: 决定模式
# ==========================================
echo -e "${BLUE}## 步骤 2: 决定实例模式${NC}"
echo ""

if [ "$CONFLUENCE_EXISTS" = false ] || [ "$JIRA_EXISTS" = false ] || [ "$CODE_REPO_EXISTS" = false ]; then
    INSTANCE_MODE="setup"
    echo -e "${GREEN}检测到项目未完整初始化${NC}"
    echo -e "进入：${YELLOW}任务设定模式 (Task Setup Mode)${NC}"
    echo ""
    echo "原因:"
    [ "$CONFLUENCE_EXISTS" = false ] && echo "  - Confluence 仓库缺失"
    [ "$JIRA_EXISTS" = false ] && echo "  - Jira 仓库缺失"
    [ "$CODE_REPO_EXISTS" = false ] && echo "  - 代码仓库缺失"
    echo ""
else
    INSTANCE_MODE="execution"
    echo -e "${GREEN}检测到项目已初始化${NC}"
    echo -e "进入：${YELLOW}任务承接模式 (Task Execution Mode)${NC}"
    echo ""
fi

# 保存模式状态
mkdir -p ".eket/state"
echo "mode: $INSTANCE_MODE" > ".eket/state/instance_mode.yml"
echo "instance_started_at: $(date -Iseconds)" >> ".eket/state/instance_mode.yml"
echo "auto_mode: $AUTO_MODE" >> ".eket/state/instance_mode.yml"

# ==========================================
# 步骤 3: 执行对应模式逻辑
# ==========================================
if [ "$INSTANCE_MODE" = "setup" ]; then
    # ========== 任务设定模式 ==========
    echo -e "${BLUE}## 步骤 3: 任务设定模式${NC}"
    echo ""

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│                    任务设定模式                               │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  协调智能体将执行：                                          │"
    echo "│  1. 读取 inbox/human_input.md 中的需求                        │"
    echo "│  2. 分析需求并拆解为 Epic 和功能任务                           │"
    echo "│  3. 创建 Confluence 文档 (需求/架构/设计)                      │"
    echo "│  4. 创建 Jira 任务票                                           │"
    echo "│  5. 设定任务优先级和依赖关系                                  │"
    echo "│                                                              │"
    echo "│  输出位置：                                                  │"
    echo "│  • confluence/projects/{project}/requirements/              │"
    echo "│  • confluence/projects/{project}/architecture/              │"
    echo "│  • jira/epics/                                              │"
    echo "│  • jira/tickets/feature/                                    │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""

    # 检查是否有输入需求
    if [ -f "inbox/human_input.md" ]; then
        HAS_INPUT=$(grep -v "^#" "inbox/human_input.md" | grep -v "^$" | grep -v "^---" | wc -l)
        if [ "$HAS_INPUT" -gt 5 ]; then
            echo -e "${GREEN}✓${NC} 检测到人类输入需求"
            echo ""
            echo "需求摘要:"
            head -15 "inbox/human_input.md"
            echo ""
            echo "┌──────────────────────────────────────────────────────────────┐"
            echo "│  下一步：协调智能体开始分析需求                               │"
            echo "│  - 调用 user_interview SKILL                                │"
            echo "│  - 调用 requirement_decomposition SKILL                     │"
            echo "│  - 创建 Epic 和功能任务                                      │"
            echo "└──────────────────────────────────────────────────────────────┘"
        else
            echo -e "${YELLOW}⚠${NC} inbox/human_input.md 内容为空或过于简单"
            echo ""
            echo "请在 inbox/human_input.md 中描述你的项目愿景:"
            echo "  - 项目背景"
            echo "  - 目标用户"
            echo "  - 核心功能"
            echo "  - 技术栈偏好 (可选)"
            echo ""
        fi
    else
        echo -e "${YELLOW}⚠${NC} inbox/human_input.md 不存在"
        echo ""
        echo "创建需求输入文件..."
        mkdir -p inbox
        cat > "inbox/human_input.md" << 'EOF'
# 项目需求输入

## 项目愿景

<!-- 在这里描述你的项目愿景 -->


## 目标用户

<!-- 谁是这个项目的目标用户？ -->


## 核心功能

<!-- 列出 3-5 个核心功能 -->

- [ ]
- [ ]
- [ ]

## 技术栈偏好 (可选)

<!-- 如果有偏好的技术栈，请在这里说明 -->


## 其他说明

<!-- 任何其他相关信息 -->

EOF
        echo -e "${GREEN}✓${NC} 已创建 inbox/human_input.md"
        echo ""
        echo "请编辑此文件描述你的项目愿景"
    fi

else
    # ========== 任务承接模式 ==========
    echo -e "${BLUE}## 步骤 3: 任务承接模式${NC}"
    echo ""

    # 检查运行模式
    if [ "$AUTO_MODE" = true ]; then
        echo -e "${GREEN}✓${NC} 运行模式：${YELLOW}自动模式${NC}"
    else
        echo -e "${GREEN}✓${NC} 运行模式：${YELLOW}手动模式${NC}"
    fi
    echo ""

    # ======================================
    # 步骤 3.1: 阅读 Confluence 了解背景
    # ======================================
    echo -e "${BLUE}## 步骤 4: 阅读项目背景${NC}"
    echo ""

    if [ -d "confluence/projects" ]; then
        PROJECT_DOCS=$(find "confluence/projects" -name "*.md" | head -5)
        if [ -n "$PROJECT_DOCS" ]; then
            echo -e "${GREEN}✓${NC} 发现项目文档"
            echo ""
            echo "最近文档:"
            echo "$PROJECT_DOCS"
            echo ""
            echo "正在阅读项目背景..."
            # 这里可以添加读取文档并总结的逻辑
        else
            echo -e "${YELLOW}⚠${NC} 未发现项目文档"
        fi
    else
        echo -e "${YELLOW}⚠${NC} Confluence 目录不存在"
    fi

    echo ""

    # ======================================
    # 步骤 3.2: 检查 Jira 任务
    # ======================================
    echo -e "${BLUE}## 步骤 5: 检查 Jira 任务${NC}"
    echo ""

    if [ -d "jira/tickets" ]; then
        # 统计任务数量
        FEATURE_COUNT=$(find "jira/tickets/feature" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        BUGFIX_COUNT=$(find "jira/tickets/bugfix" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        TASK_COUNT=$(find "jira/tickets/task" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

        echo "任务统计:"
        echo "  - 功能任务：$FEATURE_COUNT"
        echo "  - 缺陷修复：$BUGFIX_COUNT"
        echo "  - 其他任务：$TASK_COUNT"
        echo ""

        TOTAL_COUNT=$((FEATURE_COUNT + BUGFIX_COUNT + TASK_COUNT))

        if [ "$TOTAL_COUNT" -eq 0 ]; then
            echo -e "${YELLOW}⚠${NC} 暂无待处理任务"
            echo ""
            echo "建议:"
            echo "  1. 切换到任务设定模式创建新任务"
            echo "     /eket-mode setup"
            echo ""
            echo "  2. 或者在 inbox/human_input.md 中提出新需求"
        else
            # 查找待领取任务 (status: ready 或 backlog)
            READY_TASKS=()
            for file in jira/tickets/feature/*.md jira/tickets/task/*.md; do
                if [ -f "$file" ]; then
                    STATUS=$(grep "^status:" "$file" 2>/dev/null | cut -d' ' -f2)
                    if [ "$STATUS" = "ready" ] || [ "$STATUS" = "backlog" ]; then
                        READY_TASKS+=("$file")
                    fi
                fi
            done

            READY_COUNT=${#READY_TASKS[@]}
            echo "待领取任务：$READY_COUNT"
            echo ""

            if [ "$READY_COUNT" -eq 0 ]; then
                echo -e "${GREEN}✓${NC} 所有任务已被领取或处理中"
            else
                if [ "$AUTO_MODE" = true ]; then
                    # ========== 自动模式 ==========
                    echo -e "${BLUE}## 自动模式：选择任务${NC}"
                    echo ""

                    # 按优先级排序任务
                    echo "正在分析任务优先级..."

                    # 这里调用任务排序脚本
                    if [ -x "scripts/prioritize-tasks.sh" ]; then
                        ./scripts/prioritize-tasks.sh -a
                    else
                        echo -e "${YELLOW}⚠${NC} prioritize-tasks.sh 不存在，使用默认排序"
                        echo ""
                        echo "待领取任务列表:"
                        for task in "${READY_TASKS[@]}"; do
                            PRIORITY=$(grep "^priority:" "$task" 2>/dev/null | cut -d' ' -f2)
                            echo "  - $task (priority: ${PRIORITY:-normal})"
                        done
                    fi
                else
                    # ========== 手动模式 ==========
                    echo -e "${BLUE}## 手动模式：推荐任务${NC}"
                    echo ""

                    # 分析并推荐任务
                    if [ -x "scripts/recommend-tasks.sh" ]; then
                        ./scripts/recommend-tasks.sh
                    else
                        echo "正在分析任务..."
                        echo ""
                        echo "┌──────────────────────────────────────────────────────────────┐"
                        echo "│              推荐优先处理的任务                               │"
                        echo "├──────────────────────────────────────────────────────────────┤"

                        # 简单分析：按类型和优先级
                        RECOMMENDATION=1
                        for task in "${READY_TASKS[@]}"; do
                            if [ "$RECOMMENDATION" -le 3 ]; then
                                TITLE=$(grep "^title:" "$task" 2>/dev/null | cut -d':' -f2 | xargs)
                                PRIORITY=$(grep "^priority:" "$task" 2>/dev/null | cut -d' ' -f2)
                                echo "│  $RECOMMENDATION. $(basename "$task")"
                                echo "│     标题：${TITLE:-无标题}"
                                echo "│     优先级：${PRIORITY:-normal}"
                                echo "│     理由：任务已就绪，可以开始执行"
                                echo "│"
                                RECOMMENDATION=$((RECOMMENDATION + 1))
                            fi
                        done
                        echo "└──────────────────────────────────────────────────────────────┘"
                        echo ""
                        echo "使用以下命令领取任务:"
                        echo "  /eket-claim <task-id>"
                        echo ""
                    fi
                fi
            fi
        fi
    else
        echo -e "${YELLOW}⚠${NC} Jira 目录不存在"
        echo ""
        echo "建议:"
        echo "  1. 初始化三仓库"
        echo "     ./scripts/init-three-repos.sh"
        echo ""
        echo "  2. 或切换到任务设定模式创建任务"
        echo "     /eket-mode setup"
    fi
fi

echo ""
echo "========================================"
echo "实例启动完成"
echo "========================================"
echo ""
echo "当前状态:"
echo "  实例模式：$INSTANCE_MODE"
echo "  自动模式：$AUTO_MODE"
echo "  项目根目录：$PROJECT_ROOT"
echo ""

if [ "$INSTANCE_MODE" = "execution" ]; then
    echo "下一步:"
    if [ "$AUTO_MODE" = true ]; then
        echo "  自动模式将自动领取并处理优先级最高的任务"
    else
        echo "  查看推荐任务并领取:"
        echo "    /eket-claim <task-id>"
    fi
fi

echo ""
