# TASK-Z08: 测试覆盖率提升至 60%

**EPIC**: EPIC-014  
**状态**: pending  
**优先级**: P1  
**预估**: 2d  
**负责人**: 待分配  
**依赖**: TASK-Z05, TASK-Z06

---

## 背景

当前测试覆盖比 49.1%，目标 60%。

```
源码:    65,702 行
测试:    32,266 行
比例:    49.1%
目标:    60% (需增加 ~7,000 行测试)
```

## 目标

将测试覆盖比从 49.1% 提升到 60%+。

## 范围

在 TASK-Z05、Z06 基础上，补充以下模块测试：

| 模块 | 当前覆盖 | 目标 |
|------|----------|------|
| api/ | 低 | 中 |
| utils/ | 低 | 高 |
| types/ | 无 | 中 |
| hooks/ | 低 | 中 |

## 任务清单

### 1. utils/ 模块测试
```
node/tests/unit/utils/
├── file-utils.test.ts
├── string-utils.test.ts
├── date-utils.test.ts
└── validation.test.ts
```

### 2. api/ 模块测试
```
node/tests/unit/api/
├── routes.test.ts
├── handlers.test.ts
└── validators.test.ts
```

### 3. hooks/ 模块测试
```
node/tests/unit/hooks/
├── pre-commit.test.ts
├── post-merge.test.ts
└── lifecycle.test.ts
```

## 验收标准

- [ ] 测试代码行数 >= 39,500 (60% of 65,702)
- [ ] `npm test` 全部通过
- [ ] 新增测试文件 >= 10

## 计算

```
当前: 32,266 行 (49.1%)
目标: 65,702 * 0.6 = 39,421 行
需增加: 39,421 - 32,266 = 7,155 行
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-25 | 创建 Ticket | Master |
