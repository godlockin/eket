# TASK-102b: skill_graph 权重衰减 + getTopCollaborators

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: Slaver
- **创建时间**: 2026-04-20
- **依赖**: TASK-102a

## 背景

在 TASK-102a 基础上实现 Hebbian 权重更新逻辑和协作者查询。

## 验收标准

1. `updateEdgeWeight(source, target, delta)` — 共激活时 +delta，衰减系数 0.95（30天未激活）
2. `getTopCollaborators(nodeId, topN)` — 按 weight DESC 返回 topN 协作节点
3. 权重上限 1.0，下限 0.0，低于 0.1 的边软删除（标记 inactive）
4. `npm test` 全绿，新增 ≥ 3 单测
