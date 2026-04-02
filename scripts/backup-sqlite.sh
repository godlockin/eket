#!/bin/bash
#
# EKET SQLite 自动备份脚本 v2.0.0
# 用途：每小时自动备份 SQLite 数据库，保留 7 天，压缩存储
#
# 用法：
#   ./scripts/backup-sqlite.sh          - 执行一次备份
#   ./scripts/backup-sqlite.sh restore  - 从最新备份恢复
#   ./scripts/backup-sqlite.sh list     - 列出所有备份
#   ./scripts/backup-sqlite.sh cleanup  - 清理过期备份
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
SQLITE_DATA_DIR="$PROJECT_ROOT/.eket/data/sqlite"
SQLITE_DB="$SQLITE_DATA_DIR/eket.db"
BACKUP_DIR="$PROJECT_ROOT/.eket/data/backups/sqlite"
RETENTION_DAYS=7
MAX_BACKUPS=168  # 7 天 * 24 小时

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -Iseconds)
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} [$timestamp] $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} [$timestamp] $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} [$timestamp] $message" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} [$timestamp] $message" ;;
    esac
}

# 确保备份目录存在
ensure_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    log INFO "备份目录：$BACKUP_DIR"
}

# 生成备份文件名
generate_backup_filename() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    echo "eket_backup_${timestamp}.db.gz"
}

# 计算校验和
calculate_checksum() {
    local file="$1"
    if command -v shasum &>/dev/null; then
        shasum -a 256 "$file" | awk '{print $1}'
    elif command -v sha256sum &>/dev/null; then
        sha256sum "$file" | awk '{print $1}'
    else
        md5sum "$file" | awk '{print $1}'
    fi
}

# 执行备份
do_backup() {
    log INFO "开始备份 SQLite 数据库..."

    # 检查数据库文件是否存在
    if [ ! -f "$SQLITE_DB" ]; then
        log ERROR "数据库文件不存在：$SQLITE_DB"
        return 1
    fi

    ensure_backup_dir

    local backup_file="$(generate_backup_filename)"
    local backup_path="$BACKUP_DIR/$backup_file"
    local checksum_file="$BACKUP_DIR/${backup_file}.sha256"

    # 使用 SQLite 备份模式（避免锁定问题）
    local temp_backup="$BACKUP_DIR/temp_backup.db"

    if command -v sqlite3 &>/dev/null; then
        # 使用 SQLite 在线备份
        sqlite3 "$SQLITE_DB" ".backup '$temp_backup'"
        log INFO "SQLite 在线备份完成"
    else
        # 直接复制文件
        cp "$SQLITE_DB" "$temp_backup"
        log INFO "文件复制备份完成"
    fi

    # 压缩备份
    if command -v gzip &>/dev/null; then
        gzip -9 "$temp_backup"
        mv "$temp_backup.gz" "$backup_path"
        log INFO "压缩完成：$backup_path"
    else
        mv "$temp_backup" "$backup_path"
        log WARN "gzip 不可用，使用未压缩备份"
    fi

    # 计算并保存校验和
    local checksum=$(calculate_checksum "$backup_path")
    echo "$checksum  $backup_file" > "$checksum_file"
    log INFO "校验和：$checksum"

    # 验证备份完整性
    if gzip -t "$backup_path" 2>/dev/null; then
        log INFO "备份完整性验证通过"
    else
        log ERROR "备份文件损坏：$backup_path"
        return 1
    fi

    # 获取备份大小
    local backup_size=$(du -h "$backup_path" | cut -f1)
    log INFO "备份大小：$backup_size"

    # 清理过期备份
    cleanup_expired

    log INFO "备份成功：$backup_path"
    return 0
}

# 清理过期备份
cleanup_expired() {
    log INFO "清理过期备份（保留 ${RETENTION_DAYS} 天）..."

    local cleaned=0

    # 删除超过保留天数的备份
    find "$BACKUP_DIR" -name "eket_backup_*.db.gz" -type f -mtime +${RETENTION_DAYS} | while read -r file; do
        rm -f "$file"
        rm -f "${file}.sha256"
        log INFO "删除过期备份：$(basename "$file")"
        ((cleaned++)) || true
    done

    # 保留最近的 N 个备份
    local backup_count=$(ls -1 "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | wc -l | tr -d ' ')

    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        local to_delete=$((backup_count - MAX_BACKUPS))
        log INFO "备份数量超限，删除最早的 $to_delete 个备份"

        ls -1t "$BACKUP_DIR"/eket_backup_*.db.gz | tail -n "$to_delete" | while read -r file; do
            rm -f "$file"
            rm -f "${file}.sha256"
            log INFO "删除冗余备份：$(basename "$file")"
        done
    fi

    log INFO "清理完成"
}

# 列出所有备份
list_backups() {
    echo "========================================"
    echo "EKET SQLite 备份列表"
    echo "========================================"
    echo ""

    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "暂无备份"
        return 0
    fi

    local count=0
    ls -1lt "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | head -20 | while read -r file; do
        if [ -f "$file" ]; then
            local size=$(du -h "$file" | cut -f1)
            local date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1)
            local checksum_file="${file}.sha256"
            local verified="未知"

            if [ -f "$checksum_file" ]; then
                local stored_checksum=$(awk '{print $1}' "$checksum_file")
                local current_checksum=$(calculate_checksum "$file")
                if [ "$stored_checksum" = "$current_checksum" ]; then
                    verified="✓ 已验证"
                else
                    verified="✗ 校验失败"
                fi
            fi

            echo "  $(basename "$file")"
            echo "    大小：$size  日期：$date  $verified"
            ((count++)) || true
        fi
    done

    echo ""
    local total=$(ls -1 "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | wc -l | tr -d ' ')
    echo "总计：$total 个备份（显示最近 20 个）"
}

# 从备份恢复
do_restore() {
    local backup_file="$1"

    if [ ! -d "$BACKUP_DIR" ]; then
        log ERROR "备份目录不存在：$BACKUP_DIR"
        return 1
    fi

    # 如果没有指定备份文件，使用最新的备份
    if [ -z "$backup_file" ]; then
        backup_file=$(ls -1t "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | head -1)
        if [ -z "$backup_file" ]; then
            log ERROR "未找到任何备份"
            return 1
        fi
        log INFO "使用最新备份：$backup_file"
    elif [ ! -f "$backup_file" ]; then
        # 尝试在备份目录中查找
        if [ -f "$BACKUP_DIR/$backup_file" ]; then
            backup_file="$BACKUP_DIR/$backup_file"
        else
            log ERROR "备份文件不存在：$backup_file"
            return 1
        fi
    fi

    # 验证校验和
    local checksum_file="${backup_file}.sha256"
    if [ -f "$checksum_file" ]; then
        log INFO "验证备份完整性..."
        local stored_checksum=$(awk '{print $1}' "$checksum_file")
        local current_checksum=$(calculate_checksum "$backup_file")

        if [ "$stored_checksum" != "$current_checksum" ]; then
            log ERROR "校验和不匹配，备份文件可能已损坏"
            return 1
        fi
        log INFO "校验和验证通过"
    fi

    # 备份当前数据库（以防恢复失败）
    if [ -f "$SQLITE_DB" ]; then
        local emergency_backup="$SQLITE_DATA_DIR/eket.db.emergency_$(date +%Y%m%d_%H%M%S)"
        cp "$SQLITE_DB" "$emergency_backup"
        log INFO "已创建紧急备份：$emergency_backup"
    fi

    # 解压并恢复
    log INFO "开始恢复数据库..."

    local temp_restore="$SQLITE_DATA_DIR/temp_restore.db"

    if gunzip -c "$backup_file" > "$temp_restore" 2>/dev/null; then
        mv "$temp_restore" "$SQLITE_DB"
        log INFO "数据库恢复成功"

        # 验证恢复的数据库
        if command -v sqlite3 &>/dev/null; then
            if sqlite3 "$SQLITE_DB" "SELECT 1;" &>/dev/null; then
                log INFO "数据库完整性验证通过"
            else
                log WARN "数据库完整性验证失败，回滚到紧急备份"
                mv "$emergency_backup" "$SQLITE_DB"
                return 1
            fi
        fi
    else
        log ERROR "恢复失败"
        return 1
    fi

    return 0
}

# 显示备份统计
show_stats() {
    echo "========================================"
    echo "EKET SQLite 备份统计"
    echo "========================================"
    echo ""

    if [ ! -d "$BACKUP_DIR" ]; then
        echo "备份目录不存在"
        return 0
    fi

    local total_backups=$(ls -1 "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | wc -l | tr -d ' ')
    local total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    local oldest_backup=$(ls -1t "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | tail -1 | xargs -I {} basename {})
    local newest_backup=$(ls -1t "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | head -1 | xargs -I {} basename {})

    echo "备份目录：$BACKUP_DIR"
    echo "总备份数：$total_backups"
    echo "总大小：$total_size"
    echo "最早备份：$oldest_backup"
    echo "最新备份：$newest_backup"
    echo "保留策略：${RETENTION_DAYS} 天 / 最多 ${MAX_BACKUPS} 个"
}

# 主函数
main() {
    case "${1:-backup}" in
        backup|b)
            do_backup
            ;;
        restore|r)
            do_restore "$2"
            ;;
        list|l)
            list_backups
            ;;
        cleanup|c)
            cleanup_expired
            ;;
        stats|s)
            show_stats
            ;;
        verify|v)
            if [ -z "$2" ]; then
                log ERROR "请指定要验证的备份文件"
                exit 1
            fi
            local file="$2"
            [ ! -f "$file" ] && file="$BACKUP_DIR/$file"
            [ ! -f "$file" ] && { log ERROR "文件不存在：$file"; exit 1; }

            local checksum_file="${file}.sha256"
            if [ -f "$checksum_file" ]; then
                local stored=$(awk '{print $1}' "$checksum_file")
                local current=$(calculate_checksum "$file")
                if [ "$stored" = "$current" ]; then
                    log INFO "校验和验证通过"
                else
                    log ERROR "校验和不匹配"
                    exit 1
                fi
            else
                log WARN "校验和文件不存在，跳过验证"
            fi

            if gzip -t "$file" 2>/dev/null; then
                log INFO "压缩完整性验证通过"
            else
                log ERROR "压缩文件损坏"
                exit 1
            fi
            ;;
        --help|-h)
            echo "用法：$0 {backup|restore|list|cleanup|stats|verify}"
            echo ""
            echo "命令:"
            echo "  backup [file]      - 执行备份（默认命令）"
            echo "  restore [file]     - 从备份恢复（默认使用最新备份）"
            echo "  list               - 列出所有备份"
            echo "  cleanup            - 清理过期备份"
            echo "  stats              - 显示备份统计"
            echo "  verify <file>      - 验证备份完整性"
            echo ""
            echo "示例:"
            echo "  $0                              # 执行备份"
            echo "  $0 restore                      # 从最新备份恢复"
            echo "  $0 restore eket_backup_20260402_120000.db.gz"
            echo "  $0 list                         # 列出备份"
            echo ""
            echo "配置:"
            echo "  保留天数：${RETENTION_DAYS} 天"
            echo "  最大备份数：${MAX_BACKUPS}"
            echo "  备份目录：$BACKUP_DIR"
            ;;
        *)
            echo "用法：$0 {backup|restore|list|cleanup|stats|verify}"
            echo "使用 --help 查看详细信息"
            exit 1
            ;;
    esac
}

main "$@"
