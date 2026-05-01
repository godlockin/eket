---
title: Agent Prompt 防卡死模板
proof:
  task_id: TASK-415
  exit_code: 0
  timestamp: 2026-05-01T10:00:00Z
  tool_name: manual verification
---

# Agent Prompt 防卡死模板

> Master 派 slaver agent 时，将以下规则段落复制到 agent prompt 中。

## 防卡死规则（必须遵守）
1. 所有 Bash 命令设 `timeout: 120000`（2 分钟），超时立即报告
2. Git push 只用 SSH：`git push git@github.com:godlockin/eket.git <branch>`
3. `npm test` 输出只看 `tail -20`，不要全量输出
4. 最多连续读取 5 个文件，超过必须开始写代码或报告 BLOCKED
5. 遇到 HTTP 429 / rate limit → 立即停止，报告"429 限流"，不要重试
6. 遇到 merge conflict → 不要自行解决超过 3 个文件的冲突，报告给 Master
7. 每完成一个子步骤，输出一行进度（"[1/5] done: xxx"）

## Master 心跳监控 SOP
1. 派 agent 时用 `run_in_background: true`
2. 收到完成通知后验证产物
3. 如果 15 分钟无通知 → `TaskOutput(block=false)` 检查
4. 如果 agent 已死 → `TaskStop` + 分析最后输出 + 重派或手动完成

## 常见卡死场景及应对
| 场景 | 症状 | 应对 |
|------|------|------|
| API 429 限流 | 连续报错后静默 | 立即停止报告，不重试 |
| 上下文溢出 | agent 突然无输出 | Master 检查 TaskOutput |
| npm test 超时 | 命令挂起 | 必须设 timeout: 120000 |
| git push 挂起 | 等待认证输入 | 只用 SSH，不用 HTTPS |
| Worktree 异常 | commit 丢失 | 参考 worktree-agent-guide.md |
