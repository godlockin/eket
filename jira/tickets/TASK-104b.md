# TASK-104b: 任务完成反馈上报 + Master skill_graph 更新

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-104a, TASK-102b

## 背景

TASK-104 第二阶段：task:complete 时上报 SkillFeedback，Master 更新 skill_graph 权重，
实现任务分配自进化回路闭合。

## 验收标准

1. `task:complete` 末尾自动收集并上报 `SkillFeedback`
2. `task_history` 表新增 `skill_feedback_json` 字段
3. Master heartbeat 扫描新反馈 → 调用 `updateEdgeWeight()` 更新协作权重
4. Master `task:claim` 推荐逻辑：查 `getTopCollaborators()` 给出推荐模型层级
5. `npm test` 全绿，新增 ≥ 4 单测
