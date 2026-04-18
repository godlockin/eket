---
id: TASK-061
title: "fix(scripts): phase-summary.sh retro 范围 Bug + COMMIT_COUNT 修复"
priority: P2
status: ready
assignee: devops_dev
dispatched_by: master
created_at: 2026-04-18
---

## 背景

`scripts/phase-summary.sh` 存在两处 Bug：

### Bug-1: retro 文件不过滤范围

```bash
RETRO_FILES=$(find "$REPO_ROOT/confluence/memory/retrospectives" \
  -type f -name '*.md' ! -name 'README.md' | sort)
```
收集全部历史 retro，与 `from_ref..to_ref` 参数无关，Phase-N 总结包含所有历史数据。

修复：改用 `git log --diff-filter=A --name-only` 过滤 from..to range 内新增的 retro 文件。

### Bug-2: 空 range 时 COMMIT_COUNT=1

```bash
COMMIT_COUNT=$(printf '%s\n' "$COMMIT_LOG" | grep -c . || true)
```
当 range 为空时 `COMMIT_LOG="(empty range)"`，`grep -c .` 返回 1 而非 0。

## 验收标准

- [ ] Bug-1：retro 文件列表只包含 `${FROM_REF}..${TO_REF}` range 内新增的文件
- [ ] Bug-2：空 range 时 `COMMIT_COUNT=0`
- [ ] `bash -n scripts/phase-summary.sh` 通过
- [ ] shellcheck `--severity=error` 无新增错误
