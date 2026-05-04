---
title: 分支顺序描述错误（miao/main 位置搞反）
category: pitfall
source_ticket: branch-order-audit-2026-05-04
created_at: 2026-05-04
severity: P2
---

# 分支顺序描述错误

## 正确顺序

```
feature/*  →  testing  →  main  →  miao
```

- **testing**：集成测试环境，feature PR 首先合入
- **main**：稳定版本，经 testing 验证后合入
- **miao**：最稳定的对外交付分支（GitHub 默认分支），从 main 同步

## 错误模式

历史上多个文件把 `miao` 和 `main` 写反：

```
# 错误示例（均已修正）
feature/*  →  testing  →  miao  →  main   ← 错（miao/main 反了）
testing  →  miao  →  main                  ← 错（sync 方向反了）
gh pr list --base miao                     ← 错（PR base 应为 testing）
base: testing/miao                         ← 错（模糊，应明确为 testing）
```

## 受影响文件（已修正）

| 文件 | 问题 |
|------|------|
| `README.md` | `testing → miao → main` |
| `scripts/init-three-repos.sh` | `testing → miao → main` |
| `scripts/sync-branches.sh` | header 描述 `main → testing → miao` |
| `confluence/memory/branch-strategy-guide.md` | SOP 起点从 `miao` 开始，sync 方向反 |
| `template/CLAUDE.master.md` | `gh pr list --base miao` |
| `template/CLAUDE.slaver.md` | `base: testing/miao` |

## 根因

早期版本把 `miao` 当"feature 合并目标"（类似 develop 分支），后来升级为"最稳定对外分支"，但文档未同步更新，新写的文档照抄了旧描述。

## 预防

- 新建或修改涉及分支描述的文档时，对照 `branch-strategy-guide.md §1` 核实顺序
- 关键字：`--base miao`、`→ miao →`、`miao → main` — 这几个 pattern 出现必须检查
