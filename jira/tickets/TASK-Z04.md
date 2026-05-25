# TASK-Z04: 清理 TypeScript any 类型

**EPIC**: EPIC-014  
**状态**: done  
**优先级**: P0  
**预估**: 3d  
**负责人**: 待分配

---

## 背景

当前 `node/src/` 目录下有 46 处 `any` 类型使用，影响类型安全评分 (54/100)。

## 目标

消除所有显式 `any` 类型，使用 `unknown` + 类型守卫替代。

## 任务清单

### 1. 扫描定位
```bash
grep -rn "any" node/src --include="*.ts" | grep -v "// any" | head -50
```

### 2. 分类处理

| 类型 | 处理方式 |
|------|----------|
| 函数参数 `any` | 改为 `unknown` + 类型守卫 |
| 返回值 `any` | 定义具体接口 |
| 变量 `any` | 推断或定义类型 |
| catch `any` | 改为 `unknown` |

### 3. 启用严格规则
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}
```

### 4. ESLint 规则
```json
// .eslintrc
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

## 验收标准

- [ ] `grep -r ": any" node/src --include="*.ts" | wc -l` 输出 0
- [ ] `npm run build` 无类型错误
- [ ] `npm test` 全部通过
- [ ] ESLint `no-explicit-any` 规则启用

## 技术要点

1. **优先级**: 先处理 `core/` 再处理其他模块
2. **风险点**: 第三方库类型可能不完整
3. **回退方案**: 必要时使用 `// eslint-disable-next-line`

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-25 | 创建 Ticket | Master |
