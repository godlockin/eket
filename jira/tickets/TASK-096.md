# TASK-096: CHANGELOG 自动化 + alpha 标签毕业计划

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P2
- **负责人**: Slaver
- **创建时间**: 2026-04-19
- **依赖**: TASK-094（P0 测试修复后）

## 背景

v2.9.0-alpha → v2.13.1 跨越 4 个 minor，无 CHANGELOG，
外部用户无法判断升级风险。`alpha` 标签持续存在是流程问题而非功能问题。

## 验收标准

1. `CHANGELOG.md`（项目根）存在，包含 v2.9.0 至 v2.13.1 的变更摘要
2. `node/package.json` 中版本号去掉 `-alpha` 后缀（升为 `2.13.1` 或 `2.14.0-beta`）
3. `.github/workflows/ci.yml` 新增 release job：tag push 时自动更新 CHANGELOG
4. `docs/roadmap/` 新增 `RELEASE-POLICY.md`，说明版本号规范和 alpha→beta→stable 毕业条件

## 实现方案

### Part A：手写 CHANGELOG（v2.9~v2.13）

从 git log 和 jira/tickets/ 整理：
```bash
git log --oneline --no-merges v2.9.0..HEAD | head -50
ls jira/tickets/ | xargs grep -l "状态.*done" | sort
```

CHANGELOG 格式（Keep a Changelog 规范）：
```markdown
# Changelog

## [2.13.1] - 2026-04-19
### Changed
- docs/ conference-style 重组（TASK-090~093）

## [2.12.x] - 2026-04-19
### Fixed
- 8 断路修复（TASK-076~083）
...
```

### Part B：package.json 版本毕业

```json
"version": "2.14.0-beta"
```

毕业条件确认：
- ✅ 1197/1199 测试通过（TASK-094 修复后 1199/1199）
- ✅ docs/ 结构清洁
- ✅ memory/ 机制建立（TASK-095）
- ⬜ sdk/ 类型评估（TASK-097，非阻塞）

### Part C：release CI（轻量版）

在 `.github/workflows/ci.yml` 新增：
```yaml
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify CHANGELOG updated
        run: grep -q "${{ github.ref_name }}" CHANGELOG.md
```

### Part D：RELEASE-POLICY.md

记录：
- alpha：内部使用，API 可能破坏性变更
- beta：外部可试用，主要 API 稳定
- stable：生产可用，向后兼容保证
- 毕业标准：测试全绿 + docs 清洁 + memory 活跃

## 执行命令

```bash
git log --oneline v2.9.0..HEAD | grep -v "Merge" | head -60
cat node/package.json | grep version
```
