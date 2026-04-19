# TASK-100: PR #86~#95 拓扑排序 + Integration Gate 合并计划

## 元数据
- **状态**: ready
- **类型**: chore
- **优先级**: P1
- **负责人**: 待领取（Master 任务）
- **创建时间**: 2026-04-19
- **依赖**: TASK-097, TASK-099

## 背景

积压 10 个 feature PR 未合并（#86~#95），涵盖：
- TASK-064/065/066：原子 claimTask + FailStaleTasks + task_messages
- TASK-067/068：session resume + Skills 管理 API
- TASK-069：task:claim 动态注入
- TASK-070：YAML DAG 工作流引擎
- TASK-071：Agent model router
- TASK-072：SSE event bus
- TASK-073：Ticket DAG API + ASCII dashboard
- TASK-074：RAG 检索策略
- TASK-075：trigger_rule + fresh_context

盲合必产生接口冲突。需先排拓扑依赖序，再逐一合并并验证。

## 验收标准

1. 产出拓扑排序表（每个 PR 的依赖关系）
2. 每个 PR 合并前：`npm test` 全绿 + `npm run lint` 零 error
3. 所有 10 个 PR 合并完成（或有记录说明为何跳过）
4. 合并后整体 npm test 全绿

## 执行流程

### Step 1：读取每个 PR 的内容，建依赖图

```bash
for pr in 86 87 88 89 90 91 92 93 94 95; do
  gh pr view $pr --json title,body,files | head -30
done
```

### Step 2：拓扑排序

初步判断（需验证）：
```
TASK-064/065/066（DB schema）
  └── TASK-067/068（依赖 schema）
      └── TASK-069（依赖 skills）
          └── TASK-070（DAG 引擎）
              └── TASK-071/072（依赖引擎）
                  └── TASK-073/074/075（依赖上层）
```

### Step 3：逐一合并

每次合并步骤：
```bash
gh pr merge <N> --squash --admin
git pull origin miao
cd node && npm test 2>&1 | tail -3
```

如有冲突：先 rebase PR 到最新 miao，再合并。

### Step 4：最终验证

```bash
cd node && npm test 2>&1 | tail -5   # 全绿
cd node && npm run lint               # 零 error
git tag v2.15.0-beta && git push origin v2.15.0-beta
```
