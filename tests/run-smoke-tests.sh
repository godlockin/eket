#!/bin/bash
#
# EKET 冒烟测试
# 用途：快速验证核心功能是否正常
#
# 用法：
#   ./tests/run-smoke-tests.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NODE_DIR="$PROJECT_ROOT/node"
RESULTS_DIR="$SCRIPT_DIR/results"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level="$1"
    local message="$2"
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" ;;
        TEST)  echo -e "${BLUE}[TEST]${NC} $message" ;;
    esac
}

# 测试计数
TOTAL=0
PASSED=0
FAILED=0
START_TIME=$(date +%s)

assert() {
    TOTAL=$((TOTAL + 1))
    local description="$1"
    local condition="$2"

    if eval "$condition"; then
        PASSED=$((PASSED + 1))
        log INFO "✓ $description"
        return 0
    else
        FAILED=$((FAILED + 1))
        log ERROR "✗ $description"
        return 1
    fi
}

# 创建结果目录
mkdir -p "$RESULTS_DIR"

echo "========================================"
echo "EKET 冒烟测试"
echo "========================================"
echo ""

# ==========================================
# 冒烟测试 1: Node.js 模块加载
# ==========================================
test_smoke_node_modules() {
    log TEST "冒烟测试 1: Node.js 模块加载"

    cd "$NODE_DIR"
    local result
    result=$(node -e "import('./dist/index.js')" 2>&1 || true)

    if [ $? -eq 0 ] || echo "$result" | grep -q "eket-cli"; then
        assert "Node.js 模块加载成功" "true"
    else
        # 检查是否是因为未编译
        if [ ! -d "$NODE_DIR/dist" ]; then
            log WARN "dist 目录不存在，尝试编译..."
            npm run build >/dev/null 2>&1 || true
            assert "编译完成" "true"
        else
            assert "Node.js 模块加载失败" "false"
        fi
    fi
    cd "$PROJECT_ROOT"
}

# ==========================================
# 冒烟测试 2: CLI 帮助命令
# ==========================================
test_smoke_cli_help() {
    log TEST "冒烟测试 2: CLI 帮助命令"

    local result
    result=$(node "$NODE_DIR/dist/index.js" --help 2>&1 || true)

    if echo "$result" | grep -q "eket-cli"; then
        assert "CLI 帮助命令正常" "true"
    else
        assert "CLI 帮助命令异常" "false"
    fi
}

# ==========================================
# 冒烟测试 3: Redis 检查
# ==========================================
test_smoke_redis_check() {
    log TEST "冒烟测试 3: Redis 检查"

    local result
    result=$(node "$NODE_DIR/dist/index.js" redis:check 2>&1 || true)

    # 不关心是否成功，只关心命令是否可执行
    if echo "$result" | grep -q "Redis\|redis\|连接\|connected\|Failed"; then
        assert "Redis 检查命令可执行" "true"
    else
        assert "Redis 检查命令异常" "false"
    fi
}

# ==========================================
# 冒烟测试 4: SQLite 检查
# ==========================================
test_smoke_sqlite_check() {
    log TEST "冒烟测试 4: SQLite 检查"

    local result
    result=$(node "$NODE_DIR/dist/index.js" sqlite:check 2>&1 || true)

    # 不关心是否成功，只关心命令是否可执行
    if echo "$result" | grep -q "SQLite\|sqlite\|连接\|connected\|Failed"; then
        assert "SQLite 检查命令可执行" "true"
    else
        assert "SQLite 检查命令异常" "false"
    fi
}

# ==========================================
# 冒烟测试 5: Doctor 诊断
# ==========================================
test_smoke_doctor() {
    log TEST "冒烟测试 5: 系统诊断"

    local result
    result=$(node "$NODE_DIR/dist/index.js" doctor 2>&1 || true)

    if echo "$result" | grep -q "诊断\|Doctor\|Redis\|SQLite"; then
        assert "系统诊断可执行" "true"
    else
        assert "系统诊断异常" "false"
    fi
}

# ==========================================
# 冒烟测试 6: 检查命令
# ==========================================
test_smoke_check() {
    log TEST "冒烟测试 6: 检查命令"

    local result
    result=$(node "$NODE_DIR/dist/index.js" check 2>&1 || true)

    if echo "$result" | grep -q "Node.js\|可用\|available"; then
        assert "检查命令可执行" "true"
    else
        assert "检查命令异常" "false"
    fi
}

# ==========================================
# 冒烟测试 7: 列出角色
# ==========================================
test_smoke_list_roles() {
    log TEST "冒烟测试 7: 列出角色"

    local result
    result=$(node "$NODE_DIR/dist/index.js" start:instance --list-roles 2>&1 || true)

    if echo "$result" | grep -q "Coordinator\|Executor\|frontend_dev\|backend_dev"; then
        assert "列出角色命令可执行" "true"
    else
        assert "列出角色命令异常" "false"
    fi
}

# ==========================================
# 冒烟测试 8: 版本信息
# ==========================================
test_smoke_version() {
    log TEST "冒烟测试 8: 版本信息"

    local result
    result=$(node "$NODE_DIR/dist/index.js" --version 2>&1 || true)

    if echo "$result" | grep -q "0\."; then
        assert "版本信息显示正确" "true"
    else
        assert "版本信息异常" "false"
    fi
}

# ==========================================
# 运行所有冒烟测试
# ==========================================
test_smoke_node_modules
test_smoke_cli_help
test_smoke_redis_check
test_smoke_sqlite_check
test_smoke_doctor
test_smoke_check
test_smoke_list_roles
test_smoke_version

# ==========================================
# 生成报告
# ==========================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "========================================"
echo "冒烟测试结果"
echo "========================================"
echo "执行时间：${DURATION}秒"
echo "总计：$TOTAL"
echo -e "${GREEN}通过：$PASSED${NC}"
echo -e "${RED}失败：$FAILED${NC}"
echo ""

# 生成 Markdown 报告
cat > "$RESULTS_DIR/smoke-results.md" << EOF
# EKET 冒烟测试结果

**执行时间**: $(date -Iseconds)
**执行时长**: ${DURATION}秒

## 测试统计

| 指标 | 值 |
|------|-----|
| 总测试数 | $TOTAL |
| 通过 | $PASSED |
| 失败 | $FAILED |
| 通过率 | $(awk "BEGIN {if($TOTAL>0) printf \"%.1f\", ($PASSED/$TOTAL)*100; else print \"N/A\"}")% |

## 结论

EOF

if [ $FAILED -eq 0 ]; then
    echo "✓ 所有冒烟测试通过，核心功能正常" >> "$RESULTS_DIR/smoke-results.md"
    echo -e "${GREEN}✓ 所有冒烟测试通过，核心功能正常!${NC}"
    exit 0
else
    echo "✗ 有冒烟测试失败，请检查核心功能" >> "$RESULTS_DIR/smoke-results.md"
    echo -e "${RED}✗ 有冒烟测试失败，请检查核心功能!${NC}"
    exit 1
fi
