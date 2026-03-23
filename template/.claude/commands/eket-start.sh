#!/bin/bash
# /eket-start - EKET 实例启动和初始化逻辑 (v0.3)
# 新增：Master/Slaver 模式自动检测

set -e

echo "========================================"
echo "EKET 实例启动 v0.3"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
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
# 步骤 2: 检查 Master 标记和决定实例角色
# ==========================================
echo -e "${BLUE}## 步骤 2: 检查 Master 标记${NC}"
echo ""

MASTER_EXISTS=false

# 检查三仓库中的 Master 标记
if [ -f "confluence/.eket_master_marker" ]; then
    MASTER_EXISTS=true
    echo -e "${GREEN}✓${NC} Confluence: Master 标记存在"
    echo "  初始化时间：$(grep "initialized_at:" "confluence/.eket_master_marker" | cut -d':' -f2- | xargs)"
elif [ -f "jira/.eket_master_marker" ]; then
    MASTER_EXISTS=true
    echo -e "${GREEN}✓${NC} Jira: Master 标记存在"
    echo "  初始化时间：$(grep "initialized_at:" "jira/.eket_master_marker" | cut -d':' -f2- | xargs)"
elif [ -f "code_repo/.eket_master_marker" ] || [ -f "src/.eket_master_marker" ]; then
    MASTER_EXISTS=true
    MARKER_FILE="code_repo/.eket_master_marker"
    [ -f "src/.eket_master_marker" ] && MARKER_FILE="src/.eket_master_marker"
    echo -e "${GREEN}✓${NC} 代码仓库：Master 标记存在"
    echo "  初始化时间：$(grep "initialized_at:" "$MARKER_FILE" | cut -d':' -f2- | xargs)"
else
    echo -e "${YELLOW}○${NC} 未发现 Master 标记"
fi

echo ""

# ==========================================
# 步骤 3: 检查三仓库目录及内容
# ==========================================
echo -e "${BLUE}## 步骤 3: 检查三仓库状态${NC}"
echo ""

CONFLUENCE_EMPTY=true
JIRA_EMPTY=true
CODE_REPO_EMPTY=true

# 检查 Confluence 仓库
if [ -d "confluence" ] && [ -f "confluence/README.md" ]; then
    echo -e "${GREEN}✓${NC} Confluence 仓库存在"
    # 检查是否有项目文档
    if [ -d "confluence/projects" ] && [ "$(find confluence/projects -name '*.md' 2>/dev/null | wc -l)" -gt 0 ]; then
        CONFLUENCE_EMPTY=false
        echo -e "${GREEN}  ✓${NC} 发现项目文档"
    else
        echo -e "${YELLOW}  ○${NC} 项目文档为空"
    fi
else
    echo -e "${YELLOW}○${NC} Confluence 仓库不存在"
fi

# 检查 Jira 仓库
if [ -d "jira" ] && [ -f "jira/README.md" ]; then
    echo -e "${GREEN}✓${NC} Jira 仓库存在"
    # 检查是否有 tickets 或 epics
    if [ -d "jira/tickets" ] && [ "$(find jira/tickets -name '*.md' 2>/dev/null | wc -l)" -gt 0 ]; then
        JIRA_EMPTY=false
        echo -e "${GREEN}  ✓${NC} 发现任务票"
    elif [ -d "jira/epics" ] && [ "$(find jira/epics -name '*.md' 2>/dev/null | wc -l)" -gt 0 ]; then
        JIRA_EMPTY=false
        echo -e "${GREEN}  ✓${NC} 发现 Epic"
    else
        echo -e "${YELLOW}  ○${NC} 任务票为空"
    fi
else
    echo -e "${YELLOW}○${NC} Jira 仓库不存在"
fi

# 检查代码仓库
if [ -d "code_repo" ] || [ -d "src" ]; then
    echo -e "${GREEN}✓${NC} 代码仓库存在"
    # 检查是否有代码文件
    if [ -d "code_repo/src" ] && [ "$(find code_repo/src -type f 2>/dev/null | wc -l)" -gt 0 ]; then
        CODE_REPO_EMPTY=false
        echo -e "${GREEN}  ✓${NC} 发现源代码"
    elif [ -d "src" ] && [ "$(find src -type f 2>/dev/null | wc -l)" -gt 0 ]; then
        CODE_REPO_EMPTY=false
        echo -e "${GREEN}  ✓${NC} 发现源代码"
    else
        echo -e "${YELLOW}  ○${NC} 源代码为空"
    fi
else
    echo -e "${YELLOW}○${NC} 代码仓库不存在"
fi

echo ""

# ==========================================
# 步骤 4: 决定实例角色 (Master/Slaver)
# ==========================================
echo -e "${BLUE}## 步骤 4: 决定实例角色${NC}"
echo ""

# 判断逻辑：
# 1. 如果 Master 标记存在 → Slaver 模式（Master 已完成初始化）
# 2. 如果三仓库都存在且有内容 → Slaver 模式
# 3. 否则 → Master 模式
if [ "$MASTER_EXISTS" = true ]; then
    INSTANCE_ROLE="slaver"
    echo -e "${GREEN}检测到 Master 已完成初始化${NC}"
    echo -e "实例角色：${MAGENTA}Slaver (执行实例)${NC}"
    echo ""
elif [ "$CONFLUENCE_EMPTY" = false ] && [ "$JIRA_EMPTY" = false ] && [ "$CODE_REPO_EMPTY" = false ]; then
    INSTANCE_ROLE="slaver"
    echo -e "${GREEN}检测到项目已完整初始化${NC}"
    echo -e "实例角色：${MAGENTA}Slaver (执行实例)${NC}"
    echo ""
    echo "原因:"
    echo "  - Confluence 仓库已有文档"
    echo "  - Jira 仓库已有任务"
    echo "  - 代码仓库已有代码"
    echo ""
else
    INSTANCE_ROLE="master"
    echo -e "${GREEN}检测到项目未完整初始化${NC}"
    echo -e "实例角色：${YELLOW}Master (协调实例)${NC}"
    echo ""
    echo "原因:"
    [ "$MASTER_EXISTS" = false ] && echo "  - Master 标记不存在"
    [ "$CONFLUENCE_EMPTY" = true ] && echo "  - Confluence 仓库缺失或为空"
    [ "$JIRA_EMPTY" = true ] && echo "  - Jira 仓库缺失或为空"
    [ "$CODE_REPO_EMPTY" = true ] && echo "  - 代码仓库缺失或为空"
    echo ""
fi

# 保存实例状态
mkdir -p ".eket/state"
cat > ".eket/state/instance_config.yml" << EOF
# EKET 实例配置
# 自动生成于：$(date -Iseconds)

# 实例角色
role: "${INSTANCE_ROLE}"  # master | slaver

# Slaver 角色类型（仅在 role=slaver 时有效）
# 可选值：product_manager, frontend_dev, backend_dev, designer, tester, devops, fullstack
agent_type: null

# 实例状态
status: "initializing"  # initializing | ready | busy | blocked

# 工作区配置
workspace:
  confluence_initialized: $([ "$CONFLUENCE_EMPTY" = false ] && echo "true" || echo "false")
  jira_initialized: $([ "$JIRA_EMPTY" = false ] && echo "true" || echo "false")
  code_repo_initialized: $([ "$CODE_REPO_EMPTY" = false ] && echo "true" || echo "false")
EOF

echo -e "${GREEN}✓${NC} 实例状态已保存到 .eket/state/instance_config.yml"
echo ""

# ==========================================
# 步骤 5: 执行对应角色逻辑
# ==========================================
if [ "$INSTANCE_ROLE" = "master" ]; then
    # ========== Master 模式 ==========
    echo -e "${BLUE}## 步骤 5: Master 模式 - 项目初始化引导${NC}"
    echo ""

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              Master 模式 - 协调实例                            │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  职责：                                                       │"
    echo "│  • 作为与用户的沟通窗口                                        │"
    echo "│  • 引导用户完成项目初始化                                      │"
    echo "│  • 创建 inbox/human_input.md 等文件                            │"
    echo "│  • 访问三仓库创建文档/任务/代码                               │"
    echo "│                                                               │"
    echo "│  工作流程：                                                   │"
    echo "│  1. 检查并创建 inbox/human_input.md                           │"
    echo "│  2. 引导用户描述项目愿景                                      │"
    echo "│  3. 分析需求并拆解为 Epic 和 Tasks                             │"
    echo "│  4. 创建 Confluence 文档 (需求/架构)                            │"
    echo "│  5. 创建 Jira 任务票                                           │"
    echo "│  6. 初始化 code_repo 目录结构                                  │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""

    # ==========================================
    # 步骤 5.1: 创建三仓库目录和标记文件
    # ==========================================
    echo -e "${BLUE}## 步骤 5.1: 创建三仓库目录结构${NC}"
    echo ""

    # 创建 Confluence 仓库目录
    if [ ! -d "confluence" ]; then
        mkdir -p "confluence/projects"
        mkdir -p "confluence/memory/best-practices"
        mkdir -p "confluence/templates"
        echo "# Confluence 文档中心" > "confluence/README.md"
        echo "" >> "confluence/README.md"
        echo "本文档中心包含项目的需求文档、架构设计、技术规范等。" >> "confluence/README.md"
        # 创建 Master 标记
        echo "initialized_by: master" > "confluence/.eket_master_marker"
        echo "initialized_at: $(date -Iseconds)" >> "confluence/.eket_master_marker"
        echo "master_instance: true" >> "confluence/.eket_master_marker"
        echo -e "${GREEN}✓${NC} Confluence 仓库已创建 (Master 标记：confluence/.eket_master_marker)"
    else
        if [ -f "confluence/.eket_master_marker" ]; then
            echo -e "${GREEN}✓${NC} Confluence 仓库已存在 (Master 已初始化)"
        else
            echo -e "${YELLOW}○${NC} Confluence 仓库已存在 (非 Master 初始化)"
        fi
    fi

    # 创建 Jira 仓库目录
    if [ ! -d "jira" ]; then
        mkdir -p "jira/epics"
        mkdir -p "jira/tickets/feature"
        mkdir -p "jira/tickets/bugfix"
        mkdir -p "jira/tickets/task"
        mkdir -p "jira/state"
        echo "# Jira 任务管理" > "jira/README.md"
        echo "" >> "jira/README.md"
        echo "本目录管理项目的 Epic、功能票、缺陷票和任务票。" >> "jira/README.md"
        # 创建 Master 标记
        echo "initialized_by: master" > "jira/.eket_master_marker"
        echo "initialized_at: $(date -Iseconds)" >> "jira/.eket_master_marker"
        echo "master_instance: true" >> "jira/.eket_master_marker"
        echo -e "${GREEN}✓${NC} Jira 仓库已创建 (Master 标记：jira/.eket_master_marker)"
    else
        if [ -f "jira/.eket_master_marker" ]; then
            echo -e "${GREEN}✓${NC} Jira 仓库已存在 (Master 已初始化)"
        else
            echo -e "${YELLOW}○${NC} Jira 仓库已存在 (非 Master 初始化)"
        fi
    fi

    # 创建代码仓库目录
    if [ ! -d "code_repo" ] && [ ! -d "src" ]; then
        mkdir -p "code_repo/src"
        mkdir -p "code_repo/tests"
        mkdir -p "code_repo/configs"
        mkdir -p "code_repo/deployments"
        echo "# 代码仓库" > "code_repo/README.md"
        echo "" >> "code_repo/README.md"
        echo "本目录包含项目源代码、测试、部署配置等。" >> "code_repo/README.md"
        # 创建 Master 标记
        echo "initialized_by: master" > "code_repo/.eket_master_marker"
        echo "initialized_at: $(date -Iseconds)" >> "code_repo/.eket_master_marker"
        echo "master_instance: true" >> "code_repo/.eket_master_marker"
        echo -e "${GREEN}✓${NC} 代码仓库已创建 (Master 标记：code_repo/.eket_master_marker)"
    else
        if [ -f "code_repo/.eket_master_marker" ]; then
            echo -e "${GREEN}✓${NC} 代码仓库已存在 (Master 已初始化)"
        elif [ -f "src/.eket_master_marker" ]; then
            echo -e "${GREEN}✓${NC} 代码仓库已存在 (Master 已初始化)"
        else
            echo -e "${YELLOW}○${NC} 代码仓库已存在 (非 Master 初始化)"
        fi
    fi

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
            echo "│  下一步：开始分析需求并创建项目结构                           │"
            echo "│  - 调用 user_interview SKILL                                │"
            echo "│  - 调用 requirement_decomposition SKILL                     │"
            echo "│  - 创建 Epic 和功能任务                                      │"
            echo "└──────────────────────────────────────────────────────────────┘"
        else
            echo -e "${YELLOW}⚠${NC} inbox/human_input.md 内容为空或过于简单"
            echo ""
            echo "请编辑 inbox/human_input.md 描述你的项目愿景:"
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

<!-- 请在这里详细描述你的项目愿景 -->
<!-- 例如：我想要创建一个...它可以帮助用户... -->


## 目标用户

<!-- 谁是这个项目的目标用户？他们有什么痛点？ -->


## 核心功能

<!-- 列出 3-5 个核心功能 -->

- [ ]
- [ ]
- [ ]

## 技术栈偏好 (可选)

<!-- 如果有偏好的技术栈，请在这里说明 -->
<!-- 例如：React + Node.js + PostgreSQL -->


## 其他说明

<!-- 任何其他相关信息，如预算、时间限制、特殊要求等 -->

EOF
        echo -e "${GREEN}✓${NC} 已创建 inbox/human_input.md"
        echo ""
        echo "请编辑此文件描述你的项目愿景，然后再次运行 /eket-start"
    fi

else
    # ========== Slaver 模式 ==========
    echo -e "${BLUE}## 步骤 5: Slaver 模式 - 执行实例${NC}"
    echo ""

    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              Slaver 模式 - 执行实例                            │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  职责：                                                       │"
    echo "│  • 专注于特定角色的任务执行                                    │"
    echo "│  • 从 Jira 领取任务并执行                                      │"
    echo "│  • 提交代码和 PR                                              │"
    echo "│                                                               │"
    echo "│  可用角色：                                                   │"
    echo "│  • product_manager  - 产品经理（需求分析、任务拆解）           │"
    echo "│  • frontend_dev   - 前端开发                                  │"
    echo "│  • backend_dev    - 后端开发                                  │"
    echo "│  • designer       - 设计师                                    │"
    echo "│  • tester         - 测试员                                    │"
    echo "│  • devops         - 运维工程师                                │"
    echo "│  • fullstack      - 全栈开发                                  │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""

    # 检查是否已设置角色
    AGENT_TYPE=$(grep "^agent_type:" ".eket/state/instance_config.yml" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "null")

    if [ "$AGENT_TYPE" = "null" ] || [ -z "$AGENT_TYPE" ]; then
        echo -e "${YELLOW}⚠${NC} 尚未设置角色类型"
        echo ""
        echo "请选择你的角色类型:"
        echo ""
        echo "  1) product_manager  - 产品经理 (需求分析、任务拆解)"
        echo "  2) frontend_dev   - 前端开发 (React/Vue/Angular)"
        echo "  3) backend_dev    - 后端开发 (Node.js/Python/Go)"
        echo "  4) designer       - 设计师 (UI/UX)"
        echo "  5) tester         - 测试员 (单元测试/E2E)"
        echo "  6) devops         - 运维工程师 (CI/CD/部署)"
        echo "  7) fullstack      - 全栈开发 (前后端都做)"
        echo ""
        echo "提示：编辑 .eket/state/instance_config.yml 设置 agent_type 字段"
        echo "     或运行 /eket-role <role-name> 来设置"
        echo ""

        # 创建角色设置引导文件
        cat > ".eket/state/role_selection_pending.yml" << EOF
# 角色选择待处理
# Slaver 实例需要设置角色类型后才能开始工作

# 可用角色列表
available_roles:
  - id: product_manager
    name: 产品经理
    description: 负责需求分析、任务拆解、架构设计
    skills: [requirement_analysis, architecture_design, task_decomposition]

  - id: frontend_dev
    name: 前端开发
    description: 负责前端界面开发 (React/Vue/Angular)
    skills: [frontend_development, ui_implementation, state_management]

  - id: backend_dev
    name: 后端开发
    description: 负责后端 API 和数据库开发
    skills: [backend_development, api_design, database_design]

  - id: designer
    name: 设计师
    description: 负责 UI/UX 设计
    skills: [ui_ux_design, icon_design, wireframing]

  - id: tester
    name: 测试员
    description: 负责测试用例编写和执行
    skills: [unit_test, e2e_test, integration_test]

  - id: devops
    name: 运维工程师
    description: 负责 CI/CD、部署和监控
    skills: [docker_build, kubernetes_deploy, ci_cd_setup]

  - id: fullstack
    name: 全栈开发
    description: 负责前后端全栈开发
    skills: [frontend_development, backend_development, api_integration]

# 设置方法
# 1. 编辑 .eket/state/instance_config.yml
#    将 agent_type: null 改为 agent_type: <role-id>
# 2. 或运行命令：echo "agent_type: <role-id>" >> .eket/state/instance_config.yml
EOF
        echo -e "${GREEN}✓${NC} 已创建角色选择引导文件：.eket/state/role_selection_pending.yml"
        echo ""
    else
        echo -e "${GREEN}✓${NC} 当前角色：${MAGENTA}$AGENT_TYPE${NC}"
        echo ""
        echo "正在加载对应角色配置..."
    fi

    # 检查运行模式
    if [ "$AUTO_MODE" = true ]; then
        echo -e "${GREEN}✓${NC} 运行模式：${YELLOW}自动模式${NC}"
    else
        echo -e "${GREEN}✓${NC} 运行模式：${YELLOW}手动模式${NC}"
    fi
    echo ""

    # 阅读 Confluence 了解背景
    echo -e "${BLUE}## 步骤 5.1: 阅读项目背景${NC}"
    echo ""

    if [ -d "confluence/projects" ]; then
        PROJECT_DOCS=$(find "confluence/projects" -name "*.md" 2>/dev/null | head -5)
        if [ -n "$PROJECT_DOCS" ]; then
            echo -e "${GREEN}✓${NC} 发现项目文档"
            echo ""
            echo "最近文档:"
            echo "$PROJECT_DOCS"
        else
            echo -e "${YELLOW}⚠${NC} 未发现项目文档"
        fi
    fi

    echo ""

    # 检查 Jira 任务
    echo -e "${BLUE}## 步骤 5.2: 检查 Jira 任务${NC}"
    echo ""

    if [ -d "jira/tickets" ]; then
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
        else
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
        fi
    fi
fi

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

# 更新实例状态为 ready
sed -i '' "s/status: \"initializing\"/status: \"ready\"/" ".eket/state/instance_config.yml" 2>/dev/null || \
sed -i "s/status: \"initializing\"/status: \"ready\"/" ".eket/state/instance_config.yml"

if [ "$INSTANCE_ROLE" = "slaver" ]; then
    echo "下一步:"
    if [ "$AGENT_TYPE" = "null" ] || [ -z "$AGENT_TYPE" ]; then
        echo "  1. 设置角色类型 (见上方指引)"
        echo "  2. 设置完成后运行 /eket-start 重新加载"
    else
        if [ "$AUTO_MODE" = true ]; then
            echo "  自动模式将自动领取并处理任务"
        else
            echo "  查看推荐任务并领取:"
            echo "    /eket-claim <task-id>"
        fi
    fi
fi

echo ""
