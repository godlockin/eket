---
id: TASK-053
title: 修复 broadcast 自动 PR 因 GITHUB_TOKEN 无法触发下游 workflow
status: backlog
priority: P1
type: bugfix
epic: EPIC-V3-MIGRATION
created_at: 2026-04-18
dispatched_by: human:steven
---

# TASK-053

## 背景
TASK-052 把 broadcast 改成 peter-evans PR 模式后，PR 能开（#78）但 5 个
required check 全部 stuck "expected"——这是 GitHub 的安全限制：默认
`GITHUB_TOKEN` 创建的 PR **不触发**任何下游 workflow（防 infinite loop）。
导致 PR 永远无法 merge，admin 也不行（required checks 不能 force pass）。

## 选项
1. **PAT 路线**：新建 fine-grained PAT (PR write + content write)，存为
   `PAT_FOR_BROADCAST` secret，peter-evans 用它替代 GITHUB_TOKEN → 下游
   workflow 正常触发，自动 merge OK。**安全考量**：PAT 比 token 长寿期，
   需要轮转策略。
2. **GitHub App 路线**：建 App 装到 repo，token 短寿但配置复杂。
3. **非保护分支路线**：broadcast workflow 直接 push 到 `broadcast-stubs`
   分支（无保护），定期 cron PR 合并。Slaver 启动脚本改读两条分支的 INBOX。
   **优点**：零外部 secret。**缺点**：脚本/SOP 要改。
4. **手动归档路线**：保留当前生成 stub 的能力，但不自动 PR；每周 retro
   review 时人工归档。

## 推荐
选项 3（非保护分支）— 不引入凭据管理复杂度，且符合 EKET "fail-soft"
原则：自动化失败时人不阻塞。

## Acceptance Criteria
- [ ] AC-1: 选定方案并 ADR 记录
- [ ] AC-2: 实现并验证 broadcast 链路 end-to-end
- [ ] AC-3: 更新 SOP / Slaver 启动脚本
- [ ] AC-4: 关闭 GH 限制相关的 carry-over note in TASK-052

## 依赖
TASK-052 已 merge (d95132ee)
