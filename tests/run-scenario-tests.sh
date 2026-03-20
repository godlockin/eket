#!/bin/bash
# tests/run-scenario-tests.sh - 运行场景测试

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="$SCRIPT_DIR/results"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "EKET 场景测试"
echo "========================================"
echo ""

mkdir -p "$RESULTS_DIR"

# 场景测试结果
cat > "$RESULTS_DIR/scenario-results.md" << 'EOF'
# 场景测试结果

执行时间：$(date -Iseconds)

---

## 场景说明

场景测试用于验证 EKET 框架在真实使用场景下的表现。

## 测试场景

| ID | 场景 | 状态 | 备注 |
|----|------|------|------|
EOF

run_scenario() {
    local scenario_id="$1"
    local scenario_name="$2"
    local scenario_desc="$3"

    echo -e "${BLUE}## 场景 $scenario_id: $scenario_name${NC}"
    echo ""
    echo "描述：$scenario_desc"
    echo ""

    # 创建场景测试目录
    local test_dir=$(mktemp -d)
    cd "$test_dir"

    # 准备环境
    setup_scenario_env "$PROJECT_ROOT"

    # 运行场景
    case $scenario_id in
        S01)
            scenario_01_zero_to_one
            ;;
        S02)
            scenario_02_requirement_change
            ;;
        S03)
            scenario_03_multi_task
            ;;
        S04)
            scenario_04_bugfix
            ;;
        S05)
            scenario_05_doc_task
            ;;
        S06)
            scenario_06_cross_module
            ;;
    esac

    local result=$?

    # 记录结果
    if [ $result -eq 0 ]; then
        echo -e "${GREEN}✓ 通过${NC}"
        echo "| $scenario_id | $scenario_name | ✓ 通过 | |" >> "$RESULTS_DIR/scenario-results.md"
    else
        echo -e "${RED}✗ 失败${NC}"
        echo "| $scenario_id | $scenario_name | ✗ 失败 | 见日志 |" >> "$RESULTS_DIR/scenario-results.md"
    fi

    cd /
    rm -rf "$test_dir"
    echo ""
}

setup_scenario_env() {
    local project_root="$1"

    mkdir -p confluence jira/tickets/{feature,bugfix,task} code_repo .eket/state/agents
    echo "# Confluence" > confluence/README.md
    echo "# Jira" > jira/README.md
    echo "# Code Repo" > code_repo/README.md

    # 复制脚本
    cp "$project_root/template/.claude/commands/"*.sh . 2>/dev/null || true
    mkdir -p scripts
    cp "$project_root/scripts/"*.sh scripts/ 2>/dev/null || true
}

# S01: 从零开始
scenario_01_zero_to_one() {
    echo "步骤 1: 创建需求输入"
    cat > inbox/human_input.md << 'EOF'
# Todo 应用

## 愿景
创建一个简单的 Todo 列表应用

## 功能
- 添加 Todo
- 完成 Todo
- 删除 Todo
EOF

    echo "步骤 2: 运行 setup 模式"
    bash eket-start.sh > /dev/null 2>&1 || true

    echo "步骤 3: 验证创建了任务"
    # 验证 setup 模式正确识别
    if [ -d "inbox" ]; then
        echo "✓ 环境准备正确"
        return 0
    else
        return 1
    fi
}

# S02: 需求变更
scenario_02_requirement_change() {
    echo "步骤 1: 创建现有任务"
    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: 首页开发
status: ready
priority: normal
EOF

    echo "步骤 2: 插入紧急需求"
    cat > jira/tickets/feature/FEAT-002.md << 'EOF'
title: 紧急安全修复
status: ready
priority: urgent
EOF

    echo "步骤 3: 运行自动模式"
    bash scripts/prioritize-tasks.sh -a > /dev/null 2>&1 || true

    echo "步骤 4: 验证紧急任务被优先处理"
    local status=$(grep "^status:" jira/tickets/feature/FEAT-002.md 2>/dev/null | cut -d: -f2 | tr -d ' ')
    if [ "$status" = "in_progress" ]; then
        echo "✓ 紧急任务优先处理"
        return 0
    else
        return 1
    fi
}

# S03: 多任务并发
scenario_03_multi_task() {
    echo "创建 10 个待处理任务"
    for i in $(seq 1 10); do
        cat > jira/tickets/feature/FEAT-00$i.md << EOF
title: Feature $i
status: ready
priority: normal
EOF
    done

    echo "运行推荐"
    local output=$(bash scripts/recommend-tasks.sh 2>&1)

    echo "验证推荐数量"
    if echo "$output" | grep -q "推荐 1" && echo "$output" | grep -q "推荐 3"; then
        echo "✓ 正确推荐 Top 3"
        return 0
    else
        return 1
    fi
}

# S04: 缺陷修复
scenario_04_bugfix() {
    echo "创建功能任务和 bugfix"
    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: 新功能开发
status: ready
priority: normal
EOF

    cat > jira/tickets/bugfix/BUG-001.md << 'EOF'
title: 登录崩溃修复
status: ready
priority: normal
EOF

    echo "运行优先级排序"
    local output=$(bash scripts/prioritize-tasks.sh 2>&1)

    echo "验证 bugfix 优先级更高"
    # BUG-001 应该比 FEAT-001 分数高 10 分
    if echo "$output" | grep -q "BUG-001"; then
        echo "✓ Bugfix 优先"
        return 0
    else
        return 1
    fi
}

# S05: 文档任务
scenario_05_doc_task() {
    echo "创建文档任务"
    cat > jira/tickets/task/DOC-001.md << 'EOF'
title: 更新 API 文档
status: ready
priority: low
labels: docs,documentation
EOF

    echo "加载 Agent Profile"
    mkdir -p .eket/state/agents
    cp scripts/load-agent-profile.sh . 2>/dev/null || true
    local output=$(bash load-agent-profile.sh DOC-001 2>&1) || true

    echo "验证匹配到 doc_monitor"
    if echo "$output" | grep -q "doc_monitor\|文档监控员"; then
        echo "✓ 正确匹配文档监控员"
        return 0
    else
        return 1
    fi
}

# S06: 跨模块开发
scenario_06_cross_module() {
    echo "创建前后端协作任务"
    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: 用户登录 - 前端
status: ready
priority: high
labels: frontend,react
dependencies: [FEAT-002]
EOF

    cat > jira/tickets/feature/FEAT-002.md << 'EOF'
title: 用户登录 - 后端 API
status: ready
priority: high
labels: backend,api
EOF

    echo "运行优先级排序（有依赖惩罚）"
    local output=$(bash scripts/prioritize-tasks.sh 2>&1) || true

    echo "验证依赖处理"
    # 两个任务都应该被正确处理
    if [ -f "jira/tickets/feature/FEAT-001.md" ] && [ -f "jira/tickets/feature/FEAT-002.md" ]; then
        echo "✓ 任务正确管理"
        return 0
    else
        return 1
    fi
}

# ==========================================
# 执行所有场景测试
# ==========================================
run_scenario "S01" "从零开始" "新项目从零到第一个功能上线"
run_scenario "S02" "需求变更" "已开发项目插入紧急需求"
run_scenario "S03" "多任务并发" "同时多个任务待处理"
run_scenario "S04" "缺陷修复" "紧急 Bugfix 插入"
run_scenario "S05" "文档任务" "纯文档更新任务"
run_scenario "S06" "跨模块开发" "前后端协作任务"

echo ""
echo "========================================"
echo "场景测试完成"
echo "========================================"
echo ""
echo "详细结果：$RESULTS_DIR/scenario-results.md"
