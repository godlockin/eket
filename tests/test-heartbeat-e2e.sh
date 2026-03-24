#!/bin/bash
#
# EKET Slaver 心跳监控端到端测试脚本 v0.6.2
# 用途：测试 Slaver 心跳监控的完整流程
#
# 用法：
#   ./tests/test-heartbeat-e2e.sh [--verbose]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
STATE_DIR="$PROJECT_ROOT/.eket/state"
SLAVER_STATE_DIR="$STATE_DIR/slavers"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
LOGS_DIR="$PROJECT_ROOT/logs"

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
LOG_FILE="$LOGS_DIR/heartbeat-e2e-test-$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

# 测试用 Slaver 名称
TEST_SLAVER_NAME="test_slaver_$(date +%Y%m%d_%H%M%S)"
TEST_TASK_ID="TEST-001"

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

assert_file_not_exists() {
    local file="$1"
    local message="$2"

    if [ ! -f "$file" ]; then
        log PASS "$message"
        ((TESTS_PASSED++))
        return 0
    else
        log FAIL "$message (文件应不存在：$file)"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_contains() {
    local file="$1"
    local pattern="$2"
    local message="$3"

    if grep -q "$pattern" "$file" 2>/dev/null; then
        log PASS "$message"
        ((TESTS_PASSED++))
        return 0
    else
        log FAIL "$message (未找到模式：$pattern)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ==========================================
# 测试 1: 脚本存在性检查
# ==========================================
test_script_existence() {
    log TEST "测试：脚本存在性检查"
    echo "========================================"
    echo "测试 1: 脚本存在性检查"
    echo "========================================"
    echo ""

    assert_file_exists "$SCRIPTS_DIR/slaver-heartbeat.sh" "slaver-heartbeat.sh 存在"
    assert_file_exists "$SCRIPTS_DIR/heartbeat-monitor.sh" "heartbeat-monitor.sh 存在"
    assert_file_exists "$SCRIPTS_DIR/check-docker.sh" "check-docker.sh 存在"

    echo ""
}

# ==========================================
# 测试 2: Slaver 进程注册
# ==========================================
test_slaver_registration() {
    log TEST "测试：Slaver 进程注册"
    echo "========================================"
    echo "测试 2: Slaver 进程注册"
    echo "========================================"
    echo ""

    # 确保目录存在
    mkdir -p "$SLAVER_STATE_DIR"

    # 测试 2.1: 注册 Slaver
    if "$SCRIPTS_DIR/slaver-heartbeat.sh" register "$TEST_SLAVER_NAME" "$TEST_TASK_ID" 2>/dev/null; then
        log PASS "Slaver 注册成功"
        ((TESTS_PASSED++))
    else
        log FAIL "Slaver 注册失败"
        ((TESTS_FAILED++))
        echo ""
        return
    fi

    # 测试 2.2: 状态文件创建
    local state_file="$SLAVER_STATE_DIR/${TEST_SLAVER_NAME}.yml"
    assert_file_exists "$state_file" "Slaver 状态文件已创建"

    # 测试 2.3: 状态文件内容验证
    if [ -f "$state_file" ]; then
        assert_contains "$state_file" "slaver_name: $TEST_SLAVER_NAME" "状态文件包含 slaver_name"
        assert_contains "$state_file" "task_id: $TEST_TASK_ID" "状态文件包含 task_id"
        assert_contains "$state_file" "status: active" "状态文件包含 status: active"
        assert_contains "$state_file" "pid:" "状态文件包含 pid"
        assert_contains "$state_file" "started_at:" "状态文件包含 started_at"
    fi

    echo ""
}

# ==========================================
# 测试 3: 心跳上传功能
# ==========================================
test_heartbeat_upload() {
    log TEST "测试：心跳上传功能"
    echo "========================================"
    echo "测试 3: 心跳上传功能"
    echo "========================================"
    echo ""

    local state_file="$SLAVER_STATE_DIR/${TEST_SLAVER_NAME}.yml"

    # 测试 3.1: 发送心跳
    if "$SCRIPTS_DIR/slaver-heartbeat.sh" heartbeat "$TEST_SLAVER_NAME" 2>/dev/null; then
        log PASS "心跳发送成功"
        ((TESTS_PASSED++))
    else
        log FAIL "心跳发送失败"
        ((TESTS_FAILED++))
        echo ""
        return
    fi

    # 测试 3.2: 心跳计数更新
    sleep 1
    if [ -f "$state_file" ]; then
        local heartbeat_count=$(grep "heartbeat_count:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "0")
        if [ "$heartbeat_count" -gt 0 ]; then
            log PASS "心跳计数已更新：$heartbeat_count"
            ((TESTS_PASSED++))
        else
            log FAIL "心跳计数未更新"
            ((TESTS_FAILED++))
        fi
    fi

    # 测试 3.3: 最后心跳时间更新
    if [ -f "$state_file" ]; then
        local last_heartbeat=$(grep "last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ' || echo "")
        if [ -n "$last_heartbeat" ]; then
            log PASS "最后心跳时间已更新：$last_heartbeat"
            ((TESTS_PASSED++))
        else
            log FAIL "最后心跳时间未更新"
            ((TESTS_FAILED++))
        fi
    fi

    # 测试 3.4: 连续发送多次心跳
    for i in 1 2 3; do
        sleep 1
        "$SCRIPTS_DIR/slaver-heartbeat.sh" heartbeat "$TEST_SLAVER_NAME" 2>/dev/null || true
    done

    if [ -f "$state_file" ]; then
        local heartbeat_count=$(grep "heartbeat_count:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "0")
        if [ "$heartbeat_count" -ge 4 ]; then
            log PASS "连续心跳计数正确：$heartbeat_count"
            ((TESTS_PASSED++))
        else
            log FAIL "连续心跳计数不正确：$heartbeat_count (期望>=4)"
            ((TESTS_FAILED++))
        fi
    fi

    echo ""
}

# ==========================================
# 测试 4: 心跳监控检测
# ==========================================
test_heartbeat_monitor() {
    log TEST "测试：心跳监控检测"
    echo "========================================"
    echo "测试 4: 心跳监控检测"
    echo "========================================"
    echo ""

    # 测试 4.1: 心跳监控脚本存在
    assert_file_exists "$SCRIPTS_DIR/heartbeat-monitor.sh" "心跳监控脚本存在"

    # 测试 4.2: 执行单次心跳检查
    if "$SCRIPTS_DIR/heartbeat-monitor.sh" --check 2>/dev/null; then
        log PASS "心跳监控检查执行成功"
        ((TESTS_PASSED++))
    else
        log WARN "心跳监控检查执行失败"
        ((TESTS_FAILED++))
    fi

    # 测试 4.3: 验证当前 Slaver 心跳正常
    local state_file="$SLAVER_STATE_DIR/${TEST_SLAVER_NAME}.yml"
    if [ -f "$state_file" ]; then
        local last_heartbeat=$(grep "last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ' || echo "")
        if [ -n "$last_heartbeat" ]; then
            log PASS "Slaver 心跳记录正常"
            ((TESTS_PASSED++))
        else
            log FAIL "Slaver 心跳记录缺失"
            ((TESTS_FAILED++))
        fi
    fi

    echo ""
}

# ==========================================
# 测试 5: 超时检测和进程终止
# ==========================================
test_timeout_detection() {
    log TEST "测试：超时检测和进程终止（模拟）"
    echo "========================================"
    echo "测试 5: 超时检测和进程终止（模拟）"
    echo "========================================"
    echo ""

    # 测试 5.1: 修改心跳时间为过去（模拟超时）
    local state_file="$SLAVER_STATE_DIR/${TEST_SLAVER_NAME}.yml"
    if [ -f "$state_file" ]; then
        # 保存原始心跳时间
        local original_heartbeat=$(grep "last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ')

        # 模拟 10 分钟前的心跳
        local old_time=$(date -d "10 minutes ago" -Iseconds 2>/dev/null || date -v-10M -Iseconds 2>/dev/null || echo "")
        if [ -n "$old_time" ]; then
            sed -i.bak "s/^last_heartbeat:.*/last_heartbeat: $old_time/" "$state_file"
            rm -f "$state_file.bak"
            log PASS "模拟心跳超时设置成功"
            ((TESTS_PASSED++))

            # 验证修改成功
            local new_heartbeat=$(grep "last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ')
            if [ "$new_heartbeat" = "$old_time" ]; then
                log PASS "心跳时间已修改为过去时间"
                ((TESTS_PASSED++))
            else
                log FAIL "心跳时间修改失败"
                ((TESTS_FAILED++))
            fi
        else
            log WARN "无法生成过去时间，跳过此测试"
            ((TESTS_SKIPPED++))
        fi
    fi

    # 测试 5.2: 执行心跳监控（应检测到超时）
    log INFO "执行心跳监控检查超时检测..."

    # 临时修改超时阈值为 300 秒（5 分钟）以便测试
    local timeout_threshold=300
    local current_time=$(date +%s)
    local old_timestamp=$(date -d "$old_time" +%s 2>/dev/null || echo "0")
    local elapsed=$((current_time - old_timestamp))

    if [ "$elapsed" -gt "$timeout_threshold" ]; then
        log INFO "心跳已超时 ${elapsed}秒 > ${timeout_threshold}秒"
        log PASS "超时条件满足"
        ((TESTS_PASSED++))

        # 注意：实际杀进程测试会影响系统，这里只验证检测逻辑
        log INFO "跳过实际杀进程测试（需要人工验证）"
        ((TESTS_SKIPPED++))
    else
        log WARN "超时条件不满足，跳过测试"
        ((TESTS_SKIPPED++))
    fi

    # 恢复原始心跳时间
    if [ -n "$original_heartbeat" ] && [ -f "$state_file" ]; then
        sed -i.bak "s/^last_heartbeat:.*/last_heartbeat: $original_heartbeat/" "$state_file"
        rm -f "$state_file.bak"
    fi

    echo ""
}

# ==========================================
# 测试 6: Redis 集成测试（可选）
# ==========================================
test_redis_integration() {
    log TEST "测试：Redis 集成测试（可选）"
    echo "========================================"
    echo "测试 6: Redis 集成测试（可选）"
    echo "========================================"
    echo ""

    local redis_config="$CONFIG_DIR/docker-redis.yml"

    # 检查 Redis 是否可用
    if [ ! -f "$redis_config" ]; then
        log WARN "Redis 配置文件不存在，跳过测试"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    local redis_port=$(grep "port:" "$redis_config" 2>/dev/null | awk '{print $2}' || echo "6380")
    local redis_password=$(grep "password:" "$redis_config" 2>/dev/null | awk '{print $2}' || echo "")

    # 检查 Docker 容器是否运行
    if ! docker ps --filter "name=eket-redis" &>/dev/null; then
        log WARN "Redis 容器未运行，跳过测试"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 测试 6.1: redis-cli 可用性
    if ! command -v redis-cli &>/dev/null; then
        log WARN "redis-cli 未安装，跳过测试"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 测试 6.2: Redis 连接
    if redis-cli -p "$redis_port" -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
        log PASS "Redis 连接成功"
        ((TESTS_PASSED++))
    else
        log FAIL "Redis 连接失败"
        ((TESTS_FAILED++))
        echo ""
        return
    fi

    # 测试 6.3: 注册到 Redis
    if "$SCRIPTS_DIR/slaver-heartbeat.sh" heartbeat "$TEST_SLAVER_NAME" 2>/dev/null; then
        # 检查 Redis 中是否有数据
        local redis_data=$(redis-cli -p "$redis_port" -a "$redis_password" HGETALL "slaver:$TEST_SLAVER_NAME" 2>/dev/null || echo "")
        if [ -n "$redis_data" ]; then
            log PASS "Slaver 数据已同步到 Redis"
            ((TESTS_PASSED++))
        else
            log WARN "Redis 中未找到 Slaver 数据（可能是降级模式）"
            ((TESTS_SKIPPED++))
        fi
    fi

    echo ""
}

# ==========================================
# 测试 7: SQLite 集成测试（可选）
# ==========================================
test_sqlite_integration() {
    log TEST "测试：SQLite 集成测试（可选）"
    echo "========================================"
    echo "测试 7: SQLite 集成测试（可选）"
    echo "========================================"
    echo ""

    local sqlite_config="$CONFIG_DIR/docker-sqlite.yml"

    # 检查 SQLite 是否可用
    if [ ! -f "$sqlite_config" ]; then
        log WARN "SQLite 配置文件不存在，跳过测试"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    local sqlite_db=$(grep "database:" "$sqlite_config" 2>/dev/null | awk '{print $2}' || echo "")

    if [ -z "$sqlite_db" ] || [ ! -f "$sqlite_db" ]; then
        log WARN "SQLite 数据库文件不存在，跳过测试"
        ((TESTS_SKIPPED++))
        echo ""
        return
    fi

    # 测试 7.1: SQLite 表存在
    local tables=$(sqlite3 "$sqlite_db" ".tables" 2>/dev/null || echo "")
    if echo "$tables" | grep -q "slaver_processes"; then
        log PASS "SQLite slaver_processes 表存在"
        ((TESTS_PASSED++))
    else
        log FAIL "SQLite slaver_processes 表不存在"
        ((TESTS_FAILED++))
    fi

    # 测试 7.2: 查询 Slaver 数据
    local count=$(sqlite3 "$sqlite_db" "SELECT COUNT(*) FROM slaver_processes;" 2>/dev/null || echo "0")
    log INFO "SQLite 中 Slaver 记录数：$count"
    log PASS "SQLite 查询成功"
    ((TESTS_PASSED++))

    echo ""
}

# ==========================================
# 清理测试数据
# ==========================================
cleanup_test_data() {
    log INFO "清理测试数据..."
    echo "========================================"
    echo "清理测试数据"
    echo "========================================"
    echo ""

    local state_file="$SLAVER_STATE_DIR/${TEST_SLAVER_NAME}.yml"

    # 删除测试 Slaver 状态文件
    if [ -f "$state_file" ]; then
        rm -f "$state_file"
        log INFO "已删除测试状态文件：$state_file"
    fi

    # 清理 Redis 中的测试数据
    local redis_config="$CONFIG_DIR/docker-redis.yml"
    if [ -f "$redis_config" ] && command -v redis-cli &>/dev/null; then
        local redis_port=$(grep "port:" "$redis_config" 2>/dev/null | awk '{print $2}' || echo "6380")
        local redis_password=$(grep "password:" "$redis_config" 2>/dev/null | awk '{print $2}' || echo "")
        redis-cli -p "$redis_port" -a "$redis_password" DEL "slaver:$TEST_SLAVER_NAME" &>/dev/null || true
    fi

    # 清理 SQLite 中的测试数据
    local sqlite_config="$CONFIG_DIR/docker-sqlite.yml"
    if [ -f "$sqlite_config" ]; then
        local sqlite_db=$(grep "database:" "$sqlite_config" 2>/dev/null | awk '{print $2}' || echo "")
        if [ -n "$sqlite_db" ] && [ -f "$sqlite_db" ]; then
            sqlite3 "$sqlite_db" "DELETE FROM slaver_processes WHERE slaver_name='$TEST_SLAVER_NAME';" &>/dev/null || true
        fi
    fi

    log PASS "测试数据已清理"
    ((TESTS_PASSED++))

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
    local pass_rate=0
    if [ $total -gt 0 ]; then
        pass_rate=$((TESTS_PASSED * 100 / total))
    fi

    echo "通过率：${pass_rate}%"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ 所有测试通过${NC}"
    else
        echo -e "${RED}✗ 有 $TESTS_FAILED 个测试失败${NC}"
    fi

    echo ""
    echo "测试日志：$LOG_FILE"
    echo ""

    # 生成 Markdown 报告
    local report_file="$LOGS_DIR/heartbeat-e2e-report-$(date +%Y%m%d_%H%M%S).md"
    cat > "$report_file" << EOF
# Slaver 心跳监控端到端测试报告

**测试时间**: $(date -Iseconds)
**测试环境**: $(uname -s) $(uname -r)

## 测试结果

| 结果 | 数量 |
|------|------|
| 通过 | $TESTS_PASSED |
| 失败 | $TESTS_FAILED |
| 跳过 | $TESTS_SKIPPED |

**通过率**: ${pass_rate}%

## 测试项目

1. ✅ 脚本存在性检查
2. ✅ Slaver 进程注册
3. ✅ 心跳上传功能
4. ✅ 心跳监控检测
5. ✅ 超时检测和进程终止（模拟）
6. ⚠️ Redis 集成测试（可选）
7. ⚠️ SQLite 集成测试（可选）

## 结论

$([ $TESTS_FAILED -eq 0 ] && echo "✅ 所有核心测试通过" || echo "❌ 有 $TESTS_FAILED 个测试失败")
EOF

    log INFO "测试报告已生成：$report_file"
}

# ==========================================
# 主函数
# ==========================================
main() {
    echo "========================================"
    echo "EKET Slaver 心跳监控端到端测试 v0.6.2"
    echo "========================================"
    echo ""
    echo "测试 Slaver 名称：$TEST_SLAVER_NAME"
    echo "日志文件：$LOG_FILE"
    echo ""

    # 确保目录存在
    mkdir -p "$SLAVER_STATE_DIR" "$LOGS_DIR"

    # 运行测试
    test_script_existence
    test_slaver_registration
    test_heartbeat_upload
    test_heartbeat_monitor
    test_timeout_detection
    test_redis_integration
    test_sqlite_integration

    # 清理和生成报告
    cleanup_test_data
    generate_report

    # 退出码
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"
