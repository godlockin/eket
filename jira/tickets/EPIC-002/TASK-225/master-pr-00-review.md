# TASK-225 PR-00 Review

**Reviewer**: master-001
**审核时间**: 2026-04-27
**Slaver**: slaver-002
**Commit**: 77cf6e76
**裁决**: ✅ **PR-00 通过 — 解锁 PR-01**

## 验证

| 检查项 | 结果 |
|--------|------|
| script ≤ 150 行（AC-4）| ✅ 130 行 |
| test ≤ 50 行（AC-4）| ✅ 30 行 |
| 总净变更 ≤ 300 | ✅ 269 行 |
| `bash tests/codemod-test.sh` 自测 | ✅ 3/3 PASS |
| 真实子仓 dry-run（`tech/`）正确识别 8 文件 | ✅ |
| skeleton TODO 风格符合 Master mandate（无"通用占位借口"）| ✅ |
| 幂等检测（`grep -q "^## Common Rationalizations"`）| ✅ |
| commit message 不含 trailer | ✅ |
| 子仓未触动 | ✅ |

## 代码质量抽查

- **awk 注入策略**：`/^```/{n=NR} END{print n+0}` 取**最后一个**反引号行——正确处理 YAML 单块场景。如未来出现 multi-block 边界，需补 fixture。
- **skeleton 用 heredoc 写入临时文件**：避开 awk -v 多行字符串字符转义陷阱，工程稳健。
- **trap rm SKELETON_FILE on EXIT**：临时文件清理到位。
- **参数解析**：单层 for-arg loop 对 `--dry-run` 与目标参数解耦，可读。
- **退出码**：找不到 target 仅 stderr WARN 不 fail；适合批量场景，但对 CI 可考虑后续加 `--strict` 选项（不在本 ticket 范围）。

## 一个观察（不阻塞）

`last_backtick=$(awk ... )` 仅匹配以 ` ``` ` 开头的整行。当前 53 文件 schema 一致没问题；若未来出现行内代码块或缩进的 ```，会误判。**不在本 ticket 范围内修，但建议在 PR-01 提交时附 dry-run 全量输出（53 文件），快速发现异常**。

## 解锁

🔓 **PR-01 解锁**：在子仓 `eket-experts-extended` 上对 `experts/ai/` 8 个文件跑 codemod，提交独立 PR。

## PR-01 约束（顺序合并）

1. **子仓独立 git repo** — 在 `~/working/sourcecode/research/eket-experts-extended/` 内 `git switch -c feature/TASK-225-ai`，提交后**不 push**
2. **codemod 用法**：`bash <main-repo>/scripts/codemod-inject-3sections.sh experts/ai/`
3. **提交前先全量 dry-run** 53 文件，输出贴到 PR description 作 baseline
4. **PR-01 commit message**：
   ```
   feat(TASK-225/PR-01): inject 3-section skeleton on experts/ai (8 files)

   - codemod: scripts/codemod-inject-3sections.sh (主仓 commit 77cf6e76)
   - 8 files in experts/ai/: aiml/bigdata/cv/data-analyst/data/ml/mlops/nlp
   - TODOs: <count> total (skeleton-first per Master mandate)
   - net change: <N> lines
   ```
5. **不带 trailer**；预估 ~120 行净增 < 300 阈值
6. **本机改动落子仓后**：回主仓 `feature/TASK-226a-rules-fixtures` 不需要新 commit；PR-01 完全在子仓内闭环
7. PR-02~11 后续派工，**逐批合并**不并行（与 TASK-223 PR-B 一样的策略，防止整批返工）

## AC 状态（PR-00 视角）

| AC | 状态 |
|----|------|
| AC-1 (53 文件 3 节齐) | ⏳ pending PR-01~11 |
| AC-2 (脚本通过率 ≥90%) | ⏳ pending TASK-224 |
| AC-3 (单 PR ≤ 300) | ✅ PR-00 269 行；后续 PR-01~11 预估均 ≤ 120 |
| AC-4 (codemod ≤ 200 + 单测) | ✅ 130 + 30 = 160 |
| AC-5 (INDEX.md 不动) | ✅ 留给 TASK-227 |

## 与 TASK-223 协调

slaver-001 PR-A 已通过（commit 714de7fe），正在做 PR-B（frontend + fullstack）。两位 Slaver 改动域完全隔离（default 7 节 vs optional 3 节最小子集；主仓 vs 子仓），无冲突。
