# TASK-AUTO-13: 外部 Supervisor 脚本 - Master/Slaver 双向监控

**Epic**: EPIC-009  
**Priority**: P0 🔴  
**Status**: 📋 Ready  
**Estimate**: 2h  
**Agent Type**: devops

---

## Goal

实现独立于 Claude 的外部监控进程，监控 Master + Slaver 心跳，Master 假死时告警。

---

## AC

**AC-1**: Supervisor 脚本监控 Master 心跳 (300s)  
**AC-2**: 备份监控 Slaver 心跳 (650s)  
**AC-3**: Master 假死创建 [CRITICAL] 告警  
**AC-4**: Slaver 超时记录恢复队列

---

## Implementation

```bash
#!/bin/bash
# scripts/supervisor.sh
while true; do
  # Master 心跳检查
  MASTER_LAST=$(stat -f %m .eket/state/master-heartbeat 2>/dev/null || echo 0)
  if [ $(($(date +%s) - MASTER_LAST)) -gt 300 ]; then
    echo "[CRITICAL] Master dead" > .eket/inbox/[CRITICAL]-MASTER-$(date +%s).md
  fi
  
  # Slaver 备份监控
  for hb in .eket/state/slaver-*-heartbeat; do
    # 超时 → 恢复队列
  done
  
  sleep 60
done
```

**启动**: Cron 或 systemd

**Time**: 2h
