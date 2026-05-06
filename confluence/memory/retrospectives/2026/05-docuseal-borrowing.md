---
title: DocuSeal 借鉴研究复盘
date: 2026-05-05
tickets: TASK-254, TASK-255, TASK-256, TASK-257, TASK-258, TASK-264, TASK-265, TASK-266, TASK-267
---

## 成果

- 4 项功能从调研到实现 1 天内完成（并行 Agent）
- PR Review 发现 7 个问题，全部修复
- 26 webhook 测试，Rust clippy clean

## 经验教训

### ✅ 有效的

1. **并行 Agent 策略有效**：3 个独立 Agent 同时开工，节省约 60% 时间。文件无重叠时几乎无冲突。
2. **PR Review 作为质量门**：XOR 伪加密、死 retry 逻辑都在 review 阶段被发现，不是上线后才发现。
3. **sub-agent 做 merge 比手工合并更可靠**：两个 agent 同时改同一文件时，用独立 merge agent 处理比手工 sed 更安全。

### ⚠️ 需要改进的

1. **ticket 状态要在创建时就设对**：TASK-267 写了 `blocked_by` 但 eket 识别为 `blocked` 状态，导致 claim 失败。下次直接写 `todo` + 文字说明依赖，不用 blocked_by 字段。
2. **CI 检查要在本地预跑**：`no-multiple-empty-lines` 是已存在的 lint 问题，但本次没发现。每次 PR 前应先跑 `cd node && npm run lint`。
3. **ticket 完成要填复盘**：`require-debrief` CI 失败，分析记录都是 TODO。下次 complete 之前补充实际结论。
4. **AES-GCM + SSRF 两个 agent 同时改 webhook.rs 会冲突**：相互依赖的安全改动应顺序执行，不能并行。
5. **task:complete 不会清空 tickets 表，是 worktree 被删导致 DB 重置**：每次 complete 后重新 ticket:index。
6. **大 PR 要拆分**：本次 9 张 ticket 一个 PR，check-pr-size 报警。建议按功能域拆：功能 PR + 修复 PR 分开。

## 借鉴 DocuSeal 的核心价值

- **Webhook 指数退避**：直接抄 `2^attempt` 公式，节省设计时间
- **source 枚举 Day 1 内置**：避免后期加字段的 migration 痛苦
- **时间戳代替状态**：`claimed_at/completed_at` 比 status enum 更灵活，自带时序信息
- **MCP Server**：DocuSeal v2.3.7 已官方支持，EKET 跟进立项（TASK-258）
