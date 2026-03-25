#!/bin/bash
#
# EKET 版本号管理脚本
# 用途：统一管理和更新项目中的所有版本号引用
#
# 用法:
#   ./scripts/update-version.sh <new_version>
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
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

# ==========================================
# 获取当前版本
# ==========================================

get_current_version() {
    # 从主版本文件读取
    local version_file="$PROJECT_ROOT/template/.eket/version.yml"
    if [ -f "$version_file" ]; then
        grep "^version:" "$version_file" | cut -d':' -f2 | tr -d ' '
    else
        echo "unknown"
    fi
}

# ==========================================
# 更新版本号
# ==========================================

update_version() {
    local new_version="$1"
    local dry_run="${2:-false}"
    local count=0

    log_info "更新版本号为：$new_version"

    if [ "$dry_run" = "true" ]; then
        log_info "=== 预演模式 (不会实际修改文件) ==="
    fi

    # 定义需要更新的文件模式
    # 格式：文件模式:替换模式
    # 替换模式说明：
    #   - version_header: **版本**: X.X.X → **版本**: <new_version>
    #   - version_comment: # 版本 X.X.X → # 版本 <new_version>
    #   - yaml_version: version: "X.X.X" → version: "<new_version>"

    # 1. 更新 Markdown 文件中的版本头
    log_info "更新 Markdown 文件版本头..."
    while IFS= read -r -d '' file; do
        # 跳过 archive 目录和特定文件
        if [[ "$file" == *"/archive/"* ]] || \
           [[ "$file" == *"CHANGELOG"* ]] || \
           [[ "$file" == *"framework-risk-review"* ]] || \
           [[ "$file" == *"v0.5"* ]] || \
           [[ "$file" == *"IMPLEMENTATION-v0.6.2"* ]] || \
           [[ "$file" == *"PROJECT_REVIEW_REPORT"* ]] || \
           [[ "$file" == *"LARGE_FILES_REVIEW"* ]] || \
           [[ "$file" == *"ARCHIVE_EXPLANATION"* ]] || \
           [[ "$file" == *"v0.6-docker-heartbeat"* ]]; then
            continue
        fi

        # 检查文件是否包含版本头
        if grep -qE "^\*\*版本\*\*:" "$file" 2>/dev/null; then
            if [ "$dry_run" = "true" ]; then
                echo "  [预演] $file"
            else
                # 使用 sed 替换版本头
                sed -i.bak -E 's/^\*\*版本\*\*: [0-9]+\.[0-9]+\.[0-9]+/**版本**: '"$new_version"'/' "$file"
                sed -i.bak -E 's/^\*\*版本\*\*: v[0-9]+\.[0-9]+\.[0-9]+/**版本**: v'"$new_version"'/' "$file"
                rm -f "${file}.bak"
                count=$((count + 1))
                echo "  ✓ $file"
            fi
        fi
    done < <(find "$PROJECT_ROOT" -name "*.md" -type f -print0 2>/dev/null)

    # 2. 更新 YAML 文件中的版本
    log_info "更新 YAML 文件版本..."
    local yaml_files=(
        "$PROJECT_ROOT/template/.eket/version.yml"
        "$PROJECT_ROOT/template/.eket/config.yml"
        "$PROJECT_ROOT/template/.eket/config/advanced.yml"
    )

    for file in "${yaml_files[@]}"; do
        if [ -f "$file" ]; then
            if [ "$dry_run" = "true" ]; then
                echo "  [预演] $file"
            else
                if [[ "$file" == *"version.yml" ]]; then
                    sed -i.bak -E 's/^version: [0-9]+\.[0-9]+\.[0-9]+/version: '"$new_version"'/' "$file"
                    sed -i.bak -E 's/^template_version: [0-9]+\.[0-9]+\.[0-9]+/template_version: '"$new_version"'/' "$file"
                    rm -f "${file}.bak"
                fi
                echo "  ✓ $file"
            fi
        fi
    done

    # 3. 更新 CLAUDE.md 中的版本
    local claude_md="$PROJECT_ROOT/CLAUDE.md"
    if [ -f "$claude_md" ]; then
        if [ "$dry_run" = "true" ]; then
            echo "  [预演] $claude_md"
        else
            sed -i.bak -E 's/^\*\*版本\*\*: [0-9]+\.[0-9]+\.[0-9]+/**版本**: '"$new_version"'/' "$claude_md"
            rm -f "${claude_md}.bak"
            echo "  ✓ $claude_md"
        fi
    fi

    # 4. 更新 template/SYSTEM-SETTINGS.md
    local system_settings="$PROJECT_ROOT/template/SYSTEM-SETTINGS.md"
    if [ -f "$system_settings" ]; then
        if [ "$dry_run" = "true" ]; then
            echo "  [预演] $system_settings"
        else
            sed -i.bak -E 's/^\*\*版本\*\*: [0-9]+\.[0-9]+\.[0-9]+/**版本**: '"$new_version"'/' "$system_settings"
            rm -f "${system_settings}.bak"
            echo "  ✓ $system_settings"
        fi
    fi

    log_info "更新完成！"
    if [ "$dry_run" = "false" ]; then
        log_info "已更新 $count 个文件"
    fi
}

# ==========================================
# 验证版本一致性
# ==========================================

verify_versions() {
    log_info "=== 版本一致性检查 ==="
    echo ""

    local inconsistencies=0
    local main_version=$(get_current_version)
    echo "主版本号 (template/.eket/version.yml): $main_version"
    echo ""

    echo "检查关键文件版本..."
    echo ""

    # 检查 CLAUDE.md
    local claude_version=$(grep -m1 "^\*\*版本\*\*:" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
    echo "CLAUDE.md: $claude_version $([ "$claude_version" = "$main_version" ] && echo "✓" || echo "⚠ 不一致")"
    [ "$claude_version" != "$main_version" ] && inconsistencies=$((inconsistencies + 1))

    # 检查 README.md
    local readme_version=$(grep -m1 "^\*\*版本\*\*:" "$PROJECT_ROOT/README.md" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
    echo "README.md: $readme_version $([ "$readme_version" = "$main_version" ] && echo "✓" || echo "⚠ 不一致")"
    [ "$readme_version" != "$main_version" ] && inconsistencies=$((inconsistencies + 1))

    # 检查 SYSTEM-SETTINGS.md
    local settings_version=$(grep -m1 "^\*\*版本\*\*:" "$PROJECT_ROOT/template/SYSTEM-SETTINGS.md" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
    echo "template/SYSTEM-SETTINGS.md: $settings_version $([ "$settings_version" = "$main_version" ] && echo "✓" || echo "⚠ 不一致")"
    [ "$settings_version" != "$main_version" ] && inconsistencies=$((inconsistencies + 1))

    echo ""
    if [ $inconsistencies -gt 0 ]; then
        log_warn "发现 $inconsistencies 个文件版本不一致"
        log_info "运行以下命令修复："
        echo "  ./scripts/update-version.sh $main_version"
    else
        log_info "所有文件版本一致 ✓"
    fi

    return $inconsistencies
}

# ==========================================
# 显示帮助
# ==========================================

show_help() {
    echo "用法：$0 <command> [options]"
    echo ""
    echo "命令:"
    echo "  current         显示当前版本"
    echo "  update <ver>    更新版本号为 <ver>"
    echo "  verify          验证版本一致性"
    echo "  preview <ver>   预演更新 (不实际修改文件)"
    echo ""
    echo "示例:"
    echo "  $0 current                    # 显示当前版本"
    echo "  $0 update 0.6.3              # 更新到 0.6.3"
    echo "  $0 verify                     # 验证版本一致性"
    echo "  $0 preview 0.6.3             # 预演更新到 0.6.3"
    echo ""
}

# ==========================================
# 主函数
# ==========================================

main() {
    case "${1:-help}" in
        current)
            get_current_version
            ;;
        update)
            if [ -z "$2" ]; then
                log_error "请指定新版本号"
                show_help
                exit 1
            fi
            update_version "$2" "false"
            ;;
        verify)
            verify_versions
            ;;
        preview)
            if [ -z "$2" ]; then
                log_error "请指定新版本号"
                show_help
                exit 1
            fi
            update_version "$2" "true"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令：$1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
