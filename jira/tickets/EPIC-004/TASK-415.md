# TASK-415: 设计防卡死 Agent Prompt 模板 + 心跳监控机制

## 元数据
- **状态**: todo
- **类型**: infra
- **优先级**: P1
- **agent_type**: code
- **estimate_hours**: 2
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

多次 EPIC 执行中 slaver agent 出现卡死或静默退出，包括：
- API 429 限流后静默停止
- 上下文窗口溢出被杀
- `npm test` / `npm run build` 超时
- HTTPS git push 挂起等待认证输入
- Worktree 状态异常无法恢复

Master 无法感知 agent 已死，继续等待导致时间浪费。

## 详细描述

### Part 1: 标准防卡死 Prompt 模板

创建 `confluence/memory/agent-prompt-template.md`，包含 slaver agent prompt 的标准模板段落，Master 派 agent 时复制粘贴：

```markdown
## 防卡死规则（必须遵守）
1. 所有 Bash 命令设 `timeout: 120000`（2 分钟），超时立即报告
2. Git push 只用 SSH：`git push git@github.com:godlockin/eket.git <branch>`
3. `npm test` 输出只看 `tail -20`，不要全量输出
4. 最多连续读取 5 个文件，超过必须开始写代码或报告 BLOCKED
5. 遇到 HTTP 429 / rate limit → 立即停止，报告"429 限流"，不要重试
6. 遇到 merge conflict → 不要自行解决超过 3 个文件的冲突，报告给 Master
7. 每完成一个子步骤，输出一行进度（"[1/5] done: xxx"）
```

### Part 2: Master 心跳监控 SOP

在 `confluence/memory/agent-prompt-template.md` 中同时记录 Master 监控 SOP：

1. 派 agent 时用 `run_in_background: true`
2. 收到完成通知后验证产物
3. 如果 15 分钟无通知 → `TaskOutput(block=false)` 检查
4. 如果 agent 已死 → `TaskStop` + 分析最后输出 + 重派或手动完成

### Part 3: SLAVER-RULES.md 更新

在 `template/docs/SLAVER-RULES.md` 中增加"防卡死自检"章节：
- Slaver 启动后先确认 SSH push 可用
- 长命令必须设 timeout
- 遇到不可恢复错误立即报告，不要循环重试

### Part 4: MASTER-RULES.md 更新

在 `template/docs/MASTER-RULES.md` 中增加 Agent 派遣 checklist：
- prompt 是否包含防卡死规则
- 是否用 SSH push
- 是否设了 timeout
- 是否限制了文件读取数

## 验收标准
- [ ] AC-1: `confluence/memory/agent-prompt-template.md` 创建
- [ ] AC-2: SLAVER-RULES.md 包含防卡死自检章节
- [ ] AC-3: MASTER-RULES.md 包含 Agent 派遣 checklist
- [ ] AC-4: 用新模板试派一个 test agent，确认模板可用

---
agent_type: code
estimate_hours: 2
