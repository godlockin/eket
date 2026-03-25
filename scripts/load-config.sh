#!/bin/bash
#
# EKET 配置加载器 v0.5.1
# 用途：加载模块化配置文件并合并为完整配置
#
# 用法：
#   ./scripts/load-config.sh [config_dir]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${1:-$PROJECT_ROOT/.eket/config}"
MAIN_CONFIG="$PROJECT_ROOT/.eket/config.yml"
OUTPUT_FILE="$PROJECT_ROOT/.eket/config.merged.yml"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查配置文件是否存在
check_config_exists() {
    local config_file="$1"
    if [ ! -f "$config_file" ]; then
        log_error "配置文件不存在：$config_file"
        return 1
    fi
    return 0
}

# 从主配置中提取模块列表
extract_module_list() {
    local modules=()
    while IFS= read -r line; do
        if [[ "$line" =~ ^#\ *@load\ *(.*)$ ]]; then
            modules+=("${BASH_REMATCH[1]}")
        fi
    done < "$MAIN_CONFIG"
    echo "${modules[@]}"
}

# 加载并合并配置
merge_configs() {
    local modules=("$@")

    # 创建临时文件
    local temp_file=$(mktemp)

    # 写入文件头
    cat > "$temp_file" << 'EOF'
# EKET 合并配置文件 v0.5.1
# 此文件由 scripts/load-config.sh 自动生成
# 不要手动编辑此文件

EOF

    # 逐个加载模块
    for module in "${modules[@]}"; do
        local module_path="$CONFIG_DIR/$module"
        if check_config_exists "$module_path"; then
            log_info "加载模块：$module"
            echo "" >> "$temp_file"
            echo "# ==================== $module ====================" >> "$temp_file"
            echo "" >> "$temp_file"
            cat "$module_path" >> "$temp_file"
        else
            log_warn "跳过缺失模块：$module"
        fi
    done

    # 移动结果
    mv "$temp_file" "$OUTPUT_FILE"
    log_info "配置合并完成：$OUTPUT_FILE"
}

# 验证 YAML 语法
validate_yaml() {
    if command -v python3 &> /dev/null; then
        python3 -c "import yaml; yaml.safe_load(open('$OUTPUT_FILE'))" 2>/dev/null
        if [ $? -eq 0 ]; then
            log_info "YAML 语法验证通过"
            return 0
        else
            log_error "YAML 语法错误"
            return 1
        fi
    else
        log_warn "Python3 未安装，跳过 YAML 验证"
        return 0
    fi
}

# 主函数
main() {
    log_info "开始加载配置..."

    # 检查主配置
    if ! check_config_exists "$MAIN_CONFIG"; then
        log_error "主配置不存在：$MAIN_CONFIG"
        exit 1
    fi

    # 提取模块列表
    local modules=($(extract_module_list))

    if [ ${#modules[@]} -eq 0 ]; then
        log_warn "未找到模块引用，使用单文件配置"
        return 0
    fi

    log_info "找到 ${#modules[@]} 个模块"

    # 合并配置
    merge_configs "${modules[@]}"

    # 验证 YAML
    validate_yaml

    log_info "配置加载完成"
}

main "$@"
