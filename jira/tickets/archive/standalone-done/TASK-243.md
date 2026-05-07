# TASK-243: task:create 强制专家标签字段

**状态**: done  
**优先级**: P1  
**预估工时**: 180min  
**负责人**: —  
**创建时间**: 2026-05-04  
**所属需求**: 团队协作4项需求 - 需求2（卡标记专家诉求）  
**所需专家**: Rust工程师  
**依赖**: 无  
**阻塞**: 无

---

## 背景

`eket task:create` 创建 ticket 时 `required_expertise` 字段没有强制要求，Master 拆卡时可能遗漏专家标签，导致 Slaver 无法根据专长过滤任务。

## 需求

1. `task:create` 增加 `--expertise <tag,...>` 参数（必填，可多值）
2. 常见 tag 白名单：`rust, node, python, go, java, frontend, devops, qa, docs, ux, data, security`
3. `task:claim --role <tag>` 过滤时匹配 `required_expertise` 字段（已有 role 过滤，需确保兼容）
4. ticket 模板中 `required_expertise` 字段填写实际值（非空占位）

## 验收标准

- [ ] `eket task:create "标题"` 不传 `--expertise` 时输出错误提示并退出
- [ ] `eket task:create "标题" --expertise rust,devops` 正确写入 ticket
- [ ] ticket 文件中 `required_expertise: [rust, devops]` 格式正确
- [ ] `eket task:claim --role rust` 只返回包含 `rust` 的 ticket
- [ ] 支持 `--expertise any` 跳过过滤（通用任务）

## 实现要点

**文件**: `rust/crates/eket-cli/src/commands/task_create.rs`

```rust
#[derive(Args)]
pub struct TaskCreateArgs {
    pub title: String,
    
    #[arg(long, value_delimiter = ',', required = true,
          help = "Required expertise tags: rust,node,python,go,java,frontend,devops,qa,docs,ux,data,security,any")]
    pub expertise: Vec<String>,
    
    // 已有参数保留
    #[arg(long, default_value = "P2")]
    pub priority: String,
    
    #[arg(long)]
    pub blocked_by: Option<String>,
}
```

**ticket 模板中**，将 `required_expertise` 从可选改为必填：
```markdown
**所需专家**: {{expertise_list}}
```

**task_claim.rs**：confirm `--role` 匹配逻辑读取 `required_expertise` 字段（检查现有实现是否已覆盖）。

## 知识沉淀

完成后记录专家标签体系设计决策。
