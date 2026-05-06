---
id: TASK-240
title: "P0 — CLAUDE.md 精简：减少 SessionStart 全局 context 注入"
type: refactor
priority: P0
status: done
created: 2026-05-03
epic: context-optimization
---

## 需求

`~/.claude/CLAUDE.md`（~15k chars ≈ 4k tokens）每次 SessionStart 全量注入。
其中大部分是代码示例（Immutable Six 的 TypeScript 例子），实际使用频率极低。

**目标**：CLAUDE.md 精简至 < 5k chars（约 1.5k tokens），节省 ~2.5k tokens/session。

## 验收标准

- [ ] `~/.claude/CLAUDE.md` 压缩后 < 5k chars
- [ ] 6 大原则的规则说明保留，代码示例全部移出
- [ ] 移出的代码示例保存到 `~/.claude/docs/patterns/` 对应文件，保留可读性
- [ ] Quick Reference 代码块移到 `~/.claude/docs/patterns/quick-reference.md`
- [ ] EKET 专项架构模式移到 `~/.claude/docs/patterns/eket-patterns.md`
- [ ] CLAUDE.md 底部加引用注释：`# 完整示例见 ~/.claude/docs/patterns/`

## 技术方案

精简策略（每节保留规则，删代码示例）：

| 章节 | 现大小 | 精简后 | 移出内容 |
|------|-------|-------|---------|
| Immutable Six × 6 | ~8k | ~2k | 所有 TS/Python 代码块 |
| Project-Specific Patterns | ~1.5k | 删除 | 移到 patterns/eket-patterns.md |
| Quick Reference | ~1k | 删除 | 移到 patterns/quick-reference.md |
| Checklist | ~0.5k | 保留 | — |
| Communication Style | ~0.5k | 保留 | — |

## 影响文件

- `~/.claude/CLAUDE.md`（精简）
- `~/.claude/docs/patterns/quick-reference.md`（新建）
- `~/.claude/docs/patterns/eket-patterns.md`（新建）

## 约束

- 规则本身（Golden Rules、Why、The Rule）必须保留
- 不改变任何行为，只是代码示例外化
- 精简后人工验证：claude code 新 session 行为无变化

## 预估工作量

~2h（提取 1h + 验证 1h）
