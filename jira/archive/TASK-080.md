# TASK-080: 断路修复 — TASK-070 注册 workflow:run CLI 命令

**Ticket ID**: TASK-080
**Epic**: SELF-EVOLVE
**标题**: 修复断路：在 index.ts 注册 workflow:run 命令接入 executeWorkflow()
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

TASK-070 在 `node/src/core/workflow-yaml-engine.ts` 实现了 `executeWorkflow(yamlPath)` 完整 DAG 执行引擎（拓扑排序 + 并行 + 条件节点）。但 `node/src/index.ts` 未注册任何 `workflow:*` 命令，引擎完全不可用。

**断路点**: `executeWorkflow()` 未注册为 CLI 命令，无入口。

---

## 验收标准

- **AC-1**: `node/src/index.ts` 注册 `workflow:run <yamlFile>` 命令，调用 `executeWorkflow(yamlFile)`
- **AC-2**: `node/src/index.ts` 注册 `workflow:validate <yamlFile>` 命令，仅校验 YAML 结构不执行
- **AC-3**: `workflow:run` 执行时逐节点打印状态（running → completed/failed）
- **AC-4**: 提供示例 YAML：`examples/workflows/hello-world.yml`（2节点串行）
- **AC-5**: 集成测试：执行示例工作流，输出 `workflow completed`

## 测试命令

```bash
cd node && npm test -- --testPathPattern=workflow
node dist/index.js workflow:validate examples/workflows/hello-world.yml
node dist/index.js workflow:run examples/workflows/hello-world.yml
```
