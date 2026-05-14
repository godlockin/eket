# TASK-633: Snapshot Generator

**Status**: 📋 Ready | **Estimate**: 3h | **Agent**: backend

## Goal
增量快照：120K触发，保存到 logs/context-snapshots/，LRU保留10个

## AC
1. 120K → 生成快照
2. JSON结构：{timestamp, taskId, turnCount, tokens, criticalFiles[], lastMessages[]}
3. LRU: 超10个删最旧
4. 快照<500KB

**Blocked By**: TASK-632 ✅
