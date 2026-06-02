# TASK-646: watch 模式资源泄漏修复

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 0.5d  
**依赖**: TASK-642  
**层级**: L2 Node.js  
**来源**: Adversarial Review (架构)

---

## 问题描述

`epic-run.ts` 第466-473行 watch 模式下 SIGINT 处理后未调用 `bridge.disconnect()` 和 `eventBus.disconnect()`。

**影响**：进程退出时可能有未清理的资源（EventBus 订阅、定时器等）。

## 验收标准

- [x] SIGINT handler 中添加 cleanup 逻辑
- [x] 添加 `finally` 块确保资源清理
- [x] 验证无进程残留

## 修复方案

```typescript
// epic-run.ts
process.on('SIGINT', async () => {
  console.log('\n⏹️  Stopping watch mode...');
  
  // 清理资源
  if (bridge) {
    await bridge.disconnect();
  }
  if (eventBus) {
    eventBus.disconnect();
  }
  
  process.exit(0);
});
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Review P2) | Master |
| 2026-06-01 | 修复 SIGINT cleanup，添加 executor/bridge/eventBus.disconnect() | Slaver |
