# TASK-137: [Rust] CLI 剩余命令 — gate-review, submit-pr, task-resume, team-status, task-progress

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P2
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-132, TASK-133]

## 背景

TS 中还有多个 CLI 命令未迁移到 Rust，但不阻塞最小协作流程。
集中在一张卡实现，避免零散 ticket。

## 验收标准

- [ ] `gate-review` — 读取 PR URL，调 git/GitHub CLI 检查 CI 状态，输出 `{ "pass": bool, "checks": [...] }`
- [ ] `submit-pr` — git push + gh pr create，输出 PR URL JSON
- [ ] `task-resume` — 读取 execution_checkpoints，从断点恢复 Saga 执行
- [ ] `team-status` — 调 InstanceRegistry 列出所有实例 + 各自当前 ticket，表格输出
- [ ] `task-progress` — 读 ticket DAG，显示完成率 + 关键路径进度
- [ ] `handoff` — 当前 Slaver 将 ticket 移交给另一个 Slaver（更新 assignee + 通知）
- [ ] 每个命令有 `--json` flag 输出结构化 JSON（供 Dashboard 调用）
- [ ] 单元测试 ≥ 2 条/命令（mock 外部调用）

## 技术要点

- `gh` CLI 调用用 `std::process::Command`（同 git）
- gate-review 解析 `gh pr checks` 输出
- task-resume 从 SQLite execution_checkpoints 读状态，重建 SagaExecutor
