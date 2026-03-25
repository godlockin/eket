#!/bin/bash
# EKET Memory Review Agent v0.5.1 - 心跳和故障恢复
# 独立进程：监控、压缩、更新、校验记忆内容

# 不使用 set -e，避免在可恢复错误处退出

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置文件
CONFIG_FILE=".eket/config.yml"
MEMORY_DIR=".eket/memory"
LONG_TERM_DIR="$MEMORY_DIR/long_term"
EXTERNAL_DIR="$MEMORY_DIR/docs"
STATE_FILE=".eket/state/memory-review.yml"
STATE_DIR=".eket/state"
LOG_FILE=".eket/logs/memory-review.log"
HEARTBEAT_FILE=".eket/state/memory-agent-heartbeat.yml"
PID_FILE=".eket/state/memory-agent.pid"

# 心跳配置
HEARTBEAT_INTERVAL=60  # 心跳间隔（秒）
HEARTBEAT_TIMEOUT=600  # 超时时间（秒）- 10 分钟
CHECK_INTERVAL=300     # 检查间隔（秒）- 5 分钟

# ==========================================
# 读取配置
# ==========================================

read_config() {
    if [ -f "$CONFIG_FILE" ]; then
        REVIEW_ENABLED=$(grep -A 5 "memory:" "$CONFIG_FILE" | grep -A 3 "review:" | grep "enabled:" | cut -d':' -f2 | tr -d ' ' || echo "true")
        COMPRESSION_THRESHOLD=$(grep -A 5 "memory:" "$CONFIG_FILE" | grep -A 3 "review:" | grep "compression_threshold_items:" | cut -d':' -f2 | tr -d ' ' || echo "100")
        RETENTION_DAYS=$(grep -A 5 "memory:" "$CONFIG_FILE" | grep -A 3 "review:" | grep "retention_days:" | cut -d':' -f2 | tr -d ' ' || echo "30")
        MAX_SIZE_MB=$(grep -A 5 "memory:" "$CONFIG_FILE" | grep -A 3 "review:" | grep "max_size_mb:" | cut -d':' -f2 | tr -d ' ' || echo "100")
    else
        REVIEW_ENABLED="true"
        COMPRESSION_THRESHOLD=100
        RETENTION_DAYS=30
        MAX_SIZE_MB=100
    fi
}

# ==========================================
# 记忆监控
# ==========================================

monitor_memory() {
    echo -e "${BLUE}## 记忆监控${NC}"

    local total_size=0
    local file_count=0
    local oldest_file=""
    local oldest_date=""

    # 计算长期记忆大小
    if [ -d "$LONG_TERM_DIR" ]; then
        total_size=$(du -sm "$LONG_TERM_DIR" 2>/dev/null | cut -f1 || echo "0")
        file_count=$(find "$LONG_TERM_DIR" -type f -name "*.md" 2>/dev/null | wc -l || echo "0")

        # 查找最旧的文件
        oldest_file=$(find "$LONG_TERM_DIR" -type f -name "*.md" -printf '%T+ %p\n' 2>/dev/null | sort | head -1 | cut -d' ' -f2 || echo "")
        if [ -n "$oldest_file" ]; then
            oldest_date=$(stat -f "%Sm" -t "%Y-%m-%d" "$oldest_file" 2>/dev/null || stat -c "%y" "$oldest_file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
        fi
    fi

    # 计算外部记忆大小
    local external_size=0
    if [ -d "$EXTERNAL_DIR" ]; then
        external_size=$(du -sm "$EXTERNAL_DIR" 2>/dev/null | cut -f1 || echo "0")
    fi

    local grand_total=$((total_size + external_size))

    echo "  - 长期记忆：$file_count 个文件，$total_size MB"
    echo "  - 外部记忆：$external_size MB"
    echo "  - 总计：$grand_total MB (限制：$MAX_SIZE_MB MB)"

    # 检查是否需要压缩
    if [ "$file_count" -gt "$COMPRESSION_THRESHOLD" ]; then
        echo -e "${YELLOW}⚠${NC} 记忆文件数量超过阈值，需要压缩"
        trigger_compression
    fi

    # 检查是否超过大小限制
    if [ "$grand_total" -ge "$MAX_SIZE_MB" ]; then
        echo -e "${RED}⚠${NC} 记忆总大小超过限制，需要清理"
        trigger_cleanup
    fi

    # 检查过期文件
    check_expired_memories
}

# ==========================================
# 记忆压缩
# ==========================================

trigger_compression() {
    echo -e "${BLUE}## 触发记忆压缩${NC}"

    # 找到最旧的记忆文件
    local old_files=$(find "$LONG_TERM_DIR" -type f -name "*.md" -mtime +$RETENTION_DAYS 2>/dev/null || true)

    if [ -z "$old_files" ]; then
        echo "  - 无超过 $RETENTION_DAYS 天的文件需要压缩"
        return 0
    fi

    local compression_report="$STATE_DIR/compression-report-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "$STATE_DIR"

    cat > "$compression_report" << EOF
# 记忆压缩报告

**时间**: $(date -Iseconds)
**保留策略**: $RETENTION_DAYS 天
**压缩阈值**: $COMPRESSION_THRESHOLD 个文件

---

## 待压缩的记忆文件

EOF

    local count=0
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            echo "- $(basename "$file")" >> "$compression_report"
            count=$((count + 1))
        fi
    done <<< "$old_files"

    cat >> "$compression_report" << EOF

---

## 建议操作

1. **Review 内容** - 检查是否有过时或冗余信息
2. **合并相关主题** - 将相关文件合并为单一摘要
3. **删除过期内容** - 移除不再适用的记忆
4. **更新索引** - 更新 MEMORY.md 索引文件

---

**状态**: pending_review
**文件数**: $count
EOF

    echo -e "${GREEN}✓${NC} 压缩报告已创建：$compression_report"
    echo "  - 待处理文件数：$count"

    # 触发人类 Review
    trigger_memory_review "$compression_report"
}

# ==========================================
# 记忆清理
# ==========================================

trigger_cleanup() {
    echo -e "${YELLOW}## 触发记忆清理${NC}"

    # 找到最旧的文件进行删除候选
    local candidates=$(find "$LONG_TERM_DIR" -type f -name "*.md" -printf '%T+ %p\n' 2>/dev/null | sort | head -20 || true)

    if [ -z "$candidates" ]; then
        echo "  - 无文件可清理"
        return 0
    fi

    local cleanup_report="$STATE_DIR/cleanup-report-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "$STATE_DIR"

    cat > "$cleanup_report" << EOF
# 记忆清理报告

**时间**: $(date -Iseconds)
**原因**: 记忆总大小超过限制 ($MAX_SIZE_MB MB)
**保留策略**: $RETENTION_DAYS 天

---

## 候选删除文件（按日期排序）

$(echo "$candidates" | awk '{print "- " $2 " (创建于：" $1 ")"}')

---

## 建议操作

1. **优先删除** - 最旧的 5-10 个文件
2. **Review 内容** - 确认无重要信息
3. **备份后删除** - 可选择备份后删除

---

**状态**: requires_human_approval
**候选文件数**: $(echo "$candidates" | wc -l | tr -d ' ')
EOF

    echo -e "${GREEN}✓${NC} 清理报告已创建：$cleanup_report"
    echo "  - 候选文件数：$(echo "$candidates" | wc -l | tr -d ' ')"

    # 触发人类审批
    trigger_human_approval "$cleanup_report"
}

# ==========================================
# 检查过期记忆
# ==========================================

check_expired_memories() {
    echo -e "${BLUE}## 检查过期记忆${NC}"

    local expired_count=0
    local expired_files=""

    if [ -d "$LONG_TERM_DIR" ]; then
        while IFS= read -r file; do
            if [ -n "$file" ]; then
                expired_files="$expired_files\n- $file"
                expired_count=$((expired_count + 1))
            fi
        done < <(find "$LONG_TERM_DIR" -type f -name "*.md" -mtime +$RETENTION_DAYS 2>/dev/null || true)
    fi

    if [ "$expired_count" -gt 0 ]; then
        echo -e "${YELLOW}⚠${NC} 发现 $expired_count 个过期记忆文件"

        # 创建过期通知
        local notification="$STATE_DIR/expired-memories-$(date +%Y%m%d-%H%M%S).md"

        cat > "$notification" << EOF
# 过期记忆通知

**时间**: $(date -Iseconds)
**保留策略**: $RETENTION_DAYS 天

---

## 过期记忆文件 ($expired_count 个)

$(echo -e "$expired_files")

---

## 建议操作

1. **Review 内容** - 确认是否可以删除
2. **压缩合并** - 将相关内容合并
3. **删除确认** - 确认后删除

---

**状态**: pending_review
EOF
    else
        echo -e "${GREEN}✓${NC} 无过期记忆"
    fi
}

# ==========================================
# 记忆校验
# ==========================================

validate_memories() {
    echo -e "${BLUE}## 记忆校验${NC}"

    local issues=()

    # 检查 MEMORY.md 是否存在
    if [ ! -f "$MEMORY_DIR/MEMORY.md" ]; then
        issues+=("MEMORY.md 索引文件不存在")
    fi

    # 检查记忆文件格式
    if [ -d "$LONG_TERM_DIR" ]; then
        for file in "$LONG_TERM_DIR"/*.md; do
            if [ -f "$file" ]; then
                # 检查文件是否有标题
                if ! head -1 "$file" | grep -q "^#"; then
                    issues+=("$(basename "$file"): 缺少标题")
                fi

                # 检查文件是否过大
                local size=$(wc -c < "$file")
                if [ "$size" -gt 20480 ]; then
                    issues+=("$(basename "$file"): 文件过大 ($((size / 1024)) KB)")
                fi
            fi
        done
    fi

    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}⚠${NC} 发现 ${#issues[@]} 个问题:"
        for issue in "${issues[@]}"; do
            echo "  - $issue"
        done

        # 创建校验报告
        create_validation_report "${issues[@]}"
    else
        echo -e "${GREEN}✓${NC} 记忆校验通过"
    fi
}

# ==========================================
# 创建校验报告
# ==========================================

create_validation_report() {
    local report_file="$STATE_DIR/validation-report-$(date +%Y%m%d-%H%M%S).md"

    cat > "$report_file" << EOF
# 记忆校验报告

**时间**: $(date -Iseconds)
**检查范围**: .eket/memory/

---

## 发现的问题

EOF

    for issue in "$@"; do
        echo "- $issue" >> "$report_file"
    done

    cat >> "$report_file" << EOF

---

## 建议修复

1. 为缺少标题的文件添加标题
2. 压缩或拆分过大的文件
3. 创建或更新 MEMORY.md 索引

---

**状态**: requires_attention
EOF

    echo -e "${GREEN}✓${NC} 校验报告已创建：$report_file"
}

# ==========================================
# 触发人类 Review
# ==========================================

trigger_memory_review() {
    local report_file="$1"
    local feedback_file="inbox/human_feedback/memory-review-$(date +%Y%m%d-%H%M%S).md"

    mkdir -p "inbox/human_feedback"

    cat > "$feedback_file" << EOF
# 记忆 Review 请求

**时间**: $(date -Iseconds)
**报告**: $report_file

---

## Memory Review Agent 检测到以下问题

Memory 系统需要定期维护以确保：
1. 信息不过时
2. 文件大小可控
3. 索引完整有效

---

## 请 Review 以下内容

1. 打开报告文件查看详细信息
2. 确认压缩/清理建议
3. 标记可删除的内容

---

**状态**: awaiting_human_input
EOF

    echo -e "${GREEN}✓${NC} Review 请求已创建：$feedback_file"
}

# ==========================================
# 触发人类审批
# ==========================================

trigger_human_approval() {
    local report_file="$1"
    local approval_file="inbox/human_feedback/memory-cleanup-approval-$(date +%Y%m%d-%H%M%S).md"

    mkdir -p "inbox/human_feedback"

    cat > "$approval_file" << EOF
# 记忆清理审批请求

**时间**: $(date -Iseconds)
**报告**: $report_file

---

## Memory Review Agent 检测到记忆空间超过限制

需要删除部分旧记忆文件以释放空间。

---

## 请审批

1. 打开报告查看候选文件列表
2. 标记可以删除的文件
3. 确认后执行清理

---

**状态**: awaiting_approval
EOF

    echo -e "${GREEN}✓${NC} 审批请求已创建：$approval_file"
}

# ==========================================
# 更新记忆索引
# ==========================================

update_memory_index() {
    echo -e "${BLUE}## 更新记忆索引${NC}"

    local index_file="$MEMORY_DIR/MEMORY.md"

    # 创建或更新索引文件
    cat > "$index_file" << EOF
# Memory 索引

最后更新：$(date -Iseconds)

---

## 长期记忆

EOF

    if [ -d "$LONG_TERM_DIR" ]; then
        for file in "$LONG_TERM_DIR"/*.md; do
            if [ -f "$file" ]; then
                local name=$(basename "$file")
                local date=$(stat -f "%Sm" -t "%Y-%m-%d" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
                echo "- [$name]($LONG_TERM_DIR/$name) - 更新于 $date" >> "$index_file"
            fi
        done
    fi

    cat >> "$index_file" << EOF

---

## 外部记忆

EOF

    if [ -d "$EXTERNAL_DIR" ]; then
        find "$EXTERNAL_DIR" -name "*.md" -type f | while read -r file; do
            local name=$(basename "$file")
            local path=${file#$EXTERNAL_DIR/}
            echo "- [$name]($EXTERNAL_DIR/$path)" >> "$index_file"
        done
    fi

    echo -e "${GREEN}✓${NC} 记忆索引已更新：$index_file"
}

# ==========================================
# 日志记录
# ==========================================

log_action() {
    local action="$1"
    local message="$2"
    local timestamp=$(date -Iseconds)

    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$timestamp] $action: $message" >> "$LOG_FILE"
}

# ==========================================
# 心跳机制 (v0.5.1)
# ==========================================

update_heartbeat() {
    local status="${1:-healthy}"
    local last_action="${2:-idle}"
    local issues_found="${3:-0}"
    local timestamp=$(date -Iseconds)

    mkdir -p "$(dirname "$HEARTBEAT_FILE")"

    cat > "$HEARTBEAT_FILE" << EOF
# Memory Review Agent 心跳
# 更新于：$timestamp

status: $status
last_heartbeat: $timestamp
last_action: $last_action
issues_found: $issues_found
pid: $$
uptime: $(uptime -p 2>/dev/null || echo "unknown")
EOF
}

check_heartbeat() {
    if [ ! -f "$HEARTBEAT_FILE" ]; then
        return 1
    fi

    local last_update=$(grep "^last_heartbeat:" "$HEARTBEAT_FILE" 2>/dev/null | cut -d':' -f2- | tr -d ' ')
    if [ -z "$last_update" ]; then
        return 1
    fi

    # 解析时间戳 (兼容不同格式)
    local last_ts
    if command -v date &>/dev/null; then
        last_ts=$(date -d "$last_update" +%s 2>/dev/null || echo "0")
    else
        last_ts=0
    fi

    local now_ts=$(date +%s)
    local elapsed=$((now_ts - last_ts))

    if [ "$elapsed" -gt "$HEARTBEAT_TIMEOUT" ]; then
        log_action "HEARTBEAT_TIMEOUT" "Last heartbeat: ${elapsed}s ago (threshold: ${HEARTBEAT_TIMEOUT}s)"
        return 1
    fi

    return 0
}

# 守护进程模式 - 带心跳 (v0.5.1)
run_daemon() {
    log_info "启动 Memory Review Agent 守护进程 (带心跳监控)..."

    # 检查是否已在运行
    if [ -f "$PID_FILE" ]; then
        local existing_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
            log_warn "Agent 已在运行 (PID: $existing_pid)"
            return 0
        fi
        rm -f "$PID_FILE"
    fi

    # 保存当前 PID
    echo $$ > "$PID_FILE"

    # 后台运行
    (
        while true; do
            # 更新心跳
            update_heartbeat "healthy" "monitoring" "0"

            # 执行监控
            monitor_memory 2>/dev/null || update_heartbeat "error" "monitor_failed" "1"

            # 等待
            sleep "$CHECK_INTERVAL"
        done
    ) &

    disown
    log_info "✓ 守护进程已启动 (PID: $!)"
}

# 故障恢复 (v0.5.1)
recover_from_failure() {
    log_action "RECOVERY" "Attempting to recover from failure..."

    # 检查心跳文件
    if [ -f "$HEARTBEAT_FILE" ]; then
        local last_status=$(grep "^status:" "$HEARTBEAT_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
        if [ "$last_status" = "error" ]; then
            log_action "RECOVERY" "Last status was error, restarting..."
            restart_agent
        fi
    fi

    # 检查进程是否存在
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
            log_action "RECOVERY" "Process dead, restarting..."
            restart_agent
        fi
    fi
}

restart_agent() {
    log_info "重启 Memory Review Agent..."

    # 清理旧进程
    if [ -f "$PID_FILE" ]; then
        local old_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            kill "$old_pid" 2>/dev/null || true
            log_info "已停止旧进程：$old_pid"
        fi
        rm -f "$PID_FILE"
    fi

    # 启动新进程
    run_daemon
}

show_status() {
    echo ""
    echo "=== Memory Review Agent 状态 ==="
    echo ""

    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} 进程运行中 (PID: $pid)"
        else
            echo -e "${YELLOW}⚠${NC} 进程文件存在但进程已停止"
        fi
    else
        echo -e "${YELLOW}○${NC} 进程未运行"
    fi

    if [ -f "$HEARTBEAT_FILE" ]; then
        local last=$(grep "^last_heartbeat:" "$HEARTBEAT_FILE" 2>/dev/null | cut -d':' -f2- | tr -d ' ')
        local status=$(grep "^status:" "$HEARTBEAT_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
        echo "最后心跳：$last"
        echo "状态：$status"

        # 检查心跳是否超时
        if check_heartbeat; then
            echo -e "${GREEN}✓${NC} 心跳正常"
        else
            echo -e "${RED}✗${NC} 心跳超时"
        fi
    else
        echo "心跳文件：不存在"
    fi

    echo ""
}

# ==========================================
# 主循环 - Memory Review Agent (带心跳 v0.5.1)
# ==========================================

memory_review_loop() {
    echo -e "${BLUE}## 启动 Memory Review Agent (带心跳监控)${NC}"

    # 初始心跳
    update_heartbeat "starting" "initializing" "0"

    while true; do
        log_action "CYCLE_START" "Memory Review Agent cycle started"

        # 更新心跳
        update_heartbeat "healthy" "monitoring" "0"

        monitor_memory
        local monitor_status=$?

        update_heartbeat "healthy" "validating" "0"

        validate_memories
        local validate_status=$?

        update_heartbeat "healthy" "indexing" "0"

        update_memory_index

        # 计算问题数
        local issues=0
        [ $monitor_status -ne 0 ] && ((issues++)) || true
        [ $validate_status -ne 0 ] && ((issues++)) || true

        log_action "CYCLE_COMPLETE" "Memory Review Agent cycle completed (issues: $issues)"

        # 更新最终心跳
        update_heartbeat "healthy" "completed" "$issues"

        sleep $CHECK_INTERVAL
    done
}

# ==========================================
# 入口
# ==========================================

read_config

# 创建必要的目录
mkdir -p "$MEMORY_DIR" "$LONG_TERM_DIR" "$EXTERNAL_DIR" "$STATE_DIR"

# 颜色输出函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

case "${1:-}" in
    --daemon|-d)
        run_daemon
        ;;
    --status|-s)
        show_status
        ;;
    --restart|-r)
        restart_agent
        ;;
    --recover)
        recover_from_failure
        ;;
    --stop)
        if [ -f "$PID_FILE" ]; then
            local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
            if [ -n "$pid" ]; then
                kill "$pid" 2>/dev/null || true
                rm -f "$PID_FILE"
                log_info "已停止 Agent"
            fi
        fi
        ;;
    monitor)
        monitor_memory
        ;;
    validate)
        validate_memories
        ;;
    compress)
        trigger_compression
        ;;
    cleanup)
        trigger_cleanup
        ;;
    index)
        update_memory_index
        ;;
    loop)
        memory_review_loop
        ;;
    full)
        monitor_memory
        validate_memories
        update_memory_index
        ;;
    *)
        echo "用法：$0 [--daemon|--status|--restart|--recover|--stop|monitor|validate|compress|cleanup|index|loop|full]"
        echo ""
        echo "选项:"
        echo "  --daemon, -d    后台守护进程模式 (带心跳)"
        echo "  --status, -s    显示运行状态"
        echo "  --restart, -r   重启 Agent"
        echo "  --recover       故障恢复"
        echo "  --stop          停止 Agent"
        echo ""
        echo "命令:"
        echo "  monitor    - 监控记忆状态"
        echo "  validate   - 校验记忆质量"
        echo "  compress   - 触发记忆压缩"
        echo "  cleanup    - 触发记忆清理"
        echo "  index      - 更新记忆索引"
        echo "  loop       - 启动独立监控进程 (带心跳)"
        echo "  full       - 完整检查流程"
        ;;
esac
