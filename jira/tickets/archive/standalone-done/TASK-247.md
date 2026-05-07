# TASK-247: 无匹配 Slaver 时的等待队列与 inbox 召唤提示

**状态**: done
**优先级**: P1
**预估工时**: 240min
**负责人**: —
**创建时间**: 2026-05-04
**所需专家**: rust
**依赖**: TASK-246
**阻塞**: TASK-248

---

## 背景

TASK-246 让 heartbeat 在无匹配 slaver 时 skip ticket。但 skip 是沉默的——Master 不知道缺哪种专家，ticket 无限期卡在 ready。需要：① 写等待队列供下次 heartbeat 优先重试；② 向 inbox 输出召唤提示，让 Master/人类知道要注册什么角色的 slaver。

## 需求

无匹配时：写 `.eket/state/waiting-for-expert.json`，同时在 `.eket/inbox/` 写召唤建议文件。

## 验收标准

- [ ] 无匹配 slaver 时写/追加 `.eket/state/waiting-for-expert.json`：
  ```json
  [{"ticket_id":"TASK-X","required":["rust"],"since":"2026-05-04T10:00:00Z","retries":1}]
  ```
  已存在同一 ticket_id 则更新 `retries+1`，不重复追加
- [ ] 同时写 `.eket/inbox/need-expert-<TASK-X>.md`：
  ```
  ⚠ TASK-X 需要 [rust] 专家 Slaver，当前无匹配实例。
  建议执行：eket slaver:register --role rust --skills rust
  ```
- [ ] heartbeat 下次循环时，`waiting-for-expert.json` 中的 ticket 优先级高于普通 DAG-ready（插入 priority_tickets 队首）
- [ ] ticket 被成功派出后，从 `waiting-for-expert.json` 移除对应条目，删除对应 inbox 文件
- [ ] 新增单测 `heartbeat_writes_waiting_queue`：无匹配 slaver → waiting-for-expert.json 存在且内容正确
- [ ] `--no-interactive` 环境下也正常工作（纯文件操作，无 stdin 依赖）

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/master_heartbeat.rs`

```rust
fn append_waiting_for_expert(project_root: &Path, ticket_id: &str, required: &[String]) { ... }
fn remove_waiting_entry(project_root: &Path, ticket_id: &str) { ... }
fn write_inbox_need_expert(project_root: &Path, ticket_id: &str, required: &[String]) { ... }
fn load_waiting_tickets(project_root: &Path) -> Vec<String> { /* 返回 ticket_id 列表，retries 最多的优先 */ }
```

`check_once` 中 priority_tickets 构建顺序：
1. unblocked-queue.json（已有）
2. waiting-for-expert.json（新增，插 unblocked 之后、DAG-ready 之前）
3. DAG-ready

## 知识沉淀

完成后记录到 `confluence/memory/patterns/expert-dispatch-waiting.md`。
