# TASK-079: 断路修复 — TASK-069 SLAVER-RULES 加载 ACTIVE_CONTEXT.md

**Ticket ID**: TASK-079
**Epic**: SELF-EVOLVE
**标题**: 修复断路：Slaver 启动时实际读取并注入 .eket/ACTIVE_CONTEXT.md 内容
**类型**: bugfix
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 问题

TASK-069 实现了 `injectActiveContext()` 将活跃任务上下文写入 `.eket/ACTIVE_CONTEXT.md`。但 `template/docs/SLAVER-RULES.md`、`template/docs/IDENTITY.md` 和 `node/src/commands/instance-start.ts`（eket-start）均无加载/展示此文件的逻辑，文件被写入但零消费。

**断路点**: `.eket/ACTIVE_CONTEXT.md` 写入但零消费者。

---

## 验收标准

- **AC-1**: `template/docs/SLAVER-RULES.md` 在启动指引中明确要求读取 `.eket/ACTIVE_CONTEXT.md`（添加一节"2.1 加载活跃上下文"）
- **AC-2**: `node/src/commands/instance-start.ts` 的 auto 模式启动后，打印 ACTIVE_CONTEXT.md 内容（若存在）
- **AC-3**: `node/src/commands/claim.ts` claim 成功后调用 `injectActiveContext()` 刷新文件
- **AC-4**: 单元测试：claim → ACTIVE_CONTEXT.md 包含该 ticket 信息

## 测试命令

```bash
cd node && npm test -- --testPathPattern=active-context
node dist/index.js instance:start --auto
# 应打印 ACTIVE_CONTEXT.md 内容（若有活跃任务）
```
