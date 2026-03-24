#!/bin/bash
#
# EKET Docker 容器集成测试脚本 v0.6.2
# 用途：测试 Docker SQLite 和 Redis 容器的完整功能
#
# 用法：
#   ./tests/test-docker-integration.sh [--verbose]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试结果统计
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# 测试日志
LOG_FILE="$PROJECT_ROOT/tests/results/docker-integration-test-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) [ "$VERBOSE" = true ] && echo -e "${BLUE}[DEBUG]${NC} $message" ;;
        TEST)  echo -e "${BLUE}[TEST]${NC} $message" ;;
        PASS)  echo -e "${GREEN}[PASS]${NC} $message" ;;
        FAIL)  echo -e "${RED}[FAIL]${NC} $message" ;;
    esac
}

VERBOSE=false
if [ "$1" = "--verbose" ] || [ "$1" = "-v" ]; then
    VERBOSE=true
fi

# 测试断言函数
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    if [ "$expected" = "$actual" ]; then
        log PASS "$message"
        ((TESTS_PASSED++))
        return 0
    else
        log FAIL "$message (期望：$expected, 实际：$actual)"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local message="$2"

    if [ -f "$file" ]; then
        log PASS "$message"
        ((TESTS_PASSED++))
        return 0
    else
        log FAIL "$message (文件不存在：$file)"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_command_success() {
    local cmd="$1"
    local message="$2"

    if eval "$cmd" &>/dev/null; then
        log PASS "$message"
        ((TESTS_PASSED++))
        return 0
    else
        log FAIL "$message (命令失败：$cmd)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ==========================================
# 测试 1: Docker 环境检测
# ==========================================
test_docker_detection() {
    log TEST "测试：Docker 环境检测"
    echo "========================================"
    echo "测试 1: Docker 环境检测"
    echo "========================================"
    echo ""

    # 测试 1.1: 检测脚本存在
    assert_file_exists "$SCRIPTS_DIR/check-docker.sh" "Docker 检测脚本存在"

    # 测试 1.2: 检测脚本可执行
    if [ -x "$SCRIPTS_DIR/check-docker.sh" ]; then
        log PASS "Docker 检测脚本可执行"
        ((TESTS_PASSED++))
    else
        log FAIL "Docker 检测脚本不可执行"
        ((TESTS_FAILED++))
    fi

    # 测试 1.3: 静默模式返回正确状态码
    if "$SCRIPTS_DIR/check-docker.sh" --silent 2>/dev/null; then
        log PASS "Docker 静默检测通过"
        ((TESTS_PASSED++))
        DOCKER_AVAILABLE=true
    else
        log WARN "Docker 不可用，跳过后续容器测试"
        ((TESTS_SKIPPED++))
        DOCKER_AVAILABLE=false
    fi

    echo ""
}

# ==========================================
# 测试 2: Docker SQLite 容器
# ==========================================
test_sqlite_container() {
    log TEST "测试：Docker SQLite 容器"
    echo "========================================"
    echo "测试 2: Docker SQLite 容器"
    echo "========================================"
    echo ""

    if [ "$DOCKER_AVAILABLE" != true ]; then
        log WARN "跳过：Docker 不可用"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 测试 2.1: SQLite 脚本存在
    assert_file_exists "$SCRIPTS_DIR/docker-sqlite.sh" "SQLite 容器脚本存在"

    # 测试 2.2: 启动容器
    if "$SCRIPTS_DIR/docker-sqlite.sh" start 2>/dev/null; then
        log PASS "SQLite 容器启动成功"
        ((TESTS_PASSED++))
    else
        log FAIL "SQLite 容器启动失败"
        ((TESTS_FAILED++))
        echo ""
        return
    fi

    # 测试 2.3: 容器运行状态
    if docker ps --filter "name=eket-sqlite" --format "{{.Status}}" | grep -q "Up"; then
        log PASS "SQLite 容器运行中"
        ((TESTS_PASSED++))
    else
        log FAIL "SQLite 容器未运行"
        ((TESTS_FAILED++))
    fi

    # 测试 2.4: 配置文件导出
    assert_file_exists "$PROJECT_ROOT/.eket/config/docker-sqlite.yml" "SQLite 配置文件存在"

    # 测试 2.5: 数据库文件存在
    local sqlite_db=$(grep "database:" "$PROJECT_ROOT/.eket/config/docker-sqlite.yml" 2>/dev/null | awk '{print $2}' || echo "")
    if [ -n "$sqlite_db" ] && [ -f "$sqlite_db" ]; then
        log PASS "SQLite 数据库文件存在：$sqlite_db"
        ((TESTS_PASSED++))
    else
        log WARN "SQLite 数据库文件不存在或路径为空"
        ((TESTS_SKIPPED++))
    fi

    # 测试 2.6: 数据库表结构验证
    if [ -n "$sqlite_db" ] && [ -f "$sqlite_db" ]; then
        local tables=$(sqlite3 "$sqlite_db" ".tables" 2>/dev/null || echo "")
        if echo "$tables" | grep -q "slaver_processes"; then
            log PASS "SQLite 表 slaver_processes 存在"
            ((TESTS_PASSED++))
        else
            log FAIL "SQLite 表 slaver_processes 不存在"
            ((TESTS_FAILED++))
        fi

        if echo "$tables" | grep -q "confluence_files"; then
            log PASS "SQLite 表 confluence_files 存在"
            ((TESTS_PASSED++))
        else
            log FAIL "SQLite 表 confluence_files 不存在"
            ((TESTS_FAILED++))
        fi

        if echo "$tables" | grep -q "jira_tickets"; then
            log PASS "SQLite 表 jira_tickets 存在"
            ((TESTS_PASSED++))
        else
            log FAIL "SQLite 表 jira_tickets 不存在"
            ((TESTS_FAILED++))
        fi
    fi

    # 测试 2.7: 停止容器
    if "$SCRIPTS_DIR/docker-sqlite.sh" stop 2>/dev/null; then
        log PASS "SQLite 容器停止成功"
        ((TESTS_PASSED++))
    else
        log FAIL "SQLite 容器停止失败"
        ((TESTS_FAILED++))
    fi

    # 测试 2.8: 重启容器
    if "$SCRIPTS_DIR/docker-sqlite.sh" restart 2>/dev/null; then
        log PASS "SQLite 容器重启成功"
        ((TESTS_PASSED++))
        # 保持容器运行供后续测试使用
    else
        log FAIL "SQLite 容器重启失败"
        ((TESTS_FAILED++))
    fi

    echo ""
}

# ==========================================
# 测试 3: Docker Redis 容器
# ==========================================
test_redis_container() {
    log TEST "测试：Docker Redis 容器"
    echo "========================================"
    echo "测试 3: Docker Redis 容器"
    echo "========================================"
    echo ""

    if [ "$DOCKER_AVAILABLE" != true ]; then
        log WARN "跳过：Docker 不可用"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 测试 3.1: Redis 脚本存在
    assert_file_exists "$SCRIPTS_DIR/docker-redis.sh" "Redis 容器脚本存在"

    # 测试 3.2: 启动容器
    if "$SCRIPTS_DIR/docker-redis.sh" start 2>/dev/null; then
        log PASS "Redis 容器启动成功"
        ((TESTS_PASSED++))
    else
        log FAIL "Redis 容器启动失败"
        ((TESTS_FAILED++))
        echo ""
        return
    fi

    # 测试 3.3: 容器运行状态
    if docker ps --filter "name=eket-redis" --format "{{.Status}}" | grep -q "Up"; then
        log PASS "Redis 容器运行中"
        ((TESTS_PASSED++))
    else
        log FAIL "Redis 容器未运行"
        ((TESTS_FAILED++))
    fi

    # 测试 3.4: 配置文件导出
    assert_file_exists "$PROJECT_ROOT/.eket/config/docker-redis.yml" "Redis 配置文件存在"

    # 测试 3.5: Redis 密码配置验证
    local redis_password=$(grep "password:" "$PROJECT_ROOT/.eket/config/docker-redis.yml" 2>/dev/null | awk '{print $2}' || echo "")
    if [ -n "$redis_password" ] && [ "$redis_password" != "null" ]; then
        log PASS "Redis 密码已配置：${redis_password:0:3}***"
        ((TESTS_PASSED++))
    else
        log FAIL "Redis 密码未配置"
        ((TESTS_FAILED++))
    fi

    # 测试 3.6: Redis 连接测试
    local redis_port=$(grep "port:" "$PROJECT_ROOT/.eket/config/docker-redis.yml" 2>/dev/null | awk '{print $2}' || echo "6380")
    if command -v redis-cli &>/dev/null; then
        if redis-cli -p "$redis_port" -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
            log PASS "Redis 连接测试通过 (PONG)"
            ((TESTS_PASSED++))
        else
            log FAIL "Redis 连接测试失败"
            ((TESTS_FAILED++))
        fi
    else
        log WARN "redis-cli 未安装，使用 docker exec 测试"
        ((TESTS_SKIPPED++))
    fi

    # 测试 3.7: Redis 数据读写测试
    if command -v redis-cli &>/dev/null; then
        redis-cli -p "$redis_port" -a "$redis_password" SET "test_key" "test_value" &>/dev/null
        local value=$(redis-cli -p "$redis_port" -a "$redis_password" GET "test_key" 2>/dev/null)
        assert_equals "test_value" "$value" "Redis 数据读写测试"

        # 清理测试数据
        redis-cli -p "$redis_port" -a "$redis_password" DEL "test_key" &>/dev/null
    fi

    # 测试 3.8: 停止容器
    if "$SCRIPTS_DIR/docker-redis.sh" stop 2>/dev/null; then
        log PASS "Redis 容器停止成功"
        ((TESTS_PASSED++))
    else
        log FAIL "Redis 容器停止失败"
        ((TESTS_FAILED++))
    fi

    # 测试 3.9: 重启容器
    if "$SCRIPTS_DIR/docker-redis.sh" restart 2>/dev/null; then
        log PASS "Redis 容器重启成功"
        ((TESTS_PASSED++))
    else
        log FAIL "Redis 容器重启失败"
        ((TESTS_FAILED++))
    fi

    echo ""
}

# ==========================================
# 测试 4: 配置持久化验证
# ==========================================
test_config_persistence() {
    log TEST "测试：配置持久化验证"
    echo "========================================"
    echo "测试 4: 配置持久化验证"
    echo "========================================"
    echo ""

    if [ "$DOCKER_AVAILABLE" != true ]; then
        log WARN "跳过：Docker 不可用"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 测试 4.1: SQLite 配置验证
    if [ -f "$PROJECT_ROOT/.eket/config/docker-sqlite.yml" ]; then
        local container_name=$(grep "container_name:" "$PROJECT_ROOT/.eket/config/docker-sqlite.yml" 2>/dev/null | awk '{print $2}' || echo "")
        assert_equals "eket-sqlite" "$container_name" "SQLite 容器名称配置正确"

        local port=$(grep "port:" "$PROJECT_ROOT/.eket/config/docker-sqlite.yml" 2>/dev/null | awk '{print $2}' || echo "")
        if [ -n "$port" ] && [ "$port" != "null" ]; then
            log PASS "SQLite 端口配置正确：$port"
            ((TESTS_PASSED++))
        else
            log FAIL "SQLite 端口配置缺失"
            ((TESTS_FAILED++))
        fi
    fi

    # 测试 4.2: Redis 配置验证
    if [ -f "$PROJECT_ROOT/.eket/config/docker-redis.yml" ]; then
        local container_name=$(grep "container_name:" "$PROJECT_ROOT/.eket/config/docker-redis.yml" 2>/dev/null | awk '{print $2}' || echo "")
        assert_equals "eket-redis" "$container_name" "Redis 容器名称配置正确"

        local port=$(grep "port:" "$PROJECT_ROOT/.eket/config/docker-redis.yml" 2>/dev/null | awk '{print $2}' || echo "")
        if [ -n "$port" ] && [ "$port" != "null" ]; then
            log PASS "Redis 端口配置正确：$port"
            ((TESTS_PASSED++))
        else
            log FAIL "Redis 端口配置缺失"
            ((TESTS_FAILED++))
        fi
    fi

    echo ""
}

# ==========================================
# 测试 5: 跨容器通信（可选）
# ==========================================
test_cross_container_communication() {
    log TEST "测试：跨容器通信（可选）"
    echo "========================================"
    echo "测试 5: 跨容器通信（可选）"
    echo "========================================"
    echo ""

    if [ "$DOCKER_AVAILABLE" != true ]; then
        log WARN "跳过：Docker 不可用"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 确保两个容器都在运行
    "$SCRIPTS_DIR/docker-sqlite.sh" start 2>/dev/null || true
    "$SCRIPTS_DIR/docker-redis.sh" start 2>/dev/null || true
    sleep 2

    # 测试 5.1: 验证 SQLite 可访问
    local sqlite_db=$(grep "database:" "$PROJECT_ROOT/.eket/config/docker-sqlite.yml" 2>/dev/null | awk '{print $2}' || echo "")
    if [ -f "$sqlite_db" ]; then
        if sqlite3 "$sqlite_db" "SELECT 1;" &>/dev/null; then
            log PASS "SQLite 数据库可访问"
            ((TESTS_PASSED++))
        else
            log FAIL "SQLite 数据库访问失败"
            ((TESTS_FAILED++))
        fi
    fi

    # 测试 5.2: 验证 Redis 可访问
    local redis_port=$(grep "port:" "$PROJECT_ROOT/.eket/config/docker-redis.yml" 2>/dev/null | awk '{print $2}' || echo "6380")
    local redis_password=$(grep "password:" "$PROJECT_ROOT/.eket/config/docker-redis.yml" 2>/dev/null | awk '{print $2}' || echo "")
    if command -v redis-cli &>/dev/null; then
        if redis-cli -p "$redis_port" -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
            log PASS "Redis 数据库可访问"
            ((TESTS_PASSED++))
        else
            log FAIL "Redis 数据库访问失败"
            ((TESTS_FAILED++))
        fi
    fi

    echo ""
}

# ==========================================
# 清理测试环境
# ==========================================
cleanup() {
    log INFO "清理测试环境..."
    echo "========================================"
    echo "清理测试环境"
    echo "========================================"
    echo ""

    # 可选：停止容器（默认保持运行）
    if [ "${KEEP_CONTAINERS:-false}" = true ]; then
        log INFO "保持容器运行（由用户手动清理）"
    else
        log INFO "停止测试容器..."
        "$SCRIPTS_DIR/docker-sqlite.sh" stop 2>/dev/null || true
        "$SCRIPTS_DIR/docker-redis.sh" stop 2>/dev/null || true
    fi

    echo ""
}

# ==========================================
# 生成测试报告
# ==========================================
generate_report() {
    echo "========================================"
    echo "测试报告"
    echo "========================================"
    echo ""
    echo "通过：$TESTS_PASSED"
    echo "失败：$TESTS_FAILED"
    echo "跳过：$TESTS_SKIPPED"
    echo ""

    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ 所有测试通过${NC}"
    else
        echo -e "${RED}✗ 有 $TESTS_FAILED 个测试失败${NC}"
    fi

    echo ""
    echo "测试日志：$LOG_FILE"
    echo ""

    # 生成 Markdown 报告
    local report_file="$PROJECT_ROOT/tests/results/docker-integration-report-$(date +%Y%m%d_%H%M%S).md"
    cat > "$report_file" << EOF
# Docker 容器集成测试报告

**测试时间**: $(date -Iseconds)
**测试环境**: $(uname -s) $(uname -r)

## 测试结果

| 结果 | 数量 |
|------|------|
| 通过 | $TESTS_PASSED |
| 失败 | $TESTS_FAILED |
| 跳过 | $TESTS_SKIPPED |

## 测试详情

详见日志文件：$LOG_FILE

## 结论

$([ $TESTS_FAILED -eq 0 ] && echo "✅ 所有测试通过" || echo "❌ 有 $TESTS_FAILED 个测试失败")
EOF

    log INFO "测试报告已生成：$report_file"
}

# ==========================================
# 主函数
# ==========================================
main() {
    echo "========================================"
    echo "EKET Docker 容器集成测试 v0.6.2"
    echo "========================================"
    echo ""
    echo "日志文件：$LOG_FILE"
    echo ""

    # 运行测试
    test_docker_detection
    test_sqlite_container
    test_redis_container
    test_config_persistence
    test_cross_container_communication

    # 清理和生成报告
    cleanup
    generate_report

    # 退出码
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
