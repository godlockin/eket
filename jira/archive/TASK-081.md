# TASK-081: 断路修复 — TASK-071 模型路由结果传递给 Claude SDK

**Ticket ID**: TASK-081
**Epic**: SELF-EVOLVE
**标题**: 修复断路：resolveModel() 结果实际传递给 Claude API --model 参数
**类型**: bugfix
**优先级**: P1
**重要性**: high

**状态**: superseded
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 问题

TASK-071 实现了 `resolveModel(ticket)` 函数，根据 ticket tags 返回 haiku/sonnet/opus，并通过 `initializeProfile()` 将结果写入 `.eket/state/agent_profile.yml`。但没有任何代码读取此文件并将 model 值传递给 Claude SDK（`claude` CLI 或 API 调用），模型路由完全无效。

**断路点**: `agent_profile.yml` 中的 model 字段零消费，Claude 始终用默认模型。

---

## 验收标准

- **AC-1**: `node/src/commands/claim.ts` claim 后读取 `agent_profile.yml` 中的 `model` 字段
- **AC-2**: `node/src/core/claude-runner.ts`（若不存在则新建）封装 Claude CLI 调用，接受 `model` 参数：`claude --model <model> ...`
- **AC-3**: Slaver 执行任务时使用 `agent_profile.yml` 中指定的模型
- **AC-4**: `.eket/ACTIVE_CONTEXT.md` 中标注当前使用的模型（方便 debug）
- **AC-5**: 单元测试：tags=['implement'] → 模型解析为 opus → claude runner 使用 opus

## 测试命令

```bash
cd node && npm test -- --testPathPattern=model-router
# 验证 claim 后 ACTIVE_CONTEXT.md 包含 model: opus/haiku/sonnet
```
