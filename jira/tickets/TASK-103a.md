# TASK-103a: skill.json 元数据格式 + 批量生成脚本

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-102a

## 背景

TASK-103 的第一阶段：为现有 18 个 skill 目录生成 `.json` 元数据文件。

## 验收标准

1. 定义 `SkillMeta` TypeScript 接口（放在 `node/src/skills/types.ts`）
2. `scripts/generate-skill-meta.sh` 扫描 skills/ 目录，为每个 `.ts` 文件生成对应 `.json`（已有则跳过）
3. 18 个领域目录各自有 `*.json` 文件
4. JSON 格式校验通过（ajv 或 zod）
