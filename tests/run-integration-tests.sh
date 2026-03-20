#!/bin/bash
# tests/run-integration-tests.sh - 运行集成测试

set -e

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
echo "EKET 集成测试"
echo "========================================"
echo ""

mkdir -p "$RESULTS_DIR"
echo "# 集成测试结果" > "$RESULTS_DIR/integration-results.md"
echo "" >> "$RESULTS_DIR/integration-results.md"
echo "执行时间：$(date -Iseconds)" >> "$RESULTS_DIR/integration-results.md"
echo "" >> "$RESULTS_DIR/integration-results.md"

run_test() {
    local test_id="$1"
    local test_name="$2"

    TOTAL=$((TOTAL + 1))
    echo -ne "运行测试 $test_id: $test_name... "

    if bash "$SCRIPT_DIR/integration/$test_id.sh" > "$RESULTS_DIR/$test_id.log" 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        echo "- [✓] $test_id: $test_name" >> "$RESULTS_DIR/integration-results.md"
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        echo "- [✗] $test_id: $test_name" >> "$RESULTS_DIR/integration-results.md"
        echo "  日志：$RESULTS_DIR/$test_id.log" >> "$RESULTS_DIR/integration-results.md"
    fi
}

# ==========================================
# I01: 新项目初始化流程
# ==========================================
cat > "$SCRIPT_DIR/integration/I01.sh" << 'EOFTEST'
#!/bin/bash
set -e

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟项目初始化
mkdir -p inbox outbox/review_requests tasks .eket/state

# 复制 template 内容
if [ -d "$PROJECT_ROOT/template/.claude" ]; then
    cp -r "$PROJECT_ROOT/template/.claude" .
fi

# 运行 eket-init
if [ -x ".claude/commands/eket-init.sh" ]; then
    bash .claude/commands/eket-init.sh > /dev/null 2>&1 || true
fi

# 验证基本结构
if [ -d ".claude" ] && [ -d ".eket" ]; then
    # 清理
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
EOFTEST
chmod +x "$SCRIPT_DIR/integration/I01.sh"

# ==========================================
# I02: 任务设定模式流程
# ==========================================
cat > "$SCRIPT_DIR/integration/I02.sh" << 'EOFTEST'
#!/bin/bash
set -e

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟未初始化项目（setup 模式）
mkdir -p inbox outbox/review_requests tasks .eket/state

# 创建需求输入
cat > inbox/human_input.md << 'EOF'
# 项目需求

## 愿景
创建一个简单的博客系统

## 核心功能
- 用户注册/登录
- 文章发布
- 评论功能
EOF

# 复制必要脚本
cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

# 运行 eket-start
output=$(bash eket-start.sh 2>&1) || true

# 验证进入 setup 模式
if echo "$output" | grep -q "任务设定模式"; then
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
EOFTEST
chmod +x "$SCRIPT_DIR/integration/I02.sh"

# ==========================================
# I03: 自动模式流程
# ==========================================
cat > "$SCRIPT_DIR/integration/I03.sh" << 'EOFTEST'
#!/bin/bash
set -e

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟已初始化项目（execution 模式）
mkdir -p confluence jira/tickets/feature code_repo .eket/state/agents
echo "# Confluence" > confluence/README.md
echo "# Jira" > jira/README.md

# 创建多个任务
cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Urgent Feature
status: ready
priority: urgent
labels: backend
EOF

cat > jira/tickets/feature/FEAT-002.md << 'EOF'
title: Normal Feature
status: ready
priority: normal
labels: frontend
EOF

# 复制必要脚本
cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/template/.claude/commands/eket-claim.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" . 2>/dev/null || true
mkdir -p scripts
cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" scripts/ 2>/dev/null || true

# 运行自动模式
output=$(bash eket-start.sh -a 2>&1) || true

# 验证：自动领取最高优先级任务
# FEAT-001 应该是 in_progress
status=$(grep "^status:" jira/tickets/feature/FEAT-001.md 2>/dev/null | cut -d: -f2 | tr -d ' ')

if [ "$status" = "in_progress" ]; then
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
EOFTEST
chmod +x "$SCRIPT_DIR/integration/I03.sh"

# ==========================================
# I04: 手动模式流程
# ==========================================
cat > "$SCRIPT_DIR/integration/I04.sh" << 'EOFTEST'
#!/bin/bash
set -e

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟已初始化项目
mkdir -p confluence jira/tickets/feature code_repo .eket/state
echo "# Confluence" > confluence/README.md
echo "# Jira" > jira/README.md

# 创建任务
for i in 1 2 3 4 5; do
    cat > jira/tickets/feature/FEAT-00$i.md << EOF
title: Feature $i
status: ready
priority: normal
labels: frontend
EOF
done

# 复制必要脚本
cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

# 运行手动模式
output=$(bash eket-start.sh 2>&1) || true

# 验证：显示推荐
if echo "$output" | grep -q "推荐 1" && echo "$output" | grep -q "推荐 3"; then
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
EOFTEST
chmod +x "$SCRIPT_DIR/integration/I04.sh"

# ==========================================
# 执行集成测试
# ==========================================
run_test "I01" "新项目初始化流程"
run_test "I02" "任务设定模式流程"
run_test "I03" "自动模式流程"
run_test "I04" "手动模式流程"

echo ""
echo "========================================"
echo "集成测试结果"
echo "========================================"
echo "总计：$TOTAL"
echo -e "${GREEN}通过：$PASSED${NC}"
echo -e "${RED}失败：$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有集成测试通过!${NC}"
    exit 0
else
    echo -e "${RED}✗ 有测试失败${NC}"
    echo "日志文件位置：$RESULTS_DIR/"
    exit 1
fi
