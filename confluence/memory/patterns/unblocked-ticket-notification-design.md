---
title: 依赖解除通知设计（unblocked-queue）
task: TASK-244
created_at: 2026-05-04
review_status: accepted
reviewed_at: 2026-05-04T00:00:00Z
review_ticket: TASK-244
---

# 依赖解除通知设计（unblocked-queue）

## 场景/症状

`task:complete` 完成后，被该 ticket 阻塞的下游 ticket 无法即时感知依赖已解除，
只能等 `master:heartbeat` 下次 poll 周期（最长数分钟延迟）才触发分发。
高并发场景下并行化效率严重受损。

## 根因

Master heartbeat 的 DAG ready 判断是被动轮询模型，缺少主动推送机制。

## 解法

### task_complete.rs — Step 9: notify_unblocked_tickets

在 saga 成功后（Step 8 之后）调用 `notify_unblocked_tickets(project_root, completed_id)`：

1. 遍历 `jira/tickets/*.md`，解析 `blocked_by` / `**依赖**` 字段（regex `TASK-\d+`）
2. 若某 ticket 的 blocked_by 含 completed_id，且全部依赖均已 `done`：
   - 写入 `.eket/state/unblocked-queue.json`（幂等追加，按 ticket_id 去重）
   - `eprintln!("[UNBLOCKED] {id} 依赖已解除，可领取")`

**unblocked-queue.json 格式**：
```json
[
  {"ticket_id": "TASK-101", "unblocked_at": "2026-05-04T10:00:00Z", "dispatched": false}
]
```

### master_heartbeat.rs — 优先分发 unblocked-queue

`check_once` 构造优先列表时：
1. 先读 `.eket/state/unblocked-queue.json`，取 `dispatched: false` 条目排最前
2. 再追加 DAG-ready（去重）
3. 分发成功后调用 `mark_unblocked_dispatched(root, ticket_id)` 标记 `dispatched: true`

### 关键实现细节

- **project_root 推导**：heartbeat 持有 `tickets_dir`（= `jira/tickets`），
  `.parent().parent()` 得到 project root，无需额外参数传递
- **regex 依赖**：`regex = { workspace = true }` 加入 eket-cli/Cargo.toml
- **幂等**：append_unblocked_queue 用 HashSet 对 ticket_id 去重，重复运行安全
- **非阻断**：notify_unblocked_tickets 错误只 warn，不影响 complete 流程

## 来源

TASK-244：task:complete 后通知解除阻塞的 ticket
