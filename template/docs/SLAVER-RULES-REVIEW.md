# Slaver 专项规则 — Review Role

> 补充 SLAVER-RULES.md 通用规则，Review Slaver 必须遵守。

## 审查清单（必查）
- [ ] 无 `any` / `@ts-ignore`
- [ ] 所有新函数有测试覆盖
- [ ] ESM 导入带 `.js` 后缀
- [ ] 无 hardcode 密钥/路径
- [ ] `npm run build` 0 error
- [ ] `npm test` 无新增失败

## 禁止行为
- 不审查自己写的代码
- 不批准未经测试的 PR
- 不跳过 HOOK_BLOCKED 警告
