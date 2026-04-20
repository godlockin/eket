# TASK-108: Commit Trailer 决策上下文（Rules + Harness）

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-105b（task:complete 命令已存在）

## 背景

借鉴 oh-my-claudecode 的 Commit Trailer 协议：每个 ticket 完成时的 git commit
强制附加决策上下文 trailer，把"为什么这么做、拒绝了哪些方案"写入 git history，
比 confluence/ 复盘更轻量、更可搜索。

## Trailer 格式

```
feat: implement skill graph CRUD [TASK-102a]

Confidence: high
Rejected-approaches: in-memory Map, Redis
Directive: use SQLite for consistency with existing data layer
Scope-risk: low
Followup: consider adding index on skill_edges.weight for query perf
```

字段说明：
- `Confidence`：high | medium | low（必填）
- `Rejected-approaches`：逗号分隔，可为 none（必填）
- `Directive`：关键决策一句话（必填）
- `Scope-risk`：low | medium | high（必填）
- `Followup`：后续建议（可选，找不到可省略）

## 自动推断逻辑

| 字段 | 推断来源 |
|------|---------|
| Confidence | levelChanges 数量：0次升降级=high，1次=medium，2+=low |
| Rejected-approaches | ticket BLOCKED 历史 + levelChanges.reason 关键词提取 |
| Directive | ticket 标题 + 最新 commit message 摘要 |
| Scope-risk | git diff --stat 文件数：≤5=low，6~15=medium，16+=high |
| Followup | ticket 复盘 notes / BLOCKED action items（找不到则省略） |

## 验收标准

1. `node/src/commands/complete.ts`：task:complete 末尾自动推断 trailer，调用 `git commit --amend --no-edit -m` 追加
2. `template/docs/SLAVER-RULES.md`：新增「Commit Trailer 规范」章节，说明格式和语义
3. `scripts/validate-ticket-template.sh`：对 done 状态 ticket 检查最新 commit 是否含 `Confidence:` 字段（WARN 级别）
4. `npm test` 全绿，新增 ≥ 3 单测（trailer 自动推断逻辑）

## 实现步骤

1. 在 `node/src/commands/complete.ts` 实现 `buildCommitTrailer(ticketId, slaverId)` 函数
2. 调用 `git log -1 --format=%s` 获取最新 commit subject
3. 调用 `git diff HEAD~1 --stat` 统计文件数推断 Scope-risk
4. 从 instanceRegistry 读取 levelChanges 推断 Confidence
5. `git commit --amend` 追加 trailer
6. 更新 SLAVER-RULES.md
7. 更新 validate-ticket-template.sh
8. 写单测
