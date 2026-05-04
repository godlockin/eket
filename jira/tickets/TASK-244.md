# TASK-244: task:complete 后通知解除阻塞的 ticket

**状态**: done  
**优先级**: P1  
**预估工时**: 240min  
**负责人**: —  
**创建时间**: 2026-05-04  
**所属需求**: 团队协作4项需求 - 需求3（依赖解除并行通知）  
**所需专家**: Rust工程师  
**依赖**: 无（可独立实现，与TASK-242无依赖）  
**阻塞**: 无

---

## 背景

当前 `master_heartbeat` 在分发时检查 `blocked_by` 不分发阻塞任务——这是"阻止领取"。但当依赖 ticket 完成后，没有主动通知机制告知 Slaver "你等的依赖已解除"，Slaver 只能靠下次 poll 才能发现。高并发场景下延迟可达几分钟。

## 需求

`eket task:complete TASK-NNN` 完成后：
1. 扫描所有 `blocked_by` 包含 `TASK-NNN` 的 ticket
2. 对每个现在"依赖全部解除"（所有 blocked_by 的 ticket 都是 done）的 ticket，写入通知文件
3. Master heartbeat 读取通知并优先分发这些 ticket

## 验收标准

- [ ] `eket task:complete TASK-100` 完成后，若 TASK-101 的 `blocked_by` 包含 TASK-100 且现在全部依赖已 done，则输出：`[UNBLOCKED] TASK-101 依赖已解除，可领取`
- [ ] 解除通知写入 `.eket/state/unblocked-queue.json`（追加模式，幂等）
- [ ] `eket master:heartbeat` 优先从 `unblocked-queue.json` 取 ticket 分发
- [ ] unblocked-queue.json 中已分发的条目标记为 `dispatched: true`，不重复处理
- [ ] 若无 Slaver 可接任务（全部 busy），通知保留到下次 heartbeat

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/task_complete.rs`

在 Saga Step 5（状态标记 done）之后新增 Step 6：

```rust
fn notify_unblocked_tickets(project_root: &Path, completed_id: &str) -> Result<()> {
    let tickets_dir = project_root.join("jira/tickets");
    let mut unblocked = vec![];
    
    for entry in fs::read_dir(&tickets_dir)? {
        let path = entry?.path();
        let content = fs::read_to_string(&path)?;
        
        // 读取 blocked_by 列表
        if let Some(blocked_by) = parse_blocked_by(&content) {
            if blocked_by.contains(&completed_id.to_string()) {
                // 检查是否所有依赖都已 done
                if all_deps_done(project_root, &blocked_by) {
                    let ticket_id = extract_ticket_id(&path);
                    unblocked.push(ticket_id);
                }
            }
        }
    }
    
    if !unblocked.is_empty() {
        append_unblocked_queue(project_root, &unblocked)?;
        for id in &unblocked {
            println!("[UNBLOCKED] {} 依赖已解除，可领取", id);
        }
    }
    Ok(())
}
```

**文件**: `rust/crates/eket-cli/src/commands/master_heartbeat.rs`
- 优先读 `unblocked-queue.json` 中 `dispatched: false` 的条目
- 分发后标记 `dispatched: true`

## unblocked-queue.json 格式

```json
[
  {"ticket_id": "TASK-101", "unblocked_at": "2026-05-04T10:00:00Z", "dispatched": false},
  {"ticket_id": "TASK-102", "unblocked_at": "2026-05-04T10:01:00Z", "dispatched": true}
]
```

## 知识沉淀

完成后记录依赖解除通知机制设计。
