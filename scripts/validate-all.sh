#!/bin/bash
#
# EKET 全量验证脚本 v0.5.2
# 用途：校验所有配置文件和脚本的语法、格式、结构
#
# 用法:
#   ./scripts/validate-all.sh [--fix]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/template/.eket/config"
COMMANDS_DIR="$PROJECT_ROOT/template/.claude/commands"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 统计
ERRORS=0
WARNINGS=0
FIX_MODE=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix|-f)
            FIX_MODE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# ==========================================
# YAML 语法校验
# ==========================================
validate_yaml_files() {
    log_section "YAML 语法校验"

    local yaml_files=(
        "$CONFIG_DIR"/*.yml
        "$PROJECT_ROOT"/.eket/config/*.yml
    )

    for file in "${yaml_files[@]}"; do
        if [ -f "$file" ]; then
            log_info "校验：$file"

            # 检查 YAML 基本语法
            if command -v python3 &>/dev/null; then
                if ! python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null; then
                    log_error "✗ YAML 语法错误：$file"
                    ((ERRORS++))

                    # 尝试修复常见问题
                    if [ "$FIX_MODE" = true ]; then
                        try_fix_yaml "$file"
                    fi
                else
                    echo -e "  ${GREEN}✓${NC} YAML 语法正确"
                fi
            elif command -v yq &>/dev/null; then
                if ! yq eval '.' "$file" >/dev/null 2>&1; then
                    log_error "✗ YAML 语法错误：$file"
                    ((ERRORS++))
                else
                    echo -e "  ${GREEN}✓${NC} YAML 语法正确"
                fi
            else
                log_warn "⚠ 未找到 yaml 或 yq 工具，跳过语法校验"
                # 基础检查：检查是否有明显的格式错误
                if grep -qE "^[[:space:]]*[^#[:space:]][^:]*:[^:]*$" "$file" 2>/dev/null; then
                    log_warn "⚠ 可能存在 YAML 格式问题"
                    ((WARNINGS++))
                fi
            fi

            # 检查中文字符 key（非法）- 只检测行首且后面紧跟冒号的
            # 排除注释行（以#开头），排除空行，排除纯英文 key
            # 使用 Unicode 范围 \x{4e00}-\x{9fa5} 检测中文字符
            if command -v python3 &>/dev/null; then
                if python3 -c "
import yaml
import re
with open('$file', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip()
        if not line or line.startswith('#') or line.strip().startswith('#'):
            continue
        # 检查是否是 YAML key 行（以非空格开头，包含冒号）
        match = re.match(r'^(\s*)([^:#]+?):.*', line)
        if match:
            key = match.group(2).strip()
            # 检查 key 是否包含中文字符
            if re.search(r'[\u4e00-\u9fff]', key):
                print(f'Chinese key found: {key}')
                exit(1)
" 2>/dev/null; then
                    : # 未找到中文字符 key，通过
                else
                    log_error "✗ 发现中文字符 key：$file"
                    ((ERRORS++))
                fi
            else
                # 无 python3，使用简单检查
                if grep -v "^[[:space:]]*#" "$file" | grep -qE "^[[:space:]]*[\u4e00-\u9fff][^:]*:" 2>/dev/null; then
                    log_error "✗ 发现中文字符 key：$file"
                    ((ERRORS++))
                fi
            fi
        fi
    done
}

# 尝试修复 YAML 常见问题
try_fix_yaml() {
    local file="$1"
    log_info "尝试修复：$file"

    # 备份
    cp "$file" "${file}.bak"

    # 修复常见缩进问题（4 空格）
    # 这里只做简单修复，复杂问题需要手动修复
    sed -i '' 's/^[[:space:]]*\t/    /g' "$file" 2>/dev/null || true

    log_info "已创建备份：${file}.bak"
}

# ==========================================
# Shell 脚本语法校验
# ==========================================
validate_shell_scripts() {
    log_section "Shell 脚本语法校验"

    local script_dirs=(
        "$SCRIPT_DIR"
        "$COMMANDS_DIR"
    )

    for dir in "${script_dirs[@]}"; do
        if [ -d "$dir" ]; then
            for file in "$dir"/*.sh; do
                if [ -f "$file" ]; then
                    log_info "校验：$file"

                    # 语法检查
                    if bash -n "$file" 2>/dev/null; then
                        echo -e "  ${GREEN}✓${NC} 语法正确"
                    else
                        log_error "✗ 语法错误：$file"
                        bash -n "$file" 2>&1 | head -5
                        ((ERRORS++))
                    fi

                    # 检查执行权限
                    if [ -x "$file" ]; then
                        echo -e "  ${GREEN}✓${NC} 执行权限已设置"
                    else
                        log_warn "⚠ 缺少执行权限：$file"
                        ((WARNINGS++))

                        if [ "$FIX_MODE" = true ]; then
                            chmod +x "$file"
                            log_info "✓ 已添加执行权限"
                        fi
                    fi

                    # 检查 shebang
                    if ! head -1 "$file" | grep -q "^#!"; then
                        log_warn "⚠ 缺少 shebang: $file"
                        ((WARNINGS++))
                    fi

                    # 检查 set -e
                    if ! grep -q "^set -e" "$file" 2>/dev/null; then
                        log_warn "⚠ 未设置 set -e: $file"
                        ((WARNINGS++))
                    fi
                fi
            done
        fi
    done
}

# ==========================================
# 配置结构校验
# ==========================================
validate_config_structure() {
    log_section "配置结构校验"

    local config_file="$PROJECT_ROOT/template/.eket/config.yml"

    if [ -f "$config_file" ]; then
        log_info "校验主配置：$config_file"

        # 检查必需字段
        local required_fields=(
            "version"
            "mode"
            "profile"
        )

        for field in "${required_fields[@]}"; do
            if ! grep -q "^${field}:" "$config_file" 2>/dev/null; then
                log_error "✗ 缺少必需字段：$field"
                ((ERRORS++))
            else
                echo -e "  ${GREEN}✓${NC} 字段存在：$field"
            fi
        done

        # 检查 @load 指令
        local module_files=(
            "config/project.yml"
            "config/tasks.yml"
            "config/monitoring.yml"
            "config/permissions.yml"
            "config/git.yml"
            "config/review_merge.yml"
            "config/process.yml"
            "config/testing.yml"
            "config/memory_log.yml"
            "config/advanced.yml"
        )

        for module in "${module_files[@]}"; do
            if ! grep -q "# @load $module" "$config_file" 2>/dev/null; then
                log_error "✗ 缺少模块加载：$module"
                ((ERRORS++))
            else
                echo -e "  ${GREEN}✓${NC} 模块加载：$module"
            fi

            # 检查模块文件是否存在
            local module_path="$PROJECT_ROOT/template/.eket/$module"
            if [ ! -f "$module_path" ]; then
                log_error "✗ 模块文件不存在：$module_path"
                ((ERRORS++))
            else
                echo -e "  ${GREEN}✓${NC} 模块文件存在：$module_path"
            fi
        done
    else
        log_error "✗ 主配置文件不存在：$config_file"
        ((ERRORS++))
    fi
}

# ==========================================
# 关键脚本存在性校验
# ==========================================
validate_critical_scripts() {
    log_section "关键脚本存在性校验"

    local critical_scripts=(
        "validate-config.sh"
        "load-config.sh"
        "heartbeat-monitor.sh"
        "memory-review-agent.sh"
        "test-gate-system.sh"
        "merge-strategy.sh"
        "checkpoint-validator.sh"
        "broadcast-task-reset.sh"
        "log-rotate.sh"
        "concurrency-controller.sh"
        "worktree-cleaner.sh"
        "mock-detector.sh"
        "generate-sprint-report.sh"
        "retrospective-index.sh"
        "prioritize-tasks.sh"
    )

    for script in "${critical_scripts[@]}"; do
        local script_path="$SCRIPT_DIR/$script"
        if [ -f "$script_path" ]; then
            echo -e "  ${GREEN}✓${NC} 脚本存在：$script"
        else
            log_error "✗ 脚本缺失：$script"
            ((ERRORS++))
        fi
    done
}

# ==========================================
# 报告总结
# ==========================================
print_summary() {
    echo ""
    echo "========================================"
    echo "验证总结"
    echo "========================================"
    echo ""

    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ 所有校验通过${NC}"
        return 0
    elif [ $ERRORS -eq 0 ]; then
        echo -e "${GREEN}✓ 无错误${NC} | ${YELLOW}警告：$WARNINGS${NC}"
        return 0
    else
        echo -e "${RED}✗ 错误：$ERRORS${NC} | ${YELLOW}警告：$WARNINGS${NC}"
        echo ""
        echo "请修复以上错误后重新运行验证"
        return 1
    fi
}

# ==========================================
# 主函数
# ==========================================
main() {
    log_info "EKET 全量验证脚本 v0.5.2"
    log_info "项目根目录：$PROJECT_ROOT"
    log_info "修复模式：$FIX_MODE"

    validate_yaml_files
    validate_shell_scripts
    validate_config_structure
    validate_critical_scripts

    print_summary
    exit_code=$?

    # 输出结果到文件
    local report_file="$PROJECT_ROOT/outbox/validation-report-$(date +%Y%m%d_%H%M%S).md"
    mkdir -p "$(dirname "$report_file")"

    cat > "$report_file" << EOF
# EKET 全量验证报告

**验证时间**: $(date -Iseconds)
**验证模式**: $([ "$FIX_MODE" = true ] && echo "修复模式" || echo "只读模式")
**项目根目录**: $PROJECT_ROOT

---

## 验证结果

- **错误数**: $ERRORS
- **警告数**: $WARNINGS
- **状态**: $([ $ERRORS -eq 0 ] && echo "✅ 通过" || echo "❌ 失败")

---

## 验证项目

1. YAML 语法校验
2. Shell 脚本语法校验
3. 配置结构校验
4. 关键脚本存在性校验

---

**生成者**: EKET Validate-All v0.5.2
EOF

    log_info "验证报告已保存：$report_file"

    exit $exit_code
}

main "$@"
