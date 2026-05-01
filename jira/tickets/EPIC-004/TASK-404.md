# TASK-404: Master 决策 SLA 写入治理规则

## 元数据
- **状态**: todo
- **类型**: docs
- **优先级**: P2
- **agent_type**: docs
- **estimate_hours**: 1
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

EPIC-003 中 TASK-231b 因"等待 Master 决策"阻塞数天。4 个简单的二选一决策项不应该造成这么长的阻塞。

## 详细描述

1. 在 `template/docs/MASTER-RULES.md` 中增加"决策 SLA"章节：
   - Ticket 标记 `BLOCKED ON MASTER DECISION` 后，Master 须在 **24 小时内** 做出决策
   - 决策项 ≤ 4 个 → 直接写入 ticket 注释
   - 决策项 > 4 个 → 说明 ticket 拆分粒度不够，先拆再决策
   - 超时未决策 → Slaver 可使用默认方案（保守选择），并在 PR 中标注
2. 在 `CLAUDE.md` 的 Master 红线中增加一条："禁止让 ticket 因 Master 决策阻塞超过 24 小时"

## 验收标准

- [ ] AC-1: MASTER-RULES.md 包含决策 SLA 章节
- [ ] AC-2: CLAUDE.md Master 红线更新
- [ ] AC-3: 决策超时的默认处理策略已定义

## test_strategy
- 文档审核

---
agent_type: docs
estimate_hours: 1
