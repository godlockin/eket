# TASK-E16-HOTFIX: EPIC-016 AB Review 发现的 P0 问题修复

**EPIC**: EPIC-016  
**状态**: ready  
**优先级**: P0  
**预估**: 0.5d  
**负责人**: 待分配  
**依赖**: EPIC-016 所有 ticket 完成后

---

## 背景

AB 对抗 Review 中 B 组发现的 P0 集成问题。

## 问题

模块未导出到 `node/src/index.ts`，外部无法 import 使用。

## 修复方案

在 `node/src/index.ts` 添加导出：

```typescript
// EPIC-016 模块导出
export { TokenMeter, BudgetState, BudgetColors } from './core/token-meter.js';
export { shouldRunHook, getHookProfile, HookProfile } from './hooks/hook-flags.js';
export { HookDispatcher, CheckRegistry } from './hooks/dispatcher.js';
export { checkFactForcing, SessionTracker } from './hooks/pre-tool-use/fact-forcing-gate.js';
export { checkBashCommand } from './hooks/pre-bash-dispatcher.js';
```

## 验收标准

- [ ] 外部可通过 `import { TokenMeter } from 'eket-cli'` 使用
- [ ] TypeScript 类型正确导出
- [ ] 无循环依赖

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Hotfix Ticket | Master (AB Review) |
