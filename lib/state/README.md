# lib/state/ — Shell 权威写入层

**状态**: Skeleton — Phase 0 / Task 0.3
**职责**: EKET Shell 引擎对共享 FS 状态的**唯一**写入入口

---

## 核心原则

> **所有 Shell 业务脚本对 `jira/` / `inbox/` / `outbox/` / `shared/` / `.eket/state/` 的写入必须走此库。**

类比：Shell 业务脚本 = 应用代码；`lib/state/` = 标准库。
业务代码 `source` 库函数，不直接操作 FS。

---

## 文件分工

| 文件 | 职责 |
|------|------|
| [`writer.sh`](writer.sh) | 写操作（state_write_* / state_transition_*） |
| [`reader.sh`](reader.sh) | 读操作（state_read_* / state_list_*） |
| [`schema.sh`](schema.sh) | 按 `protocol/schemas/` 校验 |
| [`lock.sh`](lock.sh) | `flock` 封装（见 `protocol/conventions/file-locking.md`） |
| [`atomic.sh`](atomic.sh) | tmp + rename 封装 |
| [`audit.sh`](audit.sh) | 写入审计日志 |

---

## 使用示例

```bash
#!/usr/bin/env bash
# scripts/claim-task.sh
set -euo pipefail
source "$(git rev-parse --show-toplevel)/lib/state/writer.sh"

ticket_id="$1"

# 状态转移（内部做：schema 校验 + 锁 + 原子写 + 审计）
state_transition_ticket "$ticket_id" "in_progress"
state_write_ticket "$ticket_id" "assignee" "$EKET_NODE_ID"
```

---

## 禁止模式（CI 扫描拒合）

```bash
# ❌ 直接覆写
echo "status: done" > jira/tickets/FEAT-001.md

# ❌ 原地修改
sed -i 's/in_progress/done/' jira/tickets/FEAT-001.md

# ❌ yq 原地
yq -i '.status = "done"' jira/tickets/FEAT-001.md

# ✅ 正确
state_transition_ticket "FEAT-001" "done"
```

---

## 函数清单（目标 ≥ 20 个）

### Ticket
- `state_read_ticket <id> <field>`
- `state_write_ticket <id> <field> <value>`
- `state_transition_ticket <id> <new-status>`
- `state_list_tickets [status]`
- `state_search_tickets <query>`

### Node
- `state_register_node <profile-json>`
- `state_unregister_node <node-id>`
- `state_list_nodes [filter]`
- `state_update_heartbeat <node-id> <status>`

### Message
- `state_enqueue_message <to> <type> <payload>`
- `state_dequeue_message <node-id>`
- `state_archive_message <msg-id>`

### Master Election
- `state_claim_master <node-id>`
- `state_release_master <node-id>`
- `state_current_master`

### Inbox/Outbox
- `state_append_human_input <priority> <content>`
- `state_read_human_feedback <task-id>`
- `state_submit_pr <ticket-id> <pr-request-json>`

### Audit
- `state_audit <op> <target> <actor> [details]`
- `state_audit_tail [n]`

---

## 实现状态

| 文件 | 状态 |
|------|------|
| writer.sh | 🟡 Skeleton |
| reader.sh | ⚪ 未开始 |
| schema.sh | 🟡 Skeleton |
| lock.sh | 🟡 Skeleton |
| atomic.sh | 🟡 Skeleton |
| audit.sh | 🟡 Skeleton |

实际函数实现见各 `.sh` 文件内 TODO。
