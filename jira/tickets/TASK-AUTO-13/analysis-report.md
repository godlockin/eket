# 任务分析报告： 
**预计工时**: 2h

## 1. 需求理解

实现独立于 Claude 的外部 Bash 监控脚本，监控 Master + Slaver 心跳文件，检测假死并生成告警。

**核心目标**:
- Master 心跳超时 300s → 创建 [CRITICAL] 告警文件
- Slaver 心跳超时 650s → 记录恢复队列
- 独立后台运行（不依赖 Node.js 进程）

**验收标准**:
- AC-1: 监控 Master 心跳 (300s 阈值)
- AC-2: 监控 Slaver 心跳 (650s 阈值)
- AC-3: Master 假死创建 [CRITICAL] 告警
- AC-4: Slaver 超时记录恢复队列

## 2. 技术方案

**架构**:
```
supervisor.sh (独立 Bash 进程)
  ├── 每 60s 一次循环
  ├── 读取心跳文件 mtime
  ├── 对比当前时间
  └── 超时 → 告警/恢复队列
```

**核心逻辑**:
- `stat -f %m` (macOS) / `stat -c %Y` (Linux) 获取文件修改时间
- 当前时间 `date +%s` - mtime > 阈值 → 触发告警
- Master 超时 → 写 `.eket/inbox/[CRITICAL]-MASTER-$(date +%s).md`
- Slaver 超时 → 追加到 `.eket/state/recovery-queue.txt`

**关键路径**:
```bash
# Master 心跳检查
MASTER_HB=".eket/state/master-heartbeat"
MASTER_LAST=$(stat -f %m "$MASTER_HB" 2>/dev/null || echo 0)
NOW=$(date +%s)
if [ $((NOW - MASTER_LAST)) -gt 300 ]; then
  echo "[CRITICAL] Master dead at $(date -Iseconds)" > ".eket/inbox/[CRITICAL]-MASTER-$NOW.md"
fi

# Slaver 心跳检查
for hb in .eket/state/slaver-*-heartbeat; do
  [ -f "$hb" ] || continue
  SLAVER_LAST=$(stat -f %m "$hb" 2>/dev/null || echo 0)
  if [ $((NOW - SLAVER_LAST)) -gt 650 ]; then
    SLAVER_ID=$(basename "$hb" | sed 's/slaver-//;s/-heartbeat//')
    echo "$SLAVER_ID|$NOW" >> .eket/state/recovery-queue.txt
  fi
done
```

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `.eket/state/` | 中 | 读取心跳文件、写恢复队列 |
| `.eket/inbox/` | 中 | 写入告警文件 |
| Supervisor 启动 | 低 | 需手动启动或 systemd/cron |
| 跨平台兼容 | 中 | macOS 用 `stat -f %m`，Linux 用 `stat -c %Y` |

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 |
|--------|----------|--------|
| 实现 supervisor.sh 核心逻辑 | 1h | P0 |
| 跨平台兼容 (macOS/Linux) | 0.3h | P0 |
| 测试脚本 (超时模拟) | 0.4h | P0 |
| 文档 (启动方式) | 0.3h | P1 |

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| 跨平台 `stat` 差异 | 高 | 中 | 自动检测 OS，切换命令 |
| 文件不存在导致脚本退出 | 中 | 中 | `|| echo 0` 保护 |
| 循环卡死无法终止 | 低 | 高 | 添加 trap 信号处理 |
| 心跳文件路径变更 | 低 | 高 | 硬编码路径风险，文档说明 |

## 6. 实现细节补充

**跨平台兼容**:
```bash
if [[ "$OSTYPE" == "darwin"* ]]; then
  STAT_CMD="stat -f %m"
else
  STAT_CMD="stat -c %Y"
fi
```

**信号捕获**:
```bash
trap 'echo "Supervisor stopped"; exit 0' SIGINT SIGTERM
```

**预期输出文件格式**:
- 告警: `.eket/inbox/[CRITICAL]-MASTER-1715673000.md`
  ```markdown
  # Master Heartbeat Timeout
  
  **Time**: 2026-05-14T10:30:00Z  
  **Last Heartbeat**: 2026-05-14T10:24:00Z  
  **Status**: Master process appears dead (>300s timeout)
  
  **Action Required**: Check Master process logs and restart if needed.
  ```

- 恢复队列: `.eket/state/recovery-queue.txt`
  ```
  slaver-001|1715673000
  slaver-002|1715673060
  ```

## 7. 预期文件结构

```
scripts/
  └── supervisor.sh         (新建, ~150行)

.eket/
  ├── state/
  │   ├── master-heartbeat
  │   ├── slaver-*-heartbeat
  │   └── recovery-queue.txt  (新建)
  └── inbox/
      └── [CRITICAL]-MASTER-*.md  (告警时生成)
```

---

**等待 Master 审批** ✅
