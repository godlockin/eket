#!/bin/bash
# tests/run-all-tests.sh - 运行所有测试

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
echo "EKET 完整测试套件"
echo "========================================"
echo ""
echo "项目根目录：$PROJECT_ROOT"
echo "测试结果目录：$RESULTS_DIR"
echo ""

mkdir -p "$RESULTS_DIR"

# 测试统计
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0

# 最终报告
cat > "$RESULTS_DIR/final-report.md" << 'EOF'
# EKET 框架测试报告

**执行时间**: $(date -Iseconds)
**版本**: 0.2.0

---

## 测试概览

| 测试类型 | 通过 | 失败 | 通过率 |
|---------|------|------|--------|
EOF

run_test_suite() {
    local suite_name="$1"
    local suite_script="$2"

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} 运行 $suite_name${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    local start_time=$(date +%s)

    if bash "$suite_script"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✓ $suite_name 完成 (${duration}s)${NC}"
        echo "| $suite_name | ✓ | - | 100% |" >> "$RESULTS_DIR/final-report.md"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}✗ $suite_name 完成 (${duration}s)${NC}"
        echo "| $suite_name | - | ✗ | - |" >> "$RESULTS_DIR/final-report.md"
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

# ==========================================
# 运行所有测试套件
# ==========================================

# L1: 单元测试
run_test_suite "L1: 单元测试" "$SCRIPT_DIR/run-unit-tests.sh"

echo "" >> "$RESULTS_DIR/final-report.md"

# L2: 集成测试
run_test_suite "L2: 集成测试" "$SCRIPT_DIR/run-integration-tests.sh"

echo "" >> "$RESULTS_DIR/final-report.md"

# L3: 场景测试
run_test_suite "L3: 场景测试" "$SCRIPT_DIR/run-scenario-tests.sh"

echo "" >> "$RESULTS_DIR/final-report.md"

# L4: 压力测试
run_test_suite "L4: 压力测试" "$SCRIPT_DIR/run-stress-tests.sh"

echo "" >> "$RESULTS_DIR/final-report.md"

# L5: UAT 测试
run_test_suite "L5: UAT 测试" "$SCRIPT_DIR/run-uat-tests.sh"

# ==========================================
# 生成最终报告
# ==========================================
cat >> "$RESULTS_DIR/final-report.md" << EOF

---

## 测试总结

**执行时间**: $(date -Iseconds)
**测试套件总数**: $TOTAL_TESTS
**通过**: $((TOTAL_TESTS - TOTAL_FAILED))
**失败**: $TOTAL_FAILED

EOF

if [ $TOTAL_FAILED -eq 0 ]; then
    cat >> "$RESULTS_DIR/final-report.md" << 'EOF'

## 结论

✓ 所有测试通过，框架质量符合发布标准。

EOF
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN} 所有测试通过！${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    cat >> "$RESULTS_DIR/final-report.md" << 'EOF'

## 结论

✗ 有测试失败，请修复后重新运行。

EOF
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED} 有测试失败！${NC}"
    echo -e "${RED}========================================${NC}"
fi

echo ""
echo "完整报告：$RESULTS_DIR/final-report.md"
echo ""

# 返回结果
if [ $TOTAL_FAILED -eq 0 ]; then
    exit 0
else
    exit 1
fi
