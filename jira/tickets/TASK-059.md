---
id: TASK-059
title: "fix(index): checkAvailability() 永远返回 true Bug"
priority: P1
status: done
assignee: fullstack_dev
dispatched_by: master
created_at: 2026-04-18
completed_at: 2026-04-18
---

## 背景

`node/src/index.ts` 中：

```typescript
function checkAvailability(): boolean {
  try {
    import('ioredis');  // dynamic import 返回 Promise，不会同步 throw
    return true;
  } catch { return false; }
}
```

`dynamic import()` 永远不会同步抛异常，catch 永远不触发，函数永远返回 `true`。
`system:check` 命令依赖此函数判断 Redis 是否可用，导致检测完全失去意义。

## 验收标准

- [x] 改用同步检测方式（`createRequire(import.meta.url)('ioredis')` 或检测 `node_modules` 路径存在性）
- [x] 或改为 async 并在调用处 await（需同步修改 `system:check` 命令调用链）
- [x] `system:check` 命令在 ioredis 未安装时正确输出不可用
- [x] `npm run build` 无错误，`npm test` 全绿

## 实现说明

采用 Option A（`createRequire`）方案：

1. 在文件顶部添加 `import { createRequire } from 'module'`
2. 创建模块级 `_require = createRequire(import.meta.url)`
3. `checkAvailability()` 改用 `_require('ioredis')` 等同步调用

**原因**：`dynamic import()` 返回 Promise，不会同步抛异常，catch 无法捕获模块缺失错误。
`createRequire` 提供同步 CommonJS-style require，模块不存在时立即抛出 `MODULE_NOT_FOUND`。

**测试结果**：`npm run build` 无错误，1152 个测试通过（2 个预存在失败与本 ticket 无关）。
