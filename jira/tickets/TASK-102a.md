# TASK-102a: skill_graph Schema + 基础 CRUD

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

TASK-102 的第一阶段：建表 + 基础读写方法，不含权重衰减逻辑。

## 验收标准

1. `sqlite-client.ts` 新增 `skill_nodes` + `skill_edges` 两张表
2. 新增：`registerSkillNode()` / `upsertSkillEdge()` / `getSkillNode(id)`
3. `npm test` 全绿，新增 ≥ 2 单测
