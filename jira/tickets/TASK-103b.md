# TASK-103b: Layer 0 索引加载器

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-103a, TASK-102b

## 背景

TASK-103 的第二阶段：启动时扫描所有 `.json` 构建内存索引，
并从 skill_graph 加载高权重边（≥0.6）注入索引。

## 验收标准

1. `node/src/skills/index-loader.ts` 实现 `loadSkillIndex()` 
2. 返回：`{ nodes: SkillMeta[], edges: SkillEdge[], modelRouteTable: Record<string, 1|2|3> }`
3. 耗时 < 100ms
4. `registry.ts` 启动时调用，索引存入内存单例
5. `npm test` 全绿，新增 ≥ 3 单测
