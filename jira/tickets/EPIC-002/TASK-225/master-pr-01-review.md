# TASK-225 PR-01 Review

**Reviewer**: master-001
**审核时间**: 2026-04-27
**Slaver**: slaver-002
**Subrepo Commit**: 18c88c89 (branch `feature/TASK-225-ai`)
**裁决**: ✅ **PR-01 通过 — 解锁 PR-02**

## 验证

| 检查项 | 结果 |
|--------|------|
| 8 文件改动（experts/ai/）| ✅ aiml/bigdata/cv/data-analyst/data/ml/mlops/nlp |
| 净变更 +208 行 ≤ 300（AC-3）| ✅ |
| TODO 数 96（12/file × 8）| ✅ 与 codemod skeleton 12 TODO/file 预期一致 |
| 3 节注入顺序（C.R. → R.F. → V.）| ✅ aiml.md 行 43/53/61 |
| 子仓独立分支 | ✅ feature/TASK-225-ai |
| 主仓未触动 | ✅ |
| 未 push | ✅ |
| commit message 不含 trailer | ✅ |

## 关于 53 vs 54 的 dry-run 差异

子仓 dry-run 实际 54 files，多出的是 `experts/INDEX.md`（codemod 当前对该文件也建议注入，但 PR-01 scope 仅 `experts/ai/` 故未触碰，符合 AC-5「INDEX 不在本 ticket」）。

⚠️ **隐患提醒**：后续 PR-02~11 跑各分类目录时也不会触及 INDEX；但若有人对 `experts/` 整目录跑 codemod，会误注入 INDEX。建议在 PR-11 完成后 / TASK-227 开始前，给 codemod 加一个 `--exclude=INDEX.md` 选项或硬跳过逻辑。**记入 followup**，不阻塞当前批次。

## 解锁

🔓 **PR-02 解锁**：`experts/tech/` 8 文件（与 ai 同规模），子仓独立分支 `feature/TASK-225-tech`。约束同 PR-01：
- 仍走逐批合并不并行
- 不带 trailer
- 不 push
- 主仓不动

## 进度

| PR | 目录 | 文件数 | 状态 |
|----|------|--------|------|
| PR-00 | codemod | — | ✅ merged-locally (主仓 77cf6e76) |
| PR-01 | ai | 8 | ✅ committed (子仓 18c88c89) |
| PR-02 | tech | 8 | 🔓 unlocked |
| PR-03~11 | (9 目录) | 37 文件 | 🔒 待 PR-02 |
