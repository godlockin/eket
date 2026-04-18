---
id: TASK-057
title: "fix(skills): 修复 index.ts 导出断层，接入 auto-registry"
priority: P1
status: ready
assignee: frontend_dev
dispatched_by: master
created_at: 2026-04-18
---

## 背景

`node/src/skills/index.ts` 目前只导出 4 个 Skill 类，但 skills 目录下有 ~76 个 skill 文件分布在：
algorithm/, analysis/, data/, design/, development/, devops/, documentation/, hr/, implementation/, llm/, ops/, planning/, requirements/, review/, security/, testing/, ux/, adapters/

外部调用者无法通过 index.ts 访问绝大多数 skill，等于死代码。

`skills/registry.ts` 和 `skills/loader.ts` 中有自动发现机制，但未与 index.ts 串联。

## 验收标准

- [ ] `skills/index.ts` 导出所有 category 下的 skill 类（可通过 re-export 或接入 auto-registry）
- [ ] `SkillRegistry` 初始化后可通过 `registry.getSkill(name)` 获取任意 skill
- [ ] 导出方式不破坏现有 4 个 skill 的引用（向后兼容）
- [ ] `input.data as unknown as XInput` 双重 cast 反模式：如果 `SkillInput<T>` 泛型已正确定义，改为直接 `input.data`（至少在新增文件中修正，存量可注释标记 TODO）
- [ ] `npm run build` 无错误，`npm test` 全绿

## 技术提示

- `node/src/skills/auto-registry.ts` — 已有自动发现逻辑，参考接入
- `node/src/skills/registry.ts` — SkillRegistry 实现
- `node/src/skills/types.ts` — SkillInput<T> 泛型定义，确认 data 字段类型
