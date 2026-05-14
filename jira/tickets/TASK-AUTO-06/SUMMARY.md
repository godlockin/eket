# TASK-AUTO-06: 自动重试机制

**Epic**: EPIC-AUTO  
**Priority**: P0  
**Effort**: 4h  
**Assignee**: Slaver-021 (backend_dev)  
**Status**: in_progress  
**Created**: 2026-05-14  

---

## 背景

Slaver 失败后需人工重新派遣，需实现自动 3 次重试。
录状态  
2. Master 自动派遣 resume (最多 3 次)  
3. 3 次失败后人工告警  
4. 避免无限循环  

## 实现

- `node/src/core/auto-retry-manager.ts` (~180 LOC)  
- 状态文件: `.eket/state/retry-count-<task>.json`  
- Master 集成: 检测 agent failure → 触发 retry  

## 测试

Mock agent failure + 验证重试次数

---

## 状态历史

- 2026-05-14: 创建 (Slaver-021)
