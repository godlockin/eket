# TASK-110b: Slaver 自主 ticket 完整性 review

**状态**: done
**优先级**: high
**标签**: feature, slaver, quality

## 详细描述

在 task:claim 成功后（worktree 创建之后）插入 Slaver 自主 ticket 完整性 review 步骤。
新建 `node/src/core/ticket-reviewer.ts` 提供 `reviewTicket(ticketPath)` 函数，检查：
1. 详细描述章节内容 ≥30 字
2. 验收标准章节存在且非空
3. 依赖 ticket 均已完成

review 失败时删除 worktree、更新状态为 blocked、写 inbox 反馈并退出。

## 验收标准

- [x] `ticket-reviewer.ts` 实现并构建成功
- [x] `claim.ts` 在 worktree 创建后调用 review
- [x] review 失败时执行 rollback + blocked + feedback 流程
- [x] ≥4 单元测试覆盖核心场景
- [x] 全套测试 `npm test` 无新增失败

## 实现细节

- 新建: `node/src/core/ticket-reviewer.ts`
- 新建: `node/tests/core/ticket-reviewer.test.ts`（5个单元测试）
- 修改: `node/src/commands/claim.ts`（步骤 8.5 插入 review）

## PR

https://github.com/godlockin/eket/pull/119
