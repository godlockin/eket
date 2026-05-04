---
proof: TASK-243
date: 2026-05-04
author: Rust Slaver
---

# 专家标签（expertise tag）设计模式

## 背景

TASK-243 为 `eket task:create` 增加强制 `--expertise` 字段，解决卡片无专家标记导致任意 Slaver 领取不匹配任务的问题。

## Ticket 格式

`task:create` 生成的 markdown 含两行机读字段：

```markdown
- **所需专家**: rust, devops
- required_expertise: [rust, devops]
```

- `**所需专家**:` — 人类可读展示
- `required_expertise: [...]` — 程序解析锚（`task:claim --role` 读此行）

## 合法白名单

```
rust, node, python, go, java, frontend, devops, qa, docs, ux, data, security, any
```

- 传入非白名单 tag → stderr `[WARN]`，**不报错**，允许自定义 tag
- `any` = 不限专家，任意 Slaver 可领取

## task:claim --role 过滤逻辑

`filter_by_role` 优先解析结构化字段 `required_expertise:`：

1. 找到行 → 拆分 tag list → 判断包含 `any` 或精确匹配 role（case-insensitive）
2. 找不到行 → 退化为全文 case-insensitive 子串匹配（向后兼容旧 ticket）

## clap arg 定义

```rust
#[arg(
    long,
    value_delimiter = ',',
    required = true,
    help = "Required expertise: rust,node,python,...,any"
)]
pub expertise: Vec<String>,
```

`required = true` + `value_delimiter = ','` 使得不传时 clap 自动报错并提示用法，无需手写错误处理。

## 坑 / 注意

- `value_delimiter = ','` 让 `--expertise rust,devops` 自动拆分为 `vec!["rust", "devops"]`，无需手动 split。
- 测试中构造 `TaskCreateArgs` 时必须补 `expertise` 字段，否则编译失败。
- 旧 ticket（无 `required_expertise:` 行）走 fallback 全文匹配，不会破坏现有数据。
