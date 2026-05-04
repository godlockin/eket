# TASK-249: 新 expertise tag 无 persona 时自动 scaffold 骨架文件

**状态**: ready
**优先级**: P2
**预估工时**: 300min
**负责人**: —
**创建时间**: 2026-05-04
**所需专家**: rust
**依赖**: 无
**阻塞**: 无

---

## 背景

`task:create --expertise <tag>` 时如果 tag 不在 default/extended 专家库里，系统只 warn 后继续，专家 persona 文件从不存在。导致 `task:claim` 加载 expert section 为空，slaver 拿不到任何专家设定。需要在建卡时就把缺失的 persona scaffold 好。

## 需求

`task:create` 时检测每个 `--expertise` tag：若 `ExpertSkillBridge` 找不到对应 profile，自动在 `~/.claude/skills/eket/experts/extended/` 生成 minimal 骨架文件并记录日志。

## 验收标准

- [ ] `task:create --expertise data-engineer` 时：
  - 若 `~/.claude/skills/eket/experts/default/` 和 `extended/` 均无 `data-engineer` profile
  - 自动创建 `~/.claude/skills/eket/experts/extended/data-engineer.md`，内容为 minimal 骨架（见下方模板）
  - 输出 `{"scaffolded_experts": ["data-engineer"]}` 行
- [ ] 目录 `~/.claude/skills/eket/experts/extended/` 不存在时自动创建
- [ ] 已存在 profile（default 或 extended）→ 不覆盖，静默跳过
- [ ] tag = `any` → 跳过（不需要 persona）
- [ ] 单测 `scaffold_creates_missing_persona`：临时目录模拟 experts dir，tag 无对应文件 → 文件被创建，内容含必要字段

## Minimal 骨架模板

```yaml
```yaml
id: eket.{tag}.scaffold
name: {Tag} Expert
name_cn: {tag} 专家
role: {Tag} 专家（待完善）
emoji: 🤖
domain: {tag}
tier: extended
skills:
  primary:
    - systematic-debugging
    - test-driven-development
  contextual: []
```

> ⚠ 此文件由 eket 自动生成，请补充完整的专家 persona 设定。
> 参考模板：~/.claude/skills/eket/experts/default/backend.md
```

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/task_create.rs`

```rust
/// 检查 expertise tags，对缺失 persona 的 tag 生成 scaffold 文件。
/// 返回被 scaffold 的 tag 列表。
fn scaffold_missing_experts(tags: &[String], experts_base: &Path) -> Vec<String> {
    // 1. 用 ExpertSkillBridge::load_from_dirs 加载 default + extended
    // 2. 对每个 tag（跳过 "any"）：bridge.all_experts() 找不到 id 含该 tag 的 profile
    // 3. 生成骨架内容，写入 extended/<tag>.md
    // 4. 返回被写入的 tag 列表
}
```

在 `task_create::run` 的 expertise 校验之后调用，失败只 warn 不阻塞建卡。

`extended/` 目录路径：优先读 `EKET_EXPERTS_EXTENDED_DIR` 环境变量，默认 `~/.claude/skills/eket/experts/extended/`。

## 知识沉淀

完成后在 `confluence/memory/patterns/expertise-tag-design.md` 追加"auto-scaffold"小节。
