#!/bin/bash
# tests/run-uat-tests.sh - 用户验收测试

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
echo "EKET 用户验收测试 (UAT)"
echo "========================================"
echo ""

mkdir -p "$RESULTS_DIR"

# UAT 测试结果模板
cat > "$RESULTS_DIR/uat-results.md" << 'EOF'
# 用户验收测试结果

**执行时间**: $(date -Iseconds)
**测试者**: _______________
**日期**: _______________

---

## 评分说明

请根据实际体验为每个项目评分 (1-5 分)：
- 5 分：非常好，超出预期
- 4 分：好，符合预期
- 3 分：一般，基本可用
- 2 分：差，需要改进
- 1 分：非常差，无法使用

---

## 测试项目

### A01: 易用性

**测试内容**: 新用户在不看文档的情况下，10 分钟内完成第一次任务领取

**步骤**:
1. 初始化新项目
2. 启动 Claude
3. 运行 /eket-start
4. 领取一个任务

**观察点**:
- [ ] 能否找到正确的命令
- [ ] 命令输出是否清晰
- [ ] 是否知道下一步做什么

**评分**: ___ / 5

**意见**: _______________

---

### A02: 可理解性

**测试内容**: 输出信息是否清晰易懂

**检查项**:
- [ ] 模式切换说明清晰
- [ ] 任务推荐理由合理
- [ ] 错误信息有帮助
- [ ] 状态更新反馈及时

**评分**: ___ / 5

**意见**: _______________

---

### A03: 可靠性

**测试内容**: 系统是否稳定，无崩溃/数据丢失

**检查项**:
- [ ] 脚本执行无崩溃
- [ ] 任务状态正确更新
- [ ] 文件读写正常
- [ ] 无数据丢失

**评分**: ___ / 5

**意见**: _______________

---

### A04: 效率

**测试内容**: 从任务到完成的时间是否合理

**测量**:
- 启动时间：___ 秒
- 任务分析时间：___ 秒
- Profile 加载时间：___ 秒

**评分**: ___ / 5

**意见**: _______________

---

### A05: 满意度

**测试内容**: 整体满意度

**问题**:
1. 你是否愿意向他人推荐这个框架？ ___ / 5
2. 你觉得这个框架解决了你的问题？ ___ / 5
3. 你觉得这个框架易于使用？ ___ / 5

**平均评分**: ___ / 5

**意见**: _______________

---

## 总体评价

**总分**: ___ / 25

**评级**:
- 23-25: 优秀
- 20-22: 良好
- 15-19: 一般
- 10-14: 需要改进
- <10: 不合格

**评级结果**: _______________

---

## 改进建议

1. _______________
2. _______________
3. _______________

EOF

echo "用户验收测试问卷已生成"
echo ""
echo "位置：$RESULTS_DIR/uat-results.md"
echo ""
echo "请邀请真实用户完成此问卷"
echo ""

# 自动化 UAT 检查项
echo "========================================"
echo "自动化 UAT 检查"
echo "========================================"
echo ""

UAT_TOTAL=0
UAT_PASSED=0

run_uat_check() {
    local check_id="$1"
    local check_name="$2"
    local check_script="$3"

    UAT_TOTAL=$((UAT_TOTAL + 1))
    echo -ne "检查 $check_id: $check_name... "

    if eval "$check_script"; then
        echo -e "${GREEN}✓ 通过${NC}"
        UAT_PASSED=$((UAT_PASSED + 1))
    else
        echo -e "${RED}✗ 失败${NC}"
    fi
}

# UAT 检查项

# A01: 命令可发现性
check_command_discoverability() {
    # 检查 help 命令是否存在
    if [ -f "$PROJECT_ROOT/template/.claude/commands/eket-help.sh" ]; then
        return 0
    fi
    return 1
}

# A02: 错误信息友好性
check_error_messages() {
    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature

    # 创建已领取任务
    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Test
status: in_progress
EOF

    cp "$PROJECT_ROOT/template/.claude/commands/eket-claim.sh" .
    local output=$(bash eket-claim.sh FEAT-001 2>&1) || true

    cd /
    rm -rf "$test_dir"

    # 检查错误信息是否友好
    if echo "$output" | grep -q "已被领取\|状态不适合"; then
        return 0
    fi
    return 1
}

# A03: 状态反馈
check_status_feedback() {
    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p jira/tickets/feature .eket/state

    cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Test
status: ready
EOF

    cp "$PROJECT_ROOT/template/.claude/commands/eket-claim.sh" .
    mkdir -p scripts
    echo '#!/bin/bash' > scripts/load-agent-profile.sh  # Mock

    local output=$(bash eket-claim.sh FEAT-001 2>&1) || true

    cd /
    rm -rf "$test_dir"

    # 检查是否有状态更新反馈
    if echo "$output" | grep -q "已领取\|in_progress"; then
        return 0
    fi
    return 1
}

# A04: 启动时间
check_startup_time() {
    local test_dir=$(mktemp -d)
    cd "$test_dir"
    mkdir -p confluence jira code_repo .eket/state
    echo "# C" > confluence/README.md
    echo "# J" > jira/README.md

    cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" .
    cp "$PROJECT_ROOT/scripts/"*.sh . 2>/dev/null || true

    local start=$(date +%s%N)
    bash eket-start.sh > /dev/null 2>&1 || true
    local end=$(date +%s%N)

    local duration_ms=$(( (end - start) / 1000000 ))
    cd /
    rm -rf "$test_dir"

    echo "(${duration_ms}ms)"

    # 5 秒内完成
    if [ $duration_ms -lt 5000 ]; then
        return 0
    fi
    return 1
}

# A05: 文档完整性
check_documentation() {
    local docs="$PROJECT_ROOT/docs"

    # 检查关键文档是否存在
    local required_docs=(
        "QUICKSTART.md"
        "INSTANCE_INITIALIZATION.md"
        "TEST_FRAMEWORK.md"
    )

    for doc in "${required_docs[@]}"; do
        if [ ! -f "$docs/$doc" ]; then
            return 1
        fi
    done

    return 0
}

# 执行 UAT 检查
run_uat_check "A01" "命令可发现性" "check_command_discoverability"
run_uat_check "A02" "错误信息友好性" "check_error_messages"
run_uat_check "A03" "状态反馈" "check_status_feedback"
run_uat_check "A04" "启动时间 (<5s)" "check_startup_time"
run_uat_check "A05" "文档完整性" "check_documentation"

echo ""
echo "自动化 UAT 检查：$UAT_PASSED / $UAT_TOTAL"
echo ""
echo "请完成人工 UAT 问卷：$RESULTS_DIR/uat-results.md"
