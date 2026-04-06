# outbox/tasks/ — 任务输出目录

**版本**: v2.0.0
**最后更新**: 2026-04-06

## 用途

每个 ticket 的输出放在 `outbox/tasks/<ticket-id>/` 子目录下。

## 文件类型

| 文件 | 触发时机 | 处理者 |
|------|---------|--------|
| `analysis-report.md` | Slaver 完成任务分析后 | Master（审批） |
| `pr-request.md` | Slaver 提交 PR 后 | Master（审核） |
| `completion-notice.md` | 任务完成后 | Master（确认） |
| `blocker-report.md` | Slaver 遇到阻塞时 | Master（协助） |

## 状态说明

Slaver 写入文件后，需同步更新 `jira/tickets/<ticket-id>/status.yml` 中的 `status` 字段：

- 写入 `analysis-report.md` → 状态改为 `analysis_review`
- 写入 `pr-request.md` → 状态改为 `review`
- 写入 `completion-notice.md` → 状态改为 `done`

## 示例

```bash
# Slaver 写入分析报告
mkdir -p outbox/tasks/FEAT-001
cat > outbox/tasks/FEAT-001/analysis-report.md << 'EOF'
# 分析报告 - FEAT-001

**分析者**: slaver-frontend-001
**分析时间**: 2026-04-06 10:00

## 任务理解
...

## 技术方案
...

## 预估工时
3小时
EOF

# 同步更新状态
# (在 jira/tickets/FEAT-001/status.yml 中设置 status: analysis_review)
```
