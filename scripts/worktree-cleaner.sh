#!/bin/bash
#
# EKET Worktree 清理脚本 v0.5.1
# 用途：清理过期和已合并的 worktree
#
# 用法：
#   ./scripts/worktree-cleaner.sh [--dry-run] [--force]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_DIR="$PROJECT_ROOT/.eket/worktrees"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN=false
FORCE=false

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
    local config_file="$CONFIG_DIR/git.yml"

    if [ -f "$config_file" ]; then
        AUTO_CLEANUP_DAYS=$(grep "auto_cleanup_days:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "7")
        KEEP_LAST_N=$(grep "keep_last_n:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "5")
    else
        # 默认值
        AUTO_CLEANUP_DAYS=7
        KEEP_LAST_N=5
    fi

    log_info "配置加载完成:"
    log_info "  - 自动清理天数：$AUTO_CLEANUP_DAYS 天"
    log_info "  - 保留最近数量：$KEEP_LAST_N"
}

# 检查 worktree 目录
check_worktree_dir() {
    if [ ! -d "$WORKTREE_DIR" ]; then
        log_warn "Worktree 目录不存在：$WORKTREE_DIR"
        return 1
    fi
    return 0
}

# 获取 worktree 列表
get_worktree_list() {
    local worktrees=()

    if [ -d "$WORKTREE_DIR" ]; then
        for wt in "$WORKTREE_DIR"/*/; do
            if [ -d "$wt" ]; then
                worktrees+=("$wt")
            fi
        done
    fi

    printf '%s\n' "${worktrees[@]}"
}

# 获取 worktree 最后修改时间
get_worktree_mtime() {
    local wt="$1"
    stat -f%m "$wt" 2>/dev/null || stat -c%Y "$wt" 2>/dev/null || echo "0"
}

# 检查 worktree 是否关联已合并的分支
is_branch_merged() {
    local wt="$1"
    local wt_name=$(basename "$wt")

    # 提取分支名
    local branch_name="feature/${wt_name}"

    # 检查分支是否存在
    if ! git branch --list "$branch_name" | grep -q "$branch_name"; then
        return 1
    fi

    # 检查是否已合并到 main
    if git branch --merged main | grep -q "$branch_name"; then
        return 0
    fi

    # 检查是否已合并到 testing
    if git branch --merged testing | grep -q "$branch_name"; then
        return 0
    fi

    return 1
}

# 检查 worktree 是否干净
is_worktree_clean() {
    local wt="$1"

    if [ -d "$wt" ]; then
        cd "$wt"
        if git diff-index --quiet HEAD -- 2>/dev/null; then
            cd - > /dev/null
            return 0
        fi
        cd - > /dev/null
    fi

    return 1
}

# 删除 worktree
delete_worktree() {
    local wt="$1"
    local reason="$2"

    if [ "$DRY_RUN" = true ]; then
        log_dry "将删除 worktree: $(basename $wt) (原因：$reason)"
        return 0
    fi

    local wt_name=$(basename "$wt")
    local branch_name="feature/${wt_name}"

    # 检查工作树是否干净
    if ! is_worktree_clean "$wt"; then
        if [ "$FORCE" = true ]; then
            log_warn "Worktree 有未提交更改，强制删除：$wt_name"
        else
            log_warn "Worktree 有未提交更改，跳过：$wt_name"
            return 1
        fi
    fi

    # 删除分支
    if git branch --list "$branch_name" | grep -q "$branch_name"; then
        git branch -d "$branch_name" 2>/dev/null || {
            log_warn "无法删除分支 $branch_name，可能未合并"
            git branch -D "$branch_name" 2>/dev/null || true
        }
    fi

    # 删除 worktree 目录
    rm -rf "$wt"
    log_info "已删除 worktree: $wt_name (原因：$reason)"

    return 0
}

# 清理已合并的 worktree
cleanup_merged_worktrees() {
    log_info "清理已合并的 worktree..."

    local count=0

    for wt in $(get_worktree_list); do
        if [ -d "$wt" ]; then
            if is_branch_merged "$wt"; then
                delete_worktree "$wt" "分支已合并"
                ((count++))
            fi
        fi
    done

    log_info "已清理 $count 个已合并的 worktree"
}

# 清理过期的 worktree
cleanup_old_worktrees() {
    log_info "清理 ${AUTO_CLEANUP_DAYS} 天前的 worktree..."

    local count=0
    local now=$(date +%s)
    local threshold=$((AUTO_CLEANUP_DAYS * 24 * 60 * 60))

    # 获取 worktree 列表，按时间排序
    local worktrees=()
    while IFS= read -r line; do
        worktrees+=("$line")
    done < <(get_worktree_list)

    # 排序（最新的在前）
    local sorted_worktrees=()
    for wt in "${worktrees[@]}"; do
        local mtime=$(get_worktree_mtime "$wt")
        sorted_worktrees+=("$mtime:$wt")
    done
    IFS=$'\n' sorted_worktrees=($(sort -rn <<<"${sorted_worktrees[*]}"))
    unset IFS

    # 保留最近的 N 个
    local kept=0

    for item in "${sorted_worktrees[@]}"; do
        local mtime="${item%%:*}"
        local wt="${item#*:}"

        if [ $kept -lt $KEEP_LAST_N ]; then
            ((kept++))
            continue
        fi

        local age=$((now - mtime))

        if [ $age -gt $threshold ]; then
            delete_worktree "$wt" "超过 ${AUTO_CLEANUP_DAYS} 天"
            ((count++))
        fi
    done

    log_info "已清理 $count 个过期的 worktree (保留最近 $kept 个)"
}

# 清理孤立的 worktree
cleanup_orphan_worktrees() {
    log_info "清理孤立的 worktree..."

    local count=0

    for wt in $(get_worktree_list); do
        if [ -d "$wt" ]; then
            # 检查 worktree 是否在 git 中注册
            if ! git worktree list | grep -q "$(basename "$wt")"; then
                delete_worktree "$wt" "孤立 worktree"
                ((count++))
            fi
        fi
    done

    log_info "已清理 $count 个孤立的 worktree"
}

# 修剪 git worktree
prune_worktrees() {
    log_info "修剪 git worktree..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "将执行：git worktree prune"
    else
        git worktree prune
        log_info "git worktree prune 完成"
    fi
}

# 生成报告
generate_report() {
    local report_file="$WORKTREE_DIR/cleanup-report-$(date +%Y%m%d_%H%M%S).txt"

    cat > "$report_file" << EOF
Worktree 清理报告
==================

时间：$(date -Iseconds)
配置:
  - 自动清理天数：$AUTO_CLEANUP_DAYS 天
  - 保留最近数量：$KEEP_LAST_N

当前 Worktree:
$(git worktree list 2>/dev/null || echo "无 worktree")

磁盘使用:
$(du -sh "$WORKTREE_DIR" 2>/dev/null || echo "无法计算")
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
            --force)
                FORCE=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    log_info "开始 Worktree 清理..."

    # 加载配置
    load_config

    # 检查 worktree 目录
    if ! check_worktree_dir; then
        log_warn "创建 worktree 目录..."
        mkdir -p "$WORKTREE_DIR"
        return 0
    fi

    # 执行清理
    cleanup_merged_worktrees
    cleanup_old_worktrees
    cleanup_orphan_worktrees
    prune_worktrees

    # 生成报告
    generate_report

    log_info "Worktree 清理完成"
}

main "$@"
