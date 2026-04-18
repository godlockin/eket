#!/usr/bin/env bash
# lib/state/writer.sh — EKET Shell 共享状态写入的唯一入口
#
# ⚠ 所有 scripts/*.sh 对 jira/ / inbox/ / outbox/ / shared/ / .eket/state/
#    的写入必须通过此库，禁止直接 cat > / echo > / yq -i。
#
# CI 扫描违反模式见 tests/protocol-compliance/
# 规范: protocol/ 目录
# Phase: 0 / Task 0.3

[[ "${_EKET_STATE_WRITER_LOADED:-}" == "1" ]] && return 0
_EKET_STATE_WRITER_LOADED=1

set -eo pipefail

# 依赖
_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./preflight.sh
source "${_lib_dir}/preflight.sh"
# shellcheck source=./atomic.sh
source "${_lib_dir}/atomic.sh"
# shellcheck source=./lock.sh
source "${_lib_dir}/lock.sh"
# shellcheck source=./schema.sh
source "${_lib_dir}/schema.sh"
# shellcheck source=./audit.sh
source "${_lib_dir}/audit.sh"

EKET_ROOT="${EKET_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# 协议版本校验 + 外部依赖检查延迟到首次写入（避免 source 阶段失败）
_EKET_STATE_INITED=0
_ensure_state_init() {
  [[ "$_EKET_STATE_INITED" == "1" ]] && return 0
  state_preflight_deps || return 1
  schema_check_protocol_version || return 1
  _EKET_STATE_INITED=1
}

# ═════════════════════════════════════════════════════════════════════════
# Ticket 操作
# ═════════════════════════════════════════════════════════════════════════

# ─── 定位 ticket 文件（与 node locateTicketFile 递归策略一致） ──────────────
_ticket_file() {
  local id="$1"
  local jira_dir="${EKET_ROOT}/jira/tickets"

  # 优先直接查 jira/tickets/<id>.md
  local direct="${jira_dir}/${id}.md"
  [[ -f "$direct" ]] && { echo "$direct"; return 0; }

  # 递归查所有子目录（与 Node locateTicketFile 对齐）
  local hit
  hit=$(find "$jira_dir" -type f -name "${id}.md" 2>/dev/null | head -n1)
  [[ -n "$hit" ]] && { echo "$hit"; return 0; }

  echo "ticket not found: $id" >&2
  return 1
}

# ─── 读 ticket 字段（从 Markdown 元数据块） ──────────────────────────────
# 用法: state_read_ticket <id> <field>
# 字段示例: status / priority / importance / assignee / branch
state_read_ticket() {
  local id="$1"
  local field="$2"

  schema_validate_ticket_id "$id" || return 1

  local file
  file=$(_ticket_file "$id") || return 1

  # Markdown 元数据格式: "**<Field>**: <value>"
  # NOTE: BSD sed（macOS）不识别 `\s`，改用 POSIX 字符类 `[[:space:]]`。
  grep -m1 -iE "^\*\*${field}\*\*:[[:space:]]*" "$file" \
    | sed -E 's/^\*\*[^*]+\*\*:[[:space:]]*//' \
    | tr -d '\r'
}

# ─── 可写字段白名单（与 Node WRITABLE_TICKET_FIELDS 必须完全一致） ───────────
# 规范: protocol/conventions/ticket-format.md 《可写字段白名单》
# 修改时必须同步更新:
#   1. protocol/conventions/ticket-format.md 表格
#   2. node/src/core/state/writer.ts 的 WRITABLE_TICKET_FIELDS
_WRITABLE_TICKET_FIELDS=(
  title
  status
  priority
  importance
  epic
  assignee
  branch
  updated_at
  estimated_hours
  actual_hours
  tags
)

_is_writable_ticket_field() {
  local f="$1"
  local w
  for w in "${_WRITABLE_TICKET_FIELDS[@]}"; do
    [[ "$f" == "$w" ]] && return 0
  done
  return 1
}

# ─── 写 ticket 字段 ──────────────────────────────────────────────────────
# 用法: state_write_ticket <id> <field> <value>
state_write_ticket() {
  local id="$1"
  local field="$2"
  local value="$3"
  local actor="${EKET_NODE_ID:-unknown}"

  _ensure_state_init || return 1
  schema_validate_ticket_id "$id" || return 1

  # 白名单检查（与 Node 等价）
  if ! _is_writable_ticket_field "$field"; then
    echo "write_ticket: field not writable: $field" >&2
    return 1
  fi

  # 特殊字段走专用校验
  case "$field" in
    status)     schema_validate_ticket_status "$value" || return 1 ;;
    priority)   schema_validate_priority "$value" || return 1 ;;
    importance) schema_validate_importance "$value" || return 1 ;;
  esac

  local file
  file=$(_ticket_file "$id") || return 1

  state_with_lock "ticket:${id}" _do_write_ticket "$file" "$field" "$value" "$actor" "$id"
}

_do_write_ticket() {
  local file="$1"
  local field="$2"
  local value="$3"
  local actor="$4"
  local id="$5"

  # 使用 awk 把 snake_case 转 Title Case（BSD/GNU 兼容，不依赖 sed \U \b）
  local field_cap
  field_cap=$(awk -v s="$field" 'BEGIN{
    n=split(s,a,"_");
    for(i=1;i<=n;i++) a[i]=toupper(substr(a[i],1,1)) substr(a[i],2);
    r=a[1]; for(i=2;i<=n;i++) r=r" "a[i];
    print r
  }')

  local tmp="${file}.tmp.$$.${RANDOM}"
  # P0-7: awk -v 会解释 `\n`/`\t`/`\\` 等反斜杠转义序列，值中含 `\` 或换行会损坏输出。
  # 改走 ENVIRON：awk 不对 ENVIRON 值做任何解释，字节直传安全。
  # 仅在元数据块内替换：碰到首个 "## " 标题后不再替换，避免正文同名字段被误改
  if ! EKET_AWK_VALUE="$value" awk -v f="$field_cap" '
    BEGIN { replaced = 0; in_body = 0; v = ENVIRON["EKET_AWK_VALUE"] }
    /^## / { in_body = 1 }
    !in_body && /^\*\*[^*]+\*\*:/ && tolower($0) ~ tolower("^\\*\\*" f "\\*\\*:") && !replaced {
      print "**" f "**: " v
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) exit 2 }
  ' "$file" > "$tmp"; then
    rm -f "$tmp"
    echo "write_ticket: field not found in metadata block: $field_cap in $file" >&2
    return 1
  fi

  mv -f "$tmp" "$file"

  state_audit "write_ticket" "$id" "$actor" "${field}=${value}"
}

# ─── 状态转移 ────────────────────────────────────────────────────────────
# 用法: state_transition_ticket <id> <new-status>
state_transition_ticket() {
  local id="$1"
  local new_status="$2"

  local current
  current=$(state_read_ticket "$id" "status" | tr '[:upper:]' '[:lower:]')

  schema_validate_ticket_transition "$current" "$new_status" || return 1

  state_write_ticket "$id" "status" "$new_status"
}

# ═════════════════════════════════════════════════════════════════════════
# Node / Heartbeat 操作
# ═════════════════════════════════════════════════════════════════════════

# ─── 更新心跳 ────────────────────────────────────────────────────────────
# 用法: state_update_heartbeat <role> <instance-id> <status> [current-task]
state_update_heartbeat() {
  local role="$1"
  local instance_id="$2"
  local status="$3"
  local current_task="${4:-}"

  _ensure_state_init || return 1
  schema_validate_heartbeat_status "$status" || return 1

  local file="${EKET_ROOT}/.eket/state/${role}_${instance_id}_heartbeat.yml"
  local ts
  ts=$(date -u +%FT%TZ)

  # current_task 为空时用 YAML null（~），非空时为字符串
  local task_line
  if [[ -z "$current_task" ]]; then
    task_line="current_task: ~"
  else
    task_line="current_task: \"${current_task}\""
  fi

  # hostname 降级：macOS/Linux 自带；空白 Alpine 用 uname -n
  local host_val
  if [[ "${EKET_HAS_HOSTNAME:-1}" == "1" ]] && command -v hostname >/dev/null 2>&1; then
    host_val=$(hostname -s)
  else
    host_val=$(uname -n | cut -d. -f1)
  fi

  local content
  content=$(printf 'instance_id: %s\nrole: %s\nstatus: %s\n%s\ntimestamp: %s\nhost: %s\npid: %s\n' \
    "$instance_id" "$role" "$status" "$task_line" "$ts" "$host_val" "$$")
  # $() 吞末尾 \n，显式补回（与 Node updateHeartbeat 末尾 \n 对齐）
  content="${content}"$'\n'

  state_with_lock "heartbeat:${instance_id}" atomic_write "$file" "$content"
  state_audit "heartbeat" "$instance_id" "$instance_id" "status=${status}"
}

# ═════════════════════════════════════════════════════════════════════════
# Message queue / Review request / Node profile / Project status
# (与 Node writer.ts 对齐；字段顺序、文件位置、audit action 必须完全一致)
# ═════════════════════════════════════════════════════════════════════════

# ─── 入队消息 ───────────────────────────────────────────────────────────
# 用法: state_enqueue_message <to> <type> <payload-json> [priority]
# 返回: 消息 ID (msg_YYYYMMDD_NNN) 写到 stdout
state_enqueue_message() {
  local to="$1"
  local type="$2"
  local payload="$3"
  local priority="${4:-P1}"
  local from="${EKET_NODE_ID:-unknown}"

  _ensure_state_init || return 1

  # P0-8 ID 格式：msg_YYYYMMDD_HHMMSS_NNN（与 Node _genMessageId 对齐）
  local ts_compact
  ts_compact=$(date -u +%Y%m%d_%H%M%S)
  local rnd
  rnd=$(printf '%03d' $(( RANDOM % 900 + 100 )))
  local id="msg_${ts_compact}_${rnd}"
  local ts
  ts=$(date -u +%FT%TZ)

  local dir="${EKET_ROOT}/shared/message_queue/inbox"
  mkdir -p "$dir"
  local file="${dir}/${id}.json"

  # JSON 构建：用 jq --argjson 递归缩进 + 防注入（payload 必须是合法 JSON，否则 jq 报错）
  # 字段顺序: id → timestamp → from → to → type → priority → payload（与 Node writer.ts 对齐）
  local content
  content=$(jq -n --indent 2 \
    --arg id "$id" \
    --arg ts "$ts" \
    --arg from "$from" \
    --arg to "$to" \
    --arg type "$type" \
    --arg priority "$priority" \
    --argjson payload "$payload" \
    '{id:$id, timestamp:$ts, from:$from, to:$to, type:$type, priority:$priority, payload:$payload}') || {
      printf 'state_enqueue_message: invalid payload JSON\n' >&2
      return 1
    }
  # 末尾换行（与 Node JSON.stringify + '\n' 对齐）
  content="${content}"$'\n'

  # 可选 schema 校验（若 schema.sh 提供 schema_validate_message）
  if declare -f schema_validate_message >/dev/null 2>&1; then
    schema_validate_message "$content" || return 1
  fi

  state_with_lock "message:${id}" atomic_write "$file" "$content"
  state_audit "enqueue_message" "$id" "$from" "to=${to} type=${type}"

  echo "$id"
}

# ─── 出队消息 ───────────────────────────────────────────────────────────
# 用法: state_dequeue_message
# 把 shared/message_queue/inbox 中字典序最小的消息原子 mv 到 processing/，
# 并把文件内容输出到 stdout；无消息则 return 1 且 stdout 为空。
state_dequeue_message() {
  _ensure_state_init || return 1

  local inbox="${EKET_ROOT}/shared/message_queue/inbox"
  local processing="${EKET_ROOT}/shared/message_queue/processing"
  [[ -d "$inbox" ]] || return 1
  mkdir -p "$processing"

  local f id src dst
  for f in "$inbox"/msg_*.json; do
    [[ -f "$f" ]] || continue
    id=$(basename "$f" .json)
    src="$f"
    dst="${processing}/${id}.json"

    # 用锁确保同一消息只被一个消费者拿走
    if state_with_lock "message:${id}" _dequeue_claim "$src" "$dst"; then
      local msg_type msg_from
      msg_type=$(grep -o '"type":\s*"[^"]*"' "$dst" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      msg_from=$(grep -o '"from":\s*"[^"]*"' "$dst" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
      state_audit "dequeue_message" "$id" "${EKET_NODE_ID:-unknown}" "type=${msg_type} from=${msg_from}"
      cat "$dst"
      return 0
    fi
  done

  return 1
}

_dequeue_claim() {
  local src="$1" dst="$2"
  [[ -f "$src" ]] || return 1
  mv "$src" "$dst" 2>/dev/null
}

# ─── 提交 PR 审评 ────────────────────────────────────────────────────────
# 用法: state_submit_review_request <ticket-id> <submitter> <branch> <body>
# 输出: 写入的文件路径
state_submit_review_request() {
  local ticket_id="$1"
  local submitter="$2"
  local branch="$3"
  local body="$4"

  _ensure_state_init || return 1
  schema_validate_ticket_id "$ticket_id" || return 1

  local ts
  # ISO8601 UTC 去 : 和 -（与 Node 对齐）
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  local filename="pr-${ticket_id}-${ts}.md"
  local filepath="${EKET_ROOT}/outbox/review_requests/${filename}"

  # 保证末尾换行
  [[ "${body: -1}" == $'\n' ]] || body="${body}"$'\n'

  state_with_lock "review:${ticket_id}" atomic_write "$filepath" "$body"
  state_audit "submit_pr" "$ticket_id" "$submitter" "branch=${branch} file=${filename}"

  echo "$filepath"
}

# ─── 注册节点 ───────────────────────────────────────────────────────────
# 用法: state_register_node <node-id> <role> [specialty]
state_register_node() {
  local node_id="$1"
  local role="$2"
  local specialty="${3:-}"

  _ensure_state_init || return 1

  local filepath="${EKET_ROOT}/.eket/state/nodes/${node_id}.yml"
  mkdir -p "$(dirname "$filepath")"

  # 首次 registered_at 保留
  local registered_at=""
  if [[ -f "$filepath" ]]; then
    registered_at=$(grep -m1 '^registered_at:' "$filepath" | sed 's/^registered_at:\s*//' | tr -d '\r')
  fi
  [[ -z "$registered_at" ]] && registered_at=$(date -u +%FT%TZ)

  # 字段按 key 字典序（与 Node registerNode 对齐，末尾换行用 printf 保留；
  # P0-9: $(cat<<EOF..EOF) 会吞末尾 \n，与 Node 的 `${k}: ${v}\n` 循环拼接不等）
  local content
  if [[ -n "$specialty" ]]; then
    content=$(printf 'node_id: %s\nregistered_at: %s\nrole: %s\nspecialty: %s\n' \
      "$node_id" "$registered_at" "$role" "$specialty")
  else
    content=$(printf 'node_id: %s\nregistered_at: %s\nrole: %s\n' \
      "$node_id" "$registered_at" "$role")
  fi
  # $() 仍会吃末尾 \n，显式补回
  content="${content}"$'\n'

  state_with_lock "node:${node_id}" atomic_write "$filepath" "$content"
  state_audit "register_node" "$node_id" "$node_id" "role=${role}"
}

# ═════════════════════════════════════════════════════════════════════════
# 导出说明
# ═════════════════════════════════════════════════════════════════════════
# 使用此库的脚本:
#   source "$(git rev-parse --show-toplevel)/lib/state/writer.sh"
#
# 需要 export EKET_NODE_ID 以便审计记录操作者。
