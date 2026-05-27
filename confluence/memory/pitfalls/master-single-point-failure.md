---
name: master-single-point-failure
type: pitfall
created: 2026-05-14
source: EPIC-003
tags: [architecture, high-availability, master-slaver]
confidence: high
---

# Master 单点故障与性能瓶颈

## 问题

1. **性能瓶颈**：并行 Slaver > 3 时，Master 处理消息队列成为瓶颈
2. **单点故障**：Master 假死后，所有 Slaver 工作中断，无 Failover

---

## 解决方案

### 1. 负载分担 — 专属助理委托

| 助理角色 | 分担工作 |
|----------|---------|
| `pr_reviewer` | 4-Level 代码审核 |
| `scrum_master` | 心跳监控、进度催促 |
| `incident_reviewer` | 超时诊断 |
| `analysis_reviewer` | 分析报告审核 |
| `test_reviewer` | 测试结果审核 |

**权限边界**：助理只能建议，Master 做最终决策。

**自动触发**：
- 消息积压 > 10 → 启动 scrum_master
- 待审 PR > 3 → 启动 pr_reviewer
- 超时事件 > 2 → 启动 incident_reviewer

### 2. 单点故障兜底 — 外部 Supervisor

```
Supervisor (Bash/Cron, 独立进程)
  ├─> 监控 Master 心跳（10 分钟阈值）
  ├─> 故障时写入 recovery_queue.jsonl
  └─> 发送告警到 .eket/logs/

Master 恢复后:
  └─> 优先处理 recovery_queue
```

---

**详细规则**: 见 `template/docs/MASTER-RULES.md` §Rule 4
