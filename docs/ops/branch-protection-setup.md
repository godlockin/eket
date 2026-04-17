# GitHub 分支保护配置指南

> 目的：让本仓库新增的 5 条 CI 闸门（pr-body-check / pr-reviewer-check / dual-engine / perf-baseline / debrief-check）成为**强制**规则，而不是"装饰性"检查。
> Admin 也无法 bypass（除非显式开启 allow admins）。

---

## 必需的状态检查

以下 GitHub Actions 必须通过，PR 才能合并：

| Check Name (GitHub 会自动发现) | Workflow 文件 | 拦截场景 |
|---|---|---|
| `verify-test-evidence` | `.github/workflows/pr-body-check.yml` | PR 描述缺真实 Jest/TAP 输出或 ticket 引用 |
| `block-self-loop` | `.github/workflows/pr-reviewer-check.yml` | 派发者 == PR 作者（自我闭环） |
| `dual-engine` | `.github/workflows/dual-engine.yml` | 7 场景双引擎对比失败 |
| `benchmark` | `.github/workflows/perf-baseline.yml` | 关键指标 > baseline × 1.3 |
| `require-debrief` | `.github/workflows/debrief-check.yml` | ticket 标记 done 但无复盘文件 |

---

## Settings → Branches 配置步骤

1. 打开 `https://github.com/<owner>/<repo>/settings/branches`
2. 在 **Branch protection rules** 点击 **Add rule**（或 Edit 已有的 `main`/`miao` 规则）
3. **Branch name pattern**: `main`
4. 勾选以下选项：

   - [x] **Require a pull request before merging**
     - [x] Require approvals: `1`
     - [x] Dismiss stale pull request approvals when new commits are pushed
     - [x] Require review from Code Owners（配合 `.github/CODEOWNERS`）

   - [x] **Require status checks to pass before merging**
     - [x] Require branches to be up to date before merging
     - 在搜索框中依次添加（必须先让 workflow 至少跑过一次才会出现在列表里）：
       - `verify-test-evidence`
       - `block-self-loop`
       - `dual-engine`
       - `benchmark`
       - `require-debrief`

   - [x] **Require conversation resolution before merging**
   - [x] **Require signed commits**（可选，强推荐）
   - [x] **Require linear history**（可选，保持 git log 干净）
   - [x] **Do not allow bypassing the above settings**（**关键**，否则 admin 可绕过）

5. 对 `miao` 分支重复步骤 3–4（pattern 改成 `miao`）

---

## 豁免机制（给紧急修复留口子）

所有 Action 都支持 PR label 豁免：

| Label | 豁免范围 |
|---|---|
| `docs-only` | 跳过 pr-body-check（纯文档 PR） |
| `infra-only` | 跳过 pr-body-check（CI/脚本重构） |
| `skip-test-evidence` | 跳过 pr-body-check（人为覆盖，审计留痕） |
| `solo-dev` | 跳过 pr-reviewer-check（单人项目） |
| `bot-pr` | 跳过 pr-reviewer-check（Renovate/Dependabot） |

**用法**：在 PR 右侧 Labels 里勾选，或发 PR 时用 `gh pr create --label docs-only`。
每次使用 `skip-test-evidence` 必须在 PR 描述里写明理由，Master review 时重点审计。

---

## 验证

完成配置后，用一个故意不合规的 PR 做烟测：

```bash
git checkout -b test/branch-protection
echo "x" >> README.md
git commit -am "test: trigger protection"
git push -u origin test/branch-protection
gh pr create --title "test: no evidence" --body "no tests"
# 预期：pr-body-check 失败，Merge 按钮灰化
gh pr close --delete-branch
```

---

## 故障排查

- **Action 名字搜不到**：workflow 必须在默认分支上跑过至少一次；先 merge workflow 到 main，再回来配 protection。
- **admin 仍能合并**：检查第 4 步最后一项 "Do not allow bypassing" 是否勾选。
- **CODEOWNERS 未触发**：确认 `.github/CODEOWNERS` 语法正确（`gh api repos/:owner/:repo/codeowners/errors`）。

---

**参考**：
- `template/docs/EXPERT-PANEL-PLAYBOOK.md` §3 —— 四大闸门定义
- `template/docs/MASTER-RULES.md` §2.4 —— 禁止自我闭环
- `.github/workflows/*.yml` —— 实际实现
