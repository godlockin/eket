# TASK-AUTO-13: 外部 Supervisor 脚本 - Master/Slaver 双向监控

**Epic**: EPIC-009  
**Priority**: P0 🔴  
**Status**: 🔍 Review  
**Estimate**: 2h  
**Agent Type**: devops  
**Assignee**: Slaver-022

---

## Goal

实现独立于 Claude 的外部监控进程，监控 Master + Slaver 心跳，Master 假死时告警。

---

## Acceptance Criteria

**AC-1**: Supervisor 脚本监控 Master 心跳 (300s)  
**AC-2**: 备份监控 Slaver 心跳 (650s)  
**AC-3**: Master 假死创建 [CRITICAL] 告警  
**AC-4**: Slaver 超时记录恢复队列

---

## Implementation Details

### 实现文件

- `scripts/supervisor.sh` - Bash 监控脚本 (~150 行)
- `docs/supervisor-usage.md` - 使用文档

### 核心功能

1. **Master 心跳监控**
   - 读取 `.eket/state/master-heartbeat` 文件 mtime
   - 超时 300s → 生成 `.eket/inbox/[CRITICAL]-MASTER-<timestamp>.md`
   
2. **Slaver 心跳监控**
   - 扫描 `.eket/state/slaver-*-heartbeat` 文件
   - 超时 650s → 追加到 `.eket/state/recovery-queue.txt`

3. **跨平台支持**
   - macOS: `stat -f %m`
   - Linux: `stat -c %Y`

4. **日志记录**
   - 输出到 `.eket/logs/supervisor.log`
   - 格式: `[ISO8601] [LEVEL] <message>`

---

## Timeline

- **分析**: 0.3h ✅
- **实现**: 1h ✅
- **测试**: 0.4h ✅
- **文档**: 0.3h ✅
- **Total**: 2h

---

## Testing

- ✅ Master 超时检测 (模拟 350s 旧文件)
- ✅ Slaver 超时检测 (模拟 700s 旧文件)
- ✅ 告警文件生成
- ✅ 恢复队列格式验证
- ✅ 信号处理 (SIGINT/SIGTERM)

---

## Verification Commands

```bash
# AC-1: Master 超时检测
python3 -c "import os, time; os.utime('.eket/state/master-heartbeat', (int(time.time())-350, int(time.time())-350))"
bash scripts/supervisor.sh & PID=$!; sleep 3; kill $PID; wait $PID || true
grep "Master heartbeat timeout" .eket/logs/supervisor.log

# AC-2: Slaver 超时检测
python3 -c "import os, time; os.utime('.eket/state/slaver-001-heartbeat', (int(time.time())-700, int(time.time())-700))"
bash scripts/supervisor.sh & PID=$!; sleep 3; kill $PID; wait $PID || true
grep "Slaver 001 timeout" .eket/logs/supervisor.log

# AC-3: 告警文件内容
cat .eket/inbox/[CRITICAL]-MASTER-*.md | head -10

# AC-4: 恢复队列格式
grep -E '^[0-9]+\|[0-9]+$' .eket/state/recovery-queue.txt
```

---

## PR Link

Branch: `feature/TASK-AUTO-13-supervisor`  
PR Request: `outbox/review_requests/TASK-AUTO-13-pr-request.md`

---

## Notes

- Supervisor 使用独立 Bash 进程，不依赖 Node.js 运行时
- 生产环境推荐使用 systemd (Linux) 或 launchd (macOS) 启动
- 告警文件需手动清理或实现归档机制

---

**Created**: 2026-05-14T23:30:00+08:00  
**Updated**: 2026-05-14T23:55:00+08:00  
**Completed**: 2026-05-14T23:55:00+08:00
