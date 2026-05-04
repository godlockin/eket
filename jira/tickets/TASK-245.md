# TASK-245: task:create 卡大小检测与拆分提示

**状态**: done  
**优先级**: P2  
**预估工时**: 240min  
**负责人**: —  
**创建时间**: 2026-05-04  
**所属需求**: 团队协作4项需求 - 需求1（Master拆卡时发现卡太大）  
**所需专家**: Rust工程师  
**依赖**: TASK-243（专家标签字段，拆分后子卡也需标签）  
**阻塞**: 无

---

## 背景

Master 拆卡全靠人工判断复杂度，无任何辅助。ticket 创建时没有复杂度估算提示，容易产生"一张卡做3天"的超大卡。

## 需求

`eket task:create` 时根据预估工时和描述长度检测是否过大，超过阈值输出 warn 并提示拆分建议。

## 验收标准

- [ ] `eket task:create "标题" --effort 600` 输出黄色警告：`⚠ 预估工时 600min > 阈值 480min，建议拆分为子任务`
- [ ] 警告后询问：`继续创建？(y/N/split)` — `split` 模式进入交互式拆分向导
- [ ] 拆分向导：列出当前描述 → 提示输入子任务数量（2-5）→ 逐个确认子任务标题 → 批量创建
- [ ] 非交互模式（`--no-interactive`）：只输出警告，不阻断，自动继续
- [ ] 阈值可通过 `.eket/config.yml` 的 `task_size_warn_minutes` 配置（默认 480）
- [ ] 批量拆分的子卡自动继承父卡的 `expertise`、`priority`、`epic`

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/task_create.rs`

```rust
#[derive(Args)]
pub struct TaskCreateArgs {
    // ...已有字段
    #[arg(long, help = "Estimated effort in minutes")]
    pub effort: Option<u32>,
    
    #[arg(long, help = "Skip interactive prompts")]
    pub no_interactive: bool,
}

fn check_task_size(effort: u32, threshold: u32) -> Option<SizeWarning> {
    if effort > threshold {
        Some(SizeWarning { effort, threshold })
    } else {
        None
    }
}

fn interactive_split_wizard(args: &TaskCreateArgs) -> Result<Vec<SubTask>> {
    // 使用 dialoguer crate 交互式收集子任务
    // 返回子任务列表，调用方批量 task:create
}
```

**依赖 crate**: `dialoguer` (交互式输入), `colored` (警告着色)

**`.eket/config.yml` 新增**:
```yaml
task_size:
  warn_minutes: 480
  max_minutes: 960  # 硬上限，超过必须拆（强制）
```

## 知识沉淀

完成后记录卡大小标准和拆分策略。
