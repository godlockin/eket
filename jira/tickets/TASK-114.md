# TASK-114: PR 复盘自动化 GitHub Action

## 元数据
- **状态**: done
- **PR**: https://github.com/godlockin/eket/pull/122
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

Slaver 手动写复盘经常被跳过或写得很浅，导致 confluence/memory/lessons/ 积累缓慢。
参考 Metaswarm 的自动反馈提取思路，在每次 PR 合并后触发 GitHub Action，
自动从 PR review 评论、commit message、ticket 内容中提取经验教训，
写入 `confluence/memory/lessons/` 并提交到仓库。

## 验收标准

- [x] 新增 `.github/workflows/pr-retro.yml`，触发条件：`pull_request` closed + merged to miao；验证：`cat .github/workflows/pr-retro.yml | grep -E "trigger|on:|merged"`
- [x] Action 提取以下数据：PR title/body、review comments（`gh pr view --json reviews`）、commit messages（`git log`）、对应 ticket 文件（从 PR title 解析 TASK-xxx）；验证：`grep -n "gh pr view" .github/workflows/pr-retro.yml`
- [x] 调用 Claude API（`claude -p`）生成结构化复盘，格式：亮点 2-3 条 + 踩坑 1-2 条 + 下次改进 1-2 条；验证：`grep -n "claude" .github/workflows/pr-retro.yml`
- [x] 复盘文件写入 `confluence/memory/lessons/YYYYMM-PR<N>-<TASK-ID>.md`；验证：`ls confluence/memory/lessons/ | grep "2026"`
- [x] Action 自动 commit 并 push 复盘文件到 miao；验证：`grep -n "git commit" .github/workflows/pr-retro.yml`
- [x] PR title 无法解析 TASK-xxx 时跳过（不报错）；验证：`grep -n "TASK-" .github/workflows/pr-retro.yml`
- [x] 本地测试脚本 `scripts/generate-retro.sh <PR_NUMBER>` 可手动触发同样逻辑；验证：`bash scripts/generate-retro.sh --help`

## 实现要点

```yaml
# .github/workflows/pr-retro.yml
name: PR Retrospective
on:
  pull_request:
    types: [closed]
    branches: [miao]

jobs:
  retro:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Extract PR data
        run: |
          PR_NUM=${{ github.event.pull_request.number }}
          TASK_ID=$(echo "${{ github.event.pull_request.title }}" | grep -oE 'TASK-[0-9]+' | head -1)
          # gh pr view, git log, read ticket file
      - name: Generate retro with Claude
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          # claude -p "..." → structured markdown
      - name: Commit retro file
        run: |
          git config user.name "eket-bot"
          git add confluence/memory/lessons/
          git commit -m "retro: auto-generated for PR #$PR_NUM"
          git push
```

复盘输出模板：
```markdown
# 复盘：[PR Title]（PR #N，TASK-xxx）

**时间**: YYYY-MM-DD  
**自动生成**: GitHub Action pr-retro

## 亮点
- ...

## 踩坑
- ...

## 下次改进
- ...
```
