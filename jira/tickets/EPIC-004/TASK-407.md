# TASK-407: 分支同步一键脚本

## 元数据
- **状态**: todo
- **类型**: infra
- **优先级**: P1
- **agent_type**: devops
- **estimate_hours**: 1
- **parent_epic**: EPIC-004

## 详细描述

创建 `scripts/sync-branches.sh`，实现 EPIC/Sprint 完成后一键三分支对齐。

功能：
1. 接受参数 `--dry-run` 只检查不执行
2. 执行流程：
   - `git fetch origin`
   - merge main → testing（如有 diff）
   - merge main → miao（`-X ours` 处理历史分叉）
   - push 三个分支
3. 验证：`git diff origin/A origin/B | wc -l` 对每对分支
4. 清理已 merged 的 feature 分支（可选 `--prune`）
5. 输出报告：每对分支的 commit 差异 + 内容差异

脚本应该：
- `set -euo pipefail`
- 有颜色输出
- 失败时不会搞坏分支状态（先 fetch 再操作）
- 使用 SSH push (`git@github.com:godlockin/eket.git`)

## 验收标准
- [ ] AC-1: `scripts/sync-branches.sh` 存在且可执行
- [ ] AC-2: `--dry-run` 模式不改变任何分支
- [ ] AC-3: 正常模式完成三分支对齐
- [ ] AC-4: 输出清晰的报告

---
agent_type: devops
estimate_hours: 1
