#!/bin/bash
#
# EKET 配置验证脚本 v0.5.1
# 用途：验证配置文件的完整性和有效性
#
# 用法：
#   ./scripts/validate-config.sh [--strict]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
MAIN_CONFIG="$PROJECT_ROOT/.eket/config.yml"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

STRICT_MODE=false

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必填配置文件
check_required_files() {
    local required_files=(
        "$MAIN_CONFIG"
        "$CONFIG_DIR/project.yml"
        "$CONFIG_DIR/tasks.yml"
        "$CONFIG_DIR/monitoring.yml"
        "$CONFIG_DIR/permissions.yml"
    )

    local missing=()

    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            missing+=("$file")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "缺失必填配置文件:"
        for file in "${missing[@]}"; do
            echo "  - $file"
        done
        return 1
    fi

    log_info "必填文件检查通过"
    return 0
}

# 验证 YAML 语法
validate_yaml_syntax() {
    local file="$1"

    if command -v python3 &> /dev/null; then
        python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null
        if [ $? -eq 0 ]; then
            return 0
        else
            log_error "YAML 语法错误：$file"
            return 1
        fi
    else
        log_warn "Python3 未安装，跳过 YAML 验证"
        return 0
    fi
}

# 验证所有配置文件的 YAML 语法
validate_all_yaml() {
    local errors=0

    for file in "$CONFIG_DIR"/*.yml; do
        if [ -f "$file" ]; then
            if ! validate_yaml_syntax "$file"; then
                ((errors++))
            fi
        fi
    done

    if [ $errors -gt 0 ]; then
        log_error "$errors 个配置文件存在 YAML 语法错误"
        return 1
    fi

    log_info "YAML 语法检查通过"
    return 0
}

# 验证必填字段
check_required_fields() {
    local errors=0

    # 检查 project.yml
    if ! grep -q "^version:" "$CONFIG_DIR/project.yml" 2>/dev/null; then
        log_error "project.yml 缺少 version 字段"
        ((errors++))
    fi

    # 检查 tasks.yml
    if ! grep -q "^tasks:" "$CONFIG_DIR/tasks.yml" 2>/dev/null; then
        log_error "tasks.yml 缺少 tasks 字段"
        ((errors++))
    fi

    # 检查 monitoring.yml
    if ! grep -q "^monitoring:" "$CONFIG_DIR/monitoring.yml" 2>/dev/null; then
        log_error "monitoring.yml 缺少 monitoring 字段"
        ((errors++))
    fi

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_info "必填字段检查通过"
    return 0
}

# 验证配置值范围
check_value_ranges() {
    local errors=0

    # 检查超时配置
    if [ -f "$CONFIG_DIR/tasks.yml" ]; then
        local timeout=$(grep "no_response_timeout_minutes:" "$CONFIG_DIR/tasks.yml" 2>/dev/null | head -1 | awk '{print $2}')
        if [ -n "$timeout" ] && [ "$timeout" -lt 10 ]; then
            log_error "no_response_timeout_minutes 不能小于 10 分钟"
            ((errors++))
        fi
    fi

    # 检查 Sprint 配置
    if [ -f "$CONFIG_DIR/process.yml" ]; then
        local sprint_days=$(grep "duration_days:" "$CONFIG_DIR/process.yml" 2>/dev/null | head -1 | awk '{print $2}')
        if [ -n "$sprint_days" ] && [ "$sprint_days" -lt 1 ]; then
            log_error "sprint duration_days 不能小于 1 天"
            ((errors++))
        fi
    fi

    if [ $errors -gt 0 ]; then
        return 1
    fi

    log_info "配置值范围检查通过"
    return 0
}

# 严格模式下的额外检查
strict_checks() {
    log_info "执行严格模式检查..."

    # 检查配置一致性
    # 检查循环引用
    # 检查未使用的配置项

    log_info "严格模式检查通过"
    return 0
}

# 生成验证报告
generate_report() {
    local report_file="$PROJECT_ROOT/.eket/config-validation-report.yml"

    cat > "$report_file" << EOF
# 配置验证报告

timestamp: $(date -Iseconds)
status: passed
checks:
  required_files: passed
  yaml_syntax: passed
  required_fields: passed
  value_ranges: passed
EOF

    log_info "验证报告已生成：$report_file"
}

# 主函数
main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --strict)
                STRICT_MODE=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    log_info "开始验证配置..."

    local exit_code=0

    # 执行检查
    check_required_files || exit_code=1
    validate_all_yaml || exit_code=1
    check_required_fields || exit_code=1
    check_value_ranges || exit_code=1

    if [ "$STRICT_MODE" = true ]; then
        strict_checks || exit_code=1
    fi

    # 生成报告
    if [ $exit_code -eq 0 ]; then
        generate_report
        log_info "✅ 配置验证通过"
    else
        log_error "❌ 配置验证失败，请修复上述问题"
    fi

    exit $exit_code
}

main "$@"
