# TASK-AUTO-14: Master 心跳机制

**Epic**: EPIC-009  
**Priority**: P0  
**Status**: 📋 Ready  
**Estimate**: 1h  
**Agent Type**: backend

---

## Goal

Master 定期更新心跳文件，供 Supervisor 监控。

---

## AC

**AC-1**: 60s 更新 `.eket/state/master-heartbeat`  
**AC-2**: Master 启动时初始化心跳  
**AC-3**: Master 退出时清理心跳

---

## Implementation

```typescript
// node/src/core/master-heartbeat.ts
setInterval(() => {
  fs.writeFileSync('.eket/state/master-heartbeat', Date.now());
}, 60000);
```

**Time**: 1h
