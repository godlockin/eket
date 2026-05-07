# TASK-248: expert:summon 命令 — 按 expertise 召唤或初始化专家 Slaver

**状态**: done
**优先级**: P2
**预估工时**: 360min
**负责人**: —
**创建时间**: 2026-05-04
**所需专家**: rust
**依赖**: TASK-247
**阻塞**: 无

---

## 背景

当 heartbeat 发现缺某类专家 slaver 时，目前只能被动等人类去手动 `slaver:register`。需要一个主动命令让 Master 可以"召唤"某个专家角色：先查 DB 有没有对应 slaver，没有则初始化注册 + 输出专家 persona 提示。

## 需求

新增 `eket expert:summon --role <tag>` 命令。

## 验收标准

- [ ] `eket expert:summon --role rust` 查 DB：
  - 已有 idle/busy 的 `rust` slaver → 输出已有实例信息，不重复注册
  - 无匹配 → 自动调用 `slaver:register --role rust --skills rust`，输出注册结果
- [ ] 注册成功后，输出专家 persona 提示（从 `expert_skill_bridge` 加载对应 profile，找不到则输出 generic 模板）
- [ ] `eket expert:summon --from-waiting` 读 `.eket/state/waiting-for-expert.json`，对每条 `required` 批量召唤
- [ ] 输出 JSON：`{"summoned": ["rust_<uuid>"], "already_exist": [], "personas_loaded": ["backend"]}`
- [ ] 单测 `summon_registers_new_slaver`：空 DB → 调用 summon → DB 中有新 slaver 实例

## 实现要点

**新文件**: `rust/crates/eket-cli/src/commands/expert_summon.rs`

```rust
#[derive(Args)]
pub struct ExpertSummonArgs {
    #[arg(long)]
    pub role: Option<String>,
    #[arg(long)]
    pub from_waiting: bool,
}

pub async fn run(args: ExpertSummonArgs) -> Result<()> {
    // 1. 确定需要召唤的 roles（from --role 或 from waiting-for-expert.json）
    // 2. 对每个 role：查 DB → 已有则 skip；没有 → upsert_instance(idle)
    // 3. 加载 expert persona（ExpertSkillBridge），输出 skills 提示
    // 4. 输出汇总 JSON
}
```

**注册到 CLI**：在 `main.rs` / `Commands` enum 中添加 `ExpertSummon(ExpertSummonArgs)`。

## 知识沉淀

完成后记录到 `confluence/memory/patterns/expert-dispatch-waiting.md`（追加 summon 部分）。
