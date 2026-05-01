# TASK-414: 合并 MASTER-RULES §9 和 testing §11

## 元数据
- **状态**: todo
- **类型**: docs
- **优先级**: P2
- **agent_type**: docs
- **estimate_hours**: 0.5
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

merge main→testing 时，testing 原有的 §11「EPIC 收尾必须验证 main 同步」被 main 的 §9「阶段完成 Post-Process」用 `--theirs` 覆盖了。两者内容互补：

- §9（main）：回归验证 + 分支同步 + 经验教训 + 技术债登记
- §11（testing）：EPIC 收尾验证 main 同步 + PR 模板 base=testing 检查项

应将 §11 的独有内容合并到 §9 中。

## 详细描述

1. 从 git history 恢复 testing 上被覆盖的 §11 内容：
   ```
   git log --all -- template/docs/MASTER-RULES.md
   ```
   找到 testing 分支 merge 前的版本，提取 §11 内容
2. 将 §11 独有的内容合并到 §9：
   - §9.1 回归验证 追加：`scripts/check-branch-drift.sh` 验证
   - §9 追加 §9.5：PR 模板检查项（base=testing）
3. 确认合并后 §9 内容完整无遗漏
4. 三分支同步

## 验收标准
- [ ] AC-1: §9 包含原 §11 的所有独有内容
- [ ] AC-2: 无重复内容
- [ ] AC-3: 三分支 MASTER-RULES.md 一致

---
agent_type: docs
estimate_hours: 0.5
