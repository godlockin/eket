---
id: TASK-089
title: 归档 docs-site/（删除 Docusaurus 文档站）
type: chore
priority: P1
status: done
created_by: Master
created_at: 2026-04-19
dependencies: []
acceptance_criteria:
  - docs-site/ 目录已删除
  - .gitignore 中 docs-site/ 相关条目清理
  - README.md 和 README_zh-CN.md 更新：移除 docs-site 引用，指向 docs/
  - CONTRIBUTING.md 检查并更新（如有 docs-site 引用）
  - cd node && npm test 全量通过
---

## 需求

docs-site/ 是一个 Docusaurus 文档站，现状：
- 最后更新 2026-04-09，已 10 天未同步，内容落后于 docs/
- 无 CI 自动部署，build/ 产物入了 git
- 342MB node_modules
- 8 个浅层文档在 docs/ 均有更完整替代

决策：彻底归档，文档统一维护在 docs/。

## 实现

```bash
# 1. 删除整个 docs-site 目录
rm -rf docs-site/

# 2. 检查 .gitignore 有无 docs-site 相关条目（有则清理）
grep -n "docs-site" .gitignore

# 3. 更新 README.md / README_zh-CN.md
# 搜索 docs-site、docusaurus 引用并替换为指向 docs/

# 4. 检查 CONTRIBUTING.md / AGENTS.md / CLAUDE.md 是否有引用
grep -r "docs-site\|docusaurus" README.md README_zh-CN.md CONTRIBUTING.md AGENTS.md CLAUDE.md 2>/dev/null
```

## 完成记录

**完成时间**: 2026-04-19
**执行 Slaver**: Slaver

### 实际操作

1. `rm -rf docs-site/` — 删除目录成功
2. `.gitignore` — 删除 4 行 docs-site 相关条目（第 41-44 行）
3. `README.md` / `README_zh-CN.md` — 无 docs-site/docusaurus 引用，无需修改
4. `CONTRIBUTING.md` / `AGENTS.md` / `CLAUDE.md` — 均无引用
5. `docs/roadmap/round10-14-plan.md` — 有历史记录引用，为已完成任务归档，保留不改
6. 测试：`cd node && npm test` — 1199 tests passed, 62 suites

### 验收标准核查

- [x] docs-site/ 目录已删除
- [x] .gitignore 中 docs-site/ 相关条目清理
- [x] README.md 和 README_zh-CN.md 检查（无引用）
- [x] CONTRIBUTING.md 检查（无引用）
- [x] cd node && npm test 全量通过
