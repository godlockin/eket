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

## heartbeat expertise 匹配（TASK-246）

`check_once` 派送前先解析 `required_expertise`，从 idle slavers 中选最匹配者：

```
得分规则：
  slaver.role 在 required 中          → 2 分（精确匹配）
  slaver.skills 与 required 有交集     → 1 分（技能包含）
  required 含 "any" 或为空             → 直接取第一个 idle
  无任何匹配                           → None，输出 no_matching_slaver JSON
```

- 文件不存在 / 无 `required_expertise:` 行 → 默认 `["any"]`（保守兼容）
- ticket ID 须为 `TASK-<纯数字>`，含字母后缀无法通过 DAG parser（测试坑）

## 无匹配时的等待队列（TASK-247）

无匹配时写 `.eket/state/waiting-for-expert.json`：
```json
[{"ticket_id":"TASK-X","required":["rust"],"since":"...","retries":1}]
```
- 同一 ticket 重复无匹配 → `retries += 1`，按 retries 降序优先重试
- 同时写 `.eket/inbox/need-expert-{ticket_id}.md` 召唤建议
- 派送成功后自动清除队列条目 + inbox 文件
- priority 顺序：`unblocked-queue` > `waiting-for-expert` > `DAG-ready`

## auto-scaffold persona（TASK-249）

`task:create` 遇未知 expertise tag 时自动生成骨架文件：
- 路径：`~/.claude/skills/eket/experts/extended/{tag}.md`（`EKET_EXPERTS_EXTENDED_DIR` 可覆盖）
- 目录不存在则自动创建；文件已存在则跳过（幂等）
- 骨架含最小必要字段，标注 `⚠ 自动生成，请补充完整 persona`
- tag = `any` 跳过

## 坑 / 注意

- `value_delimiter = ','` 让 `--expertise rust,devops` 自动拆分为 `vec!["rust", "devops"]`，无需手动 split。
- 测试中构造 `TaskCreateArgs` 时必须补 `expertise` 字段，否则编译失败。
- 旧 ticket（无 `required_expertise:` 行）走 fallback 全文匹配，不会破坏现有数据。
- heartbeat 测试中 ticket ID 必须是纯数字格式（如 `TASK-201`），含字母（如 `TASK-W1`）DAG parser 会过滤掉，导致 ready_tickets 为空，测试白跑。
