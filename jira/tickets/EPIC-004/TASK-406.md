# TASK-406: .gitignore 补充 + worktree 残留清理

## 元数据
- **状态**: todo
- **类型**: chore
- **优先级**: P1
- **agent_type**: code
- **estimate_hours**: 0.5
- **parent_epic**: EPIC-004

## 详细描述

1. 在 `.gitignore` 中添加：
   ```
   # Claude Code worktrees
   .claude/worktrees/
   ```
2. 检查是否有 `.claude/worktrees/` 残留目录，如有则清理
3. 确认 CI checkout 不再出现 submodule warning

## 验收标准
- [ ] AC-1: `.gitignore` 包含 `.claude/worktrees/`
- [ ] AC-2: 无 worktree 残留目录

---
agent_type: code
estimate_hours: 0.5
