---
id: TASK-241
title: "P1 — Master 长会话 Hybrid Memory：已完成 ticket 自动摘要"
type: feature
priority: P1
status: backlog
created: 2026-05-03
epic: context-optimization
depends-on: [TASK-239, TASK-240]
---

## 需求

Master 长会话处理多个 ticket 时，已完成 ticket 的完整内容留在 context 中积累，
导致后续 ticket 可用空间越来越少。

**目标**：已完成 ticket 自动替换为摘要（~200 tokens），当前 ticket 保留原文。

## 验收标准

- [ ] `eket task:complete TASK-NNN` 完成时自动生成该 ticket 的 3-5 行摘要
- [ ] 摘要写入 ticket 文件的 `## Summary` section（幂等，已有则跳过）
- [ ] Master 在 `/compact` 提示中能看到"已摘要 N 个 ticket"统计
- [ ] 摘要格式固定：`做了什么 | 结果 | 关键产物 | 遗留风险`（单行 CSV 或表格）
- [ ] 不引入外部模型：摘要由规则提取（从 ticket 的 ## 实现细节 + ## 测试结果 字段截取）

## 技术方案

**基于规则的摘要提取**（无 LLM）：

```
摘要 = ticket.title + " | " 
     + 从"## 测试结果"提取 pass/fail 
     + 从"## PR"提取 PR 链接 
     + 从"## 知识沉淀"提取第一条
```

实现位置：`task_complete.rs` 的 Saga Step 5 之后追加 Step 6（generate_summary）

**Master prompt 规则追加**（`MASTER-RULES.md`）：
```
- 引用已完成 ticket 时只读 ## Summary section，不要全量读取
- context 中只展开当前 in_progress ticket 原文
```

## 影响文件

- `rust/crates/eket-cli/src/commands/task_complete.rs`
- `template/docs/MASTER-RULES.md`（追加规则）
- `jira/tickets/*.md`（生成 Summary section）

## 约束

- 摘要提取纯规则，不调用任何 LLM API
- 幂等：已有 Summary 不覆盖
- 失败只 warn，不阻塞 task:complete 主流程

## 预估工作量

~4h（规则提取逻辑 2h + MASTER-RULES 更新 1h + 测试 1h）
