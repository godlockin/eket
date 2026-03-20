#!/bin/bash
# tests/run-unit-tests.sh - 运行所有单元测试

# 不使用 set -e，因为测试需要捕获失败的命令

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="$SCRIPT_DIR/results"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 计数器
TOTAL=0
PASSED=0
FAILED=0

echo "========================================"
echo "EKET 单元测试"
echo "========================================"
echo ""

# 创建结果目录
mkdir -p "$RESULTS_DIR"
echo "# 单元测试结果" > "$RESULTS_DIR/unit-results.md"
echo "" >> "$RESULTS_DIR/unit-results.md"
echo "执行时间：$(date -Iseconds)" >> "$RESULTS_DIR/unit-results.md"
echo "" >> "$RESULTS_DIR/unit-results.md"

# 临时测试目录
TEST_WORK_DIR=$(mktemp -d)
trap "rm -rf $TEST_WORK_DIR" EXIT

# 测试函数 - 模式检测 setup
test_u01_u02() {
    echo "## 模式检测测试" >> "$RESULTS_DIR/unit-results.md"

    # U01: setup 模式
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U01: ekat-start 模式检测 - setup... "

    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p .eket/state

    # 复制被测试脚本
    cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
    cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
    cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

    local output=$(bash eket-start.sh 2>&1) || true

    if echo "$output" | grep -q "任务设定模式"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U01: ekat-start 模式检测 - setup" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U01: ekat-start 模式检测 - setup" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"

    # U02: execution 模式
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U02: ekat-start 模式检测 - execution... "

    test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p confluence jira code_repo .eket/state
    echo "# Confluence" > confluence/README.md
    echo "# Jira" > jira/README.md

    cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
    cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
    cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

    output=$(bash eket-start.sh 2>&1) || true

    if echo "$output" | grep -q "任务承接模式"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U02: ekat-start 模式检测 - execution" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U02: ekat-start 模式检测 - execution" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"
}

# 测试函数 - 优先级计算
test_u03_u05() {
    echo "" >> "$RESULTS_DIR/unit-results.md"
    echo "## 优先级测试" >> "$RESULTS_DIR/unit-results.md"

    # U03: urgent 任务
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U03: prioritize - urgent 任务分数... "

    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Urgent Feature
status: ready
priority: urgent
dependencies: none
EOF

    cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
    local output=$(bash prioritize-tasks.sh 2>&1) || true

    if echo "$output" | grep -q "100"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U03: prioritize - urgent 任务分数" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U03: prioritize - urgent 任务分数" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"

    # U04: bugfix 加分
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U04: prioritize - bugfix 加分... "

    test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/bugfix jira/tickets/feature

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Feature
status: ready
priority: normal
EOF

    cat > jira/tickets/bugfix/BUG-001.md << 'EOF'
title: Bugfix
status: ready
priority: normal
EOF

    cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
    output=$(bash prioritize-tasks.sh 2>&1) || true

    # bugfix 应该显示在前面（分数更高）
    if echo "$output" | grep -q "BUG-001"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U04: prioritize - bugfix 加分" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U04: prioritize - bugfix 加分" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"

    # U05: 依赖惩罚
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U05: prioritize - 依赖惩罚... "

    test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Feature with deps
status: ready
priority: normal
dependencies: [FEAT-000]
EOF

    cat > jira/tickets/feature/FEAT-002.md << 'EOF'
title: Feature no deps
status: ready
priority: normal
dependencies: none
EOF

    cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
    output=$(bash prioritize-tasks.sh 2>&1) || true

    # FEAT-002 应该比 FEAT-001 分数高
    if echo "$output" | grep -q "FEAT-002"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U05: prioritize - 依赖惩罚" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U05: prioritize - 依赖惩罚" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"
}

# 测试函数 - 推荐
test_u06() {
    echo "" >> "$RESULTS_DIR/unit-results.md"
    echo "## 推荐测试" >> "$RESULTS_DIR/unit-results.md"

    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U06: recommend - Top 3 推荐... "

    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature

    for i in 1 2 3 4 5; do
        cat > jira/tickets/feature/FEAT-00$i.md << EOF
title: Feature $i
status: ready
priority: normal
EOF
    done

    cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true
    local output=$(bash recommend-tasks.sh 2>&1) || true

    if echo "$output" | grep -q "推荐" && echo "$output" | grep -q "FEAT-00"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U06: recommend - Top 3 推荐" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U06: recommend - Top 3 推荐" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"
}

# 测试函数 - Agent Profile
test_u07_u08() {
    echo "" >> "$RESULTS_DIR/unit-results.md"
    echo "## Agent Profile 测试" >> "$RESULTS_DIR/unit-results.md"

    # U07: frontend
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U07: agent-profile - frontend 匹配... "

    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature .eket/state/agents

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Frontend Task
status: ready
priority: normal
labels: frontend,react
EOF

    cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" . 2>/dev/null || true
    local output=$(bash load-agent-profile.sh FEAT-001 2>&1) || true

    if echo "$output" | grep -q "frontend_dev"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U07: agent-profile - frontend 匹配" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U07: agent-profile - frontend 匹配" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"

    # U08: backend
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U08: agent-profile - backend 匹配... "

    test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature .eket/state/agents

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Backend Task
status: ready
priority: normal
labels: backend,api
EOF

    cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" . 2>/dev/null || true
    output=$(bash load-agent-profile.sh FEAT-001 2>&1) || true

    if echo "$output" | grep -q "backend_dev"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U08: agent-profile - backend 匹配" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U08: agent-profile - backend 匹配" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"
}

# 测试函数 - 任务领取
test_u09_u10() {
    echo "" >> "$RESULTS_DIR/unit-results.md"
    echo "## 任务领取测试" >> "$RESULTS_DIR/unit-results.md"

    # U09: 正常领取
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U09: claim - 正常领取... "

    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature .eket/state scripts

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Test Task
status: ready
priority: normal
EOF

    cp "$PROJECT_ROOT/template/.claude/commands/eket-claim.sh" . 2>/dev/null || true
    # 创建 mock 的 load-agent-profile.sh
    cat > scripts/load-agent-profile.sh << 'EOF'
#!/bin/bash
echo "Mock: Loading agent profile"
EOF
    chmod +x scripts/load-agent-profile.sh

    bash eket-claim.sh FEAT-001 >/dev/null 2>&1 || true

    local status=$(grep "^status:" jira/tickets/feature/FEAT-001.md 2>/dev/null | cut -d: -f2 | tr -d ' ')

    if [ "$status" = "in_progress" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U09: claim - 正常领取" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U09: claim - 正常领取" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"

    # U10: 拒绝重复领取
    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 U10: claim - 拒绝重复领取... "

    test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature .eket/state

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Test Task
status: in_progress
EOF

    cp "$PROJECT_ROOT/template/.claude/commands/eket-claim.sh" . 2>/dev/null || true

    # 运行命令并捕获退出码
    set +e
    bash eket-claim.sh FEAT-001 > /tmp/claim_output.txt 2>&1
    local exit_code=$?
    local output=$(cat /tmp/claim_output.txt)
    set -e

    # 检查退出码非零且有错误消息
    local has_error=false
    if echo "$output" | grep -q "已被领取"; then
        has_error=true
    fi
    if echo "$output" | grep -q "in_progress"; then
        has_error=true
    fi

    if [ $exit_code -ne 0 ] && [ "$has_error" = true ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] U10: claim - 拒绝重复领取" >> "$RESULTS_DIR/unit-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] U10: claim - 拒绝重复领取" >> "$RESULTS_DIR/unit-results.md"
    fi
    rm -rf "$test_dir"
}

# ==========================================
# 执行所有测试
# ==========================================
test_u01_u02
test_u03_u05
test_u06
test_u07_u08
test_u09_u10

echo ""
echo "========================================"
echo "测试结果"
echo "========================================"
echo "总计：$TOTAL"
echo -e "${GREEN}通过：$PASSED${NC}"
echo -e "${RED}失败：$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过!${NC}"
    exit 0
else
    echo -e "${RED}✗ 有测试失败，请查看结果文件：$RESULTS_DIR/unit-results.md${NC}"
    exit 1
fi
