# TASK-402: 验证并修复 branch-drift-alert CI workflow

## 元数据
- **状态**: todo
- **类型**: infra
- **优先级**: P1
- **agent_type**: devops
- **estimate_hours**: 1
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

TASK-237 创建了 `scripts/check-branch-drift.sh` 和 `.github/workflows/branch-drift-alert.yml`，已同步到 miao（默认分支），GitHub 显示 workflow 为 active。但从未实际运行过。

## 详细描述

1. 用 `gh workflow run branch-drift-alert.yml` 手动触发一次
2. 用 `gh run list --workflow=branch-drift-alert.yml` 查看执行结果
3. 如果失败，分析日志并修复（常见问题：permissions、checkout 配置、脚本路径）
4. 确认 workflow 能正确检测 main↔miao 偏移

## 验收标准

- [ ] AC-1: `gh workflow run` 成功触发
- [ ] AC-2: workflow run 状态为 success（或发现真实 drift 时正确报告）
- [ ] AC-3: 如有修复，提交到 miao 分支

## test_strategy
- 手动触发 + 查看 GitHub Actions 日志

---
agent_type: devops
estimate_hours: 1
