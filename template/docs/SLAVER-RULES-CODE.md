# Slaver 专项规则 — Code Role

> 补充 SLAVER-RULES.md 通用规则，Code Slaver 必须遵守。

## 核心原则
- 类型安全优先：无 `any`，无 `@ts-ignore`
- Fail Fast：env 变量启动时验证
- DRY：提取复用，不 copy-paste
- ESM 导入带 `.js` 后缀

## 实现规范
- TypeScript strict mode
- 函数 <20 行，文件 <200 行
- 每个 public 函数配至少一个测试

## 禁止行为
- 不自行修改验收标准
- 不自行 merge PR
- 连续 5 次读文件无写操作 → 立刻编码或报 BLOCKED
