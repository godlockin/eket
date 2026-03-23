#!/bin/bash
#
# EKET 心跳监控和告警脚本 v0.5.1
# 用途：监控 Slaver 心跳，检测超时并触发告警和重置
#
# 用法：
#   ./scripts/heartbeat-monitor.sh [--daemon]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$PROJECT_ROOT/.eket/state"
LOGS_DIR="$PROJECT_ROOT/logs"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"

# 确保目录存在
mkdir -p "$STATE_DIR" "$LOGS_DIR"

# 日志文件
LOG_FILE="$LOGS_DIR/heartbeat-monitor.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
    esac
}

# 加载配置
load_config() {
    local config_file="$CONFIG_DIR/monitoring.yml"

    if [ -f "$config_file" ]; then
        # 从配置文件中提取值
        HEARTBEAT_TIMEOUT=$(grep "timeout_seconds:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "300")
        CHECK_INTERVAL=$(grep "check_interval_seconds:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "60")
    else
        # 默认值
        HEARTBEAT_TIMEOUT=300  # 5 分钟
        CHECK_INTERVAL=60      # 1 分钟
    fi

    log INFO "心跳超时阈值：${HEARTBEAT_TIMEOUT}秒"
    log INFO "检查间隔：${CHECK_INTERVAL}秒"
}

# 检查单个 Slaver 心跳
check_slaver_heartbeat() {
    local state_file="$1"
    local slaver_name=$(basename "$state_file" .yml)

    if [ ! -f "$state_file" ]; then
        return 0
    fi

    # 获取最后心跳时间
    local last_heartbeat=$(grep "last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ' || echo "")

    if [ -z "$last_heartbeat" ]; then
        log WARN "Slaver $slaver_name 无心跳记录"
        return 0
    fi

    # 计算经过时间
    local last_ts=$(date -d "$last_heartbeat" +%s 2>/dev/null || echo "0")
    local now_ts=$(date +%s)
    local elapsed=$((now_ts - last_ts))

    log INFO "Slaver $slaver_name 心跳已停止 ${elapsed}秒 (阈值：${HEARTBEAT_TIMEOUT}秒)"

    # 检查是否超时
    if [ "$elapsed" -gt "$HEARTBEAT_TIMEOUT" ]; then
        log ERROR "⚠️ Slaver $slaver_name 心跳超时!"

        # 触发告警
        trigger_alert "slaver_heartbeat_timeout" "$slaver_name" "$elapsed"

        # 重置任务
        reset_slaver_task "$slaver_name" "$state_file"

        return 1
    fi

    return 0
}

# 触发告警
trigger_alert() {
    local alert_type="$1"
    local slaver_name="$2"
    local elapsed="$3"
    local timestamp=$(date -Iseconds)

    # 创建告警文件
    local alert_file="$STATE_DIR/alerts/${alert_type}-${timestamp}.yml"
    mkdir -p "$(dirname "$alert_file")"

    cat > "$alert_file" << EOF
# Slaver 心跳超时告警

alert_type: $alert_type
timestamp: $timestamp
slaver_name: $slaver_name
elapsed_seconds: $elapsed
status: new

actions_required:
  - "检查 Slaver 日志"
  - "确认 Slaver 状态"
  - "必要时重启 Slaver"
EOF

    log WARN "告警已创建：$alert_file"

    # 通知 Master
    notify_master "$alert_type" "$slaver_name"

    # 通知人类 (如果配置了)
    notify_human "$alert_type" "$slaver_name" "$elapsed"
}

# 通知 Master
notify_master() {
    local alert_type="$1"
    local slaver_name="$2"
    local timestamp=$(date -Iseconds)

    local message_file="$PROJECT_ROOT/inbox/human_feedback/slaver-timeout-${slaver_name}.md"

    cat > "$message_file" << EOF
# Slaver 心跳超时告警

**告警类型**: $alert_type
**Slaver**: $slaver_name
**时间**: $timestamp

## 建议行动

1. 检查 Slaver 日志：$LOGS_DIR/${slaver_name}.log
2. 确认 Slaver 是否仍在运行
3. 如需要，重启 Slaver 进程

## 自动操作

- [x] 心跳超时已检测
- [x] 任务重置已触发
- [ ] Slaver 状态已确认
EOF

    log INFO "已通知 Master: $message_file"
}

# 通知人类
notify_human() {
    local alert_type="$1"
    local slaver_name="$2"
    local elapsed="$3"
    local timestamp=$(date -Iseconds)

    local message_file="$PROJECT_ROOT/inbox/human_feedback/slaver-timeout-human-${slaver_name}.md"

    cat > "$message_file" << EOF
# Slaver 心跳超时 - 需要人类介入

**Slaver**: $slaver_name
**超时时间**: ${elapsed}秒
**检测时间**: $timestamp

## 可能的原因

1. Slaver 进程意外终止
2. Slaver 遇到阻塞性问题
3. 系统资源不足

## 建议行动

1. 检查 Slaver 日志
2. 联系 Slaver 操作者 (如有)
3. 考虑重新分配任务
EOF

    log INFO "已通知人类：$message_file"
}

# 重置 Slaver 任务
reset_slaver_task() {
    local slaver_name="$1"
    local state_file="$2"

    log INFO "重置 Slaver $slaver_name 的任务..."

    # 获取当前任务 ID
    local task_id=$(grep "current_task:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

    if [ -n "$task_id" ]; then
        # 更新任务状态
        local ticket_file="$PROJECT_ROOT/jira/tickets/*/$task_id.md"
        if [ -f "$ticket_file" ]; then
            # 使用 sed 更新状态
            sed -i.bak "s/^status:.*$/status: ready/" "$ticket_file"
            sed -i.bak "s/^assigned_to:.*$/assigned_to: null/" "$ticket_file"
            rm -f "$ticket_file.bak"

            log INFO "任务 $task_id 状态已重置为 ready"
        fi

        # 创建任务重置通知
        local reset_file="$PROJECT_ROOT/inbox/human_feedback/task-reset-${task_id}.md"
        cat > "$reset_file" << EOF
# 任务重置通知

**任务**: $task_id
**原因**: Slaver $slaver_name 心跳超时 (${elapsed}秒 > ${HEARTBEAT_TIMEOUT}秒)
**操作**: 状态已重置为 ready，移除归属
**时间**: $(date -Iseconds)

## 后续行动

- [ ] 确认原 Slaver 状态
- [ ] 重新分配任务或等待自动领取
- [ ] 检查是否有未完成的工作
EOF

        log INFO "任务重置通知已创建：$reset_file"
    fi

    # 清理 Slaver 状态
    rm -f "$state_file"
    log INFO "Slaver 状态文件已清理：$state_file"
}

# 检查所有 Slaver 心跳
check_all_heartbeats() {
    log INFO "开始检查 Slaver 心跳..."

    local timeout_count=0

    # 查找所有 Slaver 状态文件
    for state_file in "$STATE_DIR"/slaver-*.yml; do
        if [ -f "$state_file" ]; then
            if ! check_slaver_heartbeat "$state_file"; then
                ((timeout_count++))
            fi
        fi
    done

    if [ $timeout_count -gt 0 ]; then
        log WARN "发现 $timeout_count 个 Slaver 心跳超时"
    else
        log INFO "所有 Slaver 心跳正常"
    fi

    return $timeout_count
}

# 守护模式
run_daemon() {
    log INFO "启动心跳监控守护进程..."
    log INFO "日志文件：$LOG_FILE"

    while true; do
        check_all_heartbeats || true
        sleep "$CHECK_INTERVAL"
    done
}

# 单次检查
run_once() {
    load_config
    check_all_heartbeats
}

# 主函数
main() {
    load_config

    case "${1:-}" in
        --daemon|-d)
            run_daemon
            ;;
        --check)
            run_once
            ;;
        *)
            # 默认单次检查
            run_once
            ;;
    esac
}

main "$@"
