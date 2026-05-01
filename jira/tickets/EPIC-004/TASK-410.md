# TASK-410: types/index.ts 按领域拆分

## 元数据
- **状态**: todo
- **类型**: refactor
- **优先级**: P3
- **agent_type**: code
- **estimate_hours**: 3
- **parent_epic**: EPIC-004

## 背景

`node/src/types/index.ts` 是单文件包含所有类型定义，EPIC-003 中该文件是冲突最高发区。
按领域拆分可降低未来多 Agent 并行时的冲突概率。

## 详细描述

1. 分析 `node/src/types/index.ts` 中的类型，按领域分组：
   - `types/task.ts` — Task, TaskEvent, TaskMessage, TaskEnvelope 等
   - `types/skill.ts` — SkillMeta, SkillNodeRecord, SkillEdgeRecord, SkillFeedback 等
   - `types/sqlite.ts` — ISQLiteClient, Result 等
   - `types/instance.ts` — Instance, SlaveResult, LevelChange 等
   - `types/review.ts` — ReviewerResult, UltrareviewReport, ValidationCheck 等
   - `types/common.ts` — EketErrorCode, Config 等通用类型
2. `types/index.ts` 改为纯 re-export（`export * from './task.js'` 等）
3. `npm run build` + `npm test` 全绿
4. 确认所有 import 路径仍然兼容（`from '../types/index.js'` 不需要改）

## 验收标准
- [ ] AC-1: types/ 目录下至少 5 个独立文件
- [ ] AC-2: index.ts 只有 re-export
- [ ] AC-3: build + test 全绿
- [ ] AC-4: 无 import 路径变更

---
agent_type: code
estimate_hours: 3
