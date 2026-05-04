# TASK-246: heartbeat 按 expertise 精准匹配 Slaver

**状态**: ready
**优先级**: P1
**预估工时**: 360min
**负责人**: —
**创建时间**: 2026-05-04
**所需专家**: rust
**依赖**: 无
**阻塞**: TASK-247

---

## 背景

`master:heartbeat` 当前把 ready ticket 分配给"第一个 idle slaver"，完全不读 ticket 的 `required_expertise` 字段，也不匹配 slaver 在 DB 里的 `role`/`skills`。结果是：一张需要 `rust` 专家的卡可能被派给一个 `frontend` slaver。

## 需求

heartbeat 分配时，按 ticket 的 `required_expertise` 过滤出能胜任的 idle slaver。

## 验收标准

- [ ] `master_heartbeat::check_once` 读取每张 ready ticket 的 `required_expertise` 字段（格式：`required_expertise: [rust, devops]`）
- [ ] 匹配逻辑：slaver 的 `role` 或 `skills`（任一）包含 `required_expertise` 中任意 tag，则视为匹配；tag 为 `any` 则匹配所有 slaver
- [ ] 有匹配的 idle slaver → 派给得分最高者（优先 role 精确匹配 > skills 包含）
- [ ] 无匹配的 idle slaver → skip（不派），输出 `{"event":"no_matching_slaver","ticket_id":"...","required":["rust"]}`
- [ ] 现有单测更新：`heartbeat_assigns_task` 中注册的 slaver 加上 `skills=["rust"]`，ticket 加上 `required_expertise: [rust]`，断言仍能分配
- [ ] 新增单测 `heartbeat_skips_expertise_mismatch`：ticket 需要 `rust`，slaver 只有 `frontend` → ticket 不被派出

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/master_heartbeat.rs`

```rust
/// 从 ticket 文件内容解析 required_expertise 字段
fn parse_required_expertise(tickets_dir: &Path, ticket_id: &str) -> Vec<String> {
    // 读 jira/tickets/TASK-NNN.md
    // 找 `required_expertise: [rust, devops]` 行
    // 返回 vec!["rust", "devops"]；tag = "any" 返回 vec!["any"]
    // 文件不存在或无字段 → vec!["any"]（保守：允许任意 slaver）
}

/// 从 idle slavers 中找最匹配 required_expertise 的那个
fn best_matching_slaver(instances: &[InstanceRow], required: &[String]) -> Option<&InstanceRow> {
    if required.is_empty() || required.iter().any(|t| t == "any") {
        return instances.first();
    }
    // 先找 role 精确匹配，再找 skills 包含，找不到返回 None
}
```

在 `check_once` 的 ticket 循环里替换现有的 `instances.into_iter().find(|i| i.status == "idle")` 调用。

## 知识沉淀

完成后记录"expertise-role 匹配策略"到 `confluence/memory/patterns/`。
