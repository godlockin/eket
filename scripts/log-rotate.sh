#!/bin/bash
#
# EKET 日志轮转脚本 v0.5.1
# 用途：轮转日志文件，压缩旧日志，删除过期日志
#
# 用法：
#   ./scripts/log-rotate.sh [--dry-run]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN=false

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_dry() {
    echo -e "${BLUE}[DRY-RUN]${NC} $1"
}

# 加载配置
load_config() {
    local config_file="$CONFIG_DIR/memory_log.yml"

    if [ -f "$config_file" ]; then
        MAX_FILES=$(grep "max_files:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "10")
        COMPRESS_AFTER_DAYS=$(grep "compress_after_days:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "7")
        DELETE_AFTER_DAYS=$(grep "delete_after_days:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "30")
        MAX_FILE_SIZE_MB=$(grep "max_file_size_mb:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "10")
    else
        # 默认值
        MAX_FILES=10
        COMPRESS_AFTER_DAYS=7
        DELETE_AFTER_DAYS=30
        MAX_FILE_SIZE_MB=10
    fi

    log_info "配置加载完成:"
    log_info "  - 最大保留文件数：$MAX_FILES"
    log_info "  - 压缩天数：$COMPRESS_AFTER_DAYS 天"
    log_info "  - 删除天数：$DELETE_AFTER_DAYS 天"
    log_info "  - 最大文件大小：${MAX_FILE_SIZE_MB}MB"
}

# 检查日志目录
check_logs_dir() {
    if [ ! -d "$LOGS_DIR" ]; then
        log_warn "日志目录不存在：$LOGS_DIR"
        return 1
    fi
    return 0
}

# 删除过期日志
delete_old_logs() {
    log_info "删除 ${DELETE_AFTER_DAYS} 天前的日志..."

    local count=0

    # 删除过期的 .gz 文件
    while IFS= read -r -d '' file; do
        if [ "$DRY_RUN" = true ]; then
            log_dry "将删除：$file"
        else
            rm -f "$file"
            log_info "已删除：$file"
        fi
        ((count++))
    done < <(find "$LOGS_DIR" -name "*.gz" -type f -mtime +$DELETE_AFTER_DAYS -print0 2>/dev/null)

    # 删除过期的 .log 文件
    while IFS= read -r -d '' file; do
        if [ "$DRY_RUN" = true ]; then
            log_dry "将删除：$file"
        else
            rm -f "$file"
            log_info "已删除：$file"
        fi
        ((count++))
    done < <(find "$LOGS_DIR" -name "*.log" -type f -mtime +$DELETE_AFTER_DAYS -print0 2>/dev/null)

    log_info "已删除 $count 个过期日志文件"
}

# 压缩旧日志
compress_old_logs() {
    log_info "压缩 ${COMPRESS_AFTER_DAYS} 天前的日志..."

    local count=0

    while IFS= read -r -d '' file; do
        if [ "$DRY_RUN" = true ]; then
            log_dry "将压缩：$file"
        else
            if command -v gzip &> /dev/null; then
                gzip "$file"
                log_info "已压缩：$file"
            else
                log_warn "gzip 未安装，跳过压缩：$file"
            fi
        fi
        ((count++))
    done < <(find "$LOGS_DIR" -name "*.log" -type f -mtime +$COMPRESS_AFTER_DAYS -print0 2>/dev/null)

    log_info "已压缩 $count 个日志文件"
}

# 限制文件数量
limit_file_count() {
    log_info "限制日志文件数量为 $MAX_FILES..."

    # 获取所有.log 和.gz 文件，按修改时间排序
    local files=()
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$LOGS_DIR" \( -name "*.log" -o -name "*.gz" \) -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | tr '\n' '\0')

    local total=${#files[@]}
    local to_delete=$((total - MAX_FILES))

    if [ $to_delete -gt 0 ]; then
        log_info "需要删除 $to_delete 个文件以限制数量"

        for ((i=MAX_FILES; i<total; i++)); do
            local file="${files[$i]}"
            if [ "$DRY_RUN" = true ]; then
                log_dry "将删除：$file"
            else
                rm -f "$file"
                log_info "已删除：$file"
            fi
        done
    else
        log_info "文件数量未超限 ($total <= $MAX_FILES)"
    fi
}

# 限制单个文件大小
limit_file_size() {
    log_info "检查文件大小限制 (${MAX_FILE_SIZE_MB}MB)..."

    local count=0
    local max_size_bytes=$((MAX_FILE_SIZE_MB * 1024 * 1024))

    while IFS= read -r -d '' file; do
        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")

        if [ "$size" -gt "$max_size_bytes" ]; then
            local size_mb=$((size / 1024 / 1024))
            log_warn "文件超出大小限制：$file (${size_mb}MB > ${MAX_FILE_SIZE_MB}MB)"

            if [ "$DRY_RUN" = true ]; then
                log_dry "将分割或截断：$file"
            else
                # 分割大文件
                if command -v split &> /dev/null; then
                    local base=$(basename "$file")
                    local dir=$(dirname "$file")
                    split -b "${MAX_FILE_SIZE_MB}M" "$file" "${dir}/${base}."
                    rm -f "$file"
                    log_info "已分割大文件：$file"
                else
                    log_warn "split 未安装，跳过：$file"
                fi
            fi
            ((count++))
        fi
    done < <(find "$LOGS_DIR" -name "*.log" -type f -print0 2>/dev/null)

    log_info "已处理 $count 个超大文件"
}

# 生成报告
generate_report() {
    local report_file="$LOGS_DIR/rotation-report-$(date +%Y%m%d_%H%M%S).txt"

    cat > "$report_file" << EOF
日志轮转报告
==============

时间：$(date -Iseconds)
配置:
  - 最大保留文件数：$MAX_FILES
  - 压缩天数：$COMPRESS_AFTER_DAYS 天
  - 删除天数：$DELETE_AFTER_DAYS 天
  - 最大文件大小：${MAX_FILE_SIZE_MB}MB

当前日志文件:
$(ls -la "$LOGS_DIR" 2>/dev/null || echo "无日志文件")

磁盘使用:
$(du -sh "$LOGS_DIR" 2>/dev/null || echo "无法计算")
EOF

    log_info "报告已生成：$report_file"
}

# 主函数
main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    log_info "开始日志轮转..."

    # 加载配置
    load_config

    # 检查日志目录
    if ! check_logs_dir; then
        log_warn "创建日志目录..."
        mkdir -p "$LOGS_DIR"
    fi

    # 执行轮转
    delete_old_logs
    compress_old_logs
    limit_file_count
    limit_file_size

    # 生成报告
    generate_report

    log_info "日志轮转完成"
}

main "$@"
