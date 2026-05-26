# Master 负载分担 — 专属助理委托机制

当 Master 成为性能瓶颈时（并行 Slaver > 3 或消息队列积压 > 10），必须委托专属助理分担工作。

## 可委托的助理角色

| 角色 | 职责 | 可独立决策 | 必须上报 Master |
|------|------|-----------|----------------|
| `pr_reviewer` | 4-Level Artifact Verification | 代码质量问题、测试覆盖 | 合并/驳回决策 |
| `scrum_master` | 心跳监控、进度催促 | 超时提醒、进度汇总 | 超时 Release 决策 |
| `incident_reviewer` | 超时根因诊断 | 诊断报告 | 任务重分配 |
| `analysis_reviewer` | 分析报告审核 | 格式/完整性检查 | 技术方案审批 |
| `test_reviewer` | 测试结果审核 | 覆盖率/质量检查 | proceed_to_pr 决策 |

## 委托规则

**助理权限边界**：
- ✅ 可以：读取文件、执行验证命令、生成报告、发送提醒
- ❌ 禁止：修改 ticket 状态、合并 PR、Release Slaver、创建新 ticket

**产出格式**（写入 `shared/message_queue/inbox/assistant_report/`）：
```json
{
  "type": "assistant_report",
  "role": "pr_reviewer",
  "ticket_id": "TASK-XXX",
  "conclusion": "approve_recommended | changes_needed | reject_recommended",
  "confidence": "high | medium | low",
  "findings": ["具体发现1", "具体发现2"],
  "recommendation": "建议 Master 采取的行动",
  "timestamp": "ISO8601"
}
```

**Master 最终决策**：助理报告是建议，Master 必须审阅后做出最终决策。

## 自动委托触发条件

```
IF 消息队列积压 > 10:
  → 自动启动 scrum_master 助理处理 progress_report
  
IF 待审核 PR > 3:
  → 自动启动 pr_reviewer 助理并行审核
  
IF Slaver 超时事件 > 2:
  → 自动启动 incident_reviewer 批量诊断
```

## Master 单点故障兜底

外部 Supervisor 守护进程（每 5 分钟 cron 执行）：

```bash
# scripts/supervisor.sh
MASTER_HEARTBEAT=".eket/state/master_heartbeat.json"
THRESHOLD_SECONDS=600  # 10 分钟无心跳视为故障

if [ -f "$MASTER_HEARTBEAT" ]; then
  last_beat=$(jq -r '.timestamp' "$MASTER_HEARTBEAT")
  now=$(date +%s)
  diff=$((now - $(date -d "$last_beat" +%s 2>/dev/null || echo 0)))
  
  if [ $diff -gt $THRESHOLD_SECONDS ]; then
    echo '{"type":"master_failure","detected_at":"'$(date -Iseconds)'"}' \
      >> shared/message_queue/inbox/recovery_queue.jsonl
    echo "[ALERT] Master heartbeat timeout: ${diff}s" >> .eket/logs/supervisor.log
  fi
fi
```

Master 恢复后优先处理 `recovery_queue.jsonl`。
