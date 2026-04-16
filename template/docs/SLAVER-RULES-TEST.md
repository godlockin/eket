# Slaver 专项规则 — Test Role

> 补充 SLAVER-RULES.md 通用规则，Test Slaver 必须遵守。

## 核心原则
- 测试独立：每个 test 不依赖其他 test 的副作用
- 路径用 `import.meta.url`，不用 `process.cwd()`
- Mock 外部依赖，不真实调用网络/文件系统（除非集成测试明确标注）

## 测试规范
- 文件名：`*.test.ts`，放在 `node/tests/` 对应目录
- describe 描述模块，it 描述行为（"returns X when Y"）
- 每个功能点至少覆盖：happy path + error path

## 禁止行为
- 不允许 `test.only` 遗留在提交中
- 不允许 hardcode 绝对路径
