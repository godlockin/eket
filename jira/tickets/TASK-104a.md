# TASK-104a: Slaver 模型升降级 API

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-103b

## 背景

TASK-104 第一阶段：Slaver 执行中自主升降级的 API，不含反馈上报。

## 验收标准

1. `instance-registry.ts` 新增：
   - `upgradeModel(reason: string)` — level +1（上限 3）
   - `downgradeModel(reason: string)` — level -1（下限 1）
   - `getCurrentLevel()` — 返回当前层级
2. 升降级记录存入 instance 状态（level_changes[]）
3. `npm test` 全绿，新增 ≥ 3 单测
