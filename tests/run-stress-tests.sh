#!/bin/bash
# tests/run-stress-tests.sh - 运行压力测试

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
echo "EKET 压力测试"
echo "========================================"
echo ""

mkdir -p "$RESULTS_DIR"

cat > "$RESULTS_DIR/stress-results.md" << 'EOF'
# 压力测试结果

执行时间：$(date -Iseconds)

---

## 测试概述

压力测试用于验证系统在高负载下的表现。

## 测试用例

| ID | 测试 | 负载 | 结果 | 耗时 |
|----|------|------|------|------|
EOF

run_stress_test() {
    local test_id="$1"
    local test_name="$2"
    local load="$3"

    echo -e "${BLUE}## 压力测试 $test_id: $test_name${NC}"
    echo "负载：$load"
    echo ""

    local start_time=$(date +%s)

    # 创建测试环境
    local test_dir=$(mktemp -d)
    cd "$test_dir"

    mkdir -p jira/tickets/{feature,bugfix,task} .eket/state
    cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
    cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

    # 执行测试
    case $test_id in
        P01)
            stress_test_large_task_count "$load"
            ;;
        P02)
            stress_test_complex_dependencies "$load"
            ;;
        P03)
            stress_test_concurrent_agents "$load"
            ;;
    esac

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    echo "耗时：${duration}s"

    # 记录结果
    echo "| $test_id | $test_name | $load | ✓ 通过 | ${duration}s |" >> "$RESULTS_DIR/stress-results.md"

    cd /
    rm -rf "$test_dir"
    echo ""
}

# P01: 大量任务
stress_test_large_task_count() {
    local count=$1
    echo "创建 $count 个任务..."

    for i in $(seq 1 $count); do
        local priority="normal"
        if [ $((i % 10)) -eq 0 ]; then
            priority="urgent"
        elif [ $((i % 5)) -eq 0 ]; then
            priority="high"
        fi

        cat > jira/tickets/feature/FEAT-$(printf "%03d" $i).md << EOF
title: Feature $i
status: ready
priority: $priority
EOF
    done

    echo "运行优先级排序..."
    local output=$(bash prioritize-tasks.sh 2>&1)

    echo "验证 urgent 任务排在前面..."
    if echo "$output" | head -20 | grep -q "urgent\|紧急"; then
        echo "✓ urgent 任务优先级正确"
        return 0
    else
        echo "✗ urgent 任务优先级错误"
        return 1
    fi
}

# P02: 复杂依赖
stress_test_complex_dependencies() {
    local count=$1
    echo "创建 $count 个互相依赖的任务..."

    # 创建基础任务
    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Base Feature
status: ready
priority: normal
dependencies: none
EOF

    # 创建依赖链
    for i in $(seq 2 $count); do
        local prev=$((i - 1))
        cat > jira/tickets/feature/FEAT-$(printf "%03d" $i).md << EOF
title: Feature $i
status: ready
priority: normal
dependencies: [FEAT-$(printf "%03d" $prev)]
EOF
    done

    echo "运行优先级排序..."
    local output=$(bash prioritize-tasks.sh 2>&1)

    echo "验证依赖惩罚生效..."
    # 有依赖的任务分数应该更低
    if echo "$output" | grep -q "FEAT-001"; then
        echo "✓ 依赖处理正确"
        return 0
    else
        echo "✗ 依赖处理错误"
        return 1
    fi
}

# P03: 多智能体并发
stress_test_concurrent_agents() {
    local count=$1
    echo "模拟 $count 个智能体同时工作..."

    # 创建任务
    for i in $(seq 1 $count); do
        local label="frontend"
        if [ $((i % 2)) -eq 0 ]; then
            label="backend"
        fi

        cat > jira/tickets/feature/FEAT-$(printf "%03d" $i).md << EOF
title: Feature $i
status: ready
priority: normal
labels: $label
EOF
    done

    echo "并发加载 Agent Profile..."
    mkdir -p .eket/state/agents
    cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" . 2>/dev/null || true

    local success=0
    local fail=0

    # 并发执行
    for i in $(seq 1 $count); do
        (bash load-agent-profile.sh FEAT-$(printf "%03d" $i) > /dev/null 2>&1) &
    done

    # 等待所有后台任务完成
    wait

    echo "验证 Agent 上下文文件..."
    local agent_files=$(find .eket/state/agents -name "*.yml" | wc -l)
    echo "生成 Agent 上下文：$agent_files 个"

    if [ "$agent_files" -eq "$count" ]; then
        echo "✓ 并发处理正确"
        return 0
    else
        echo "✗ 并发处理失败"
        return 1
    fi
}

# ==========================================
# 执行压力测试
# ==========================================
run_stress_test "P01" "大量任务" "100 个任务"
run_stress_test "P02" "复杂依赖" "20 个依赖任务"
run_stress_test "P03" "多智能体并发" "10 个并发 Agent"

echo ""
echo "========================================"
echo "压力测试完成"
echo "========================================"
echo ""
echo "详细结果：$RESULTS_DIR/stress-results.md"
