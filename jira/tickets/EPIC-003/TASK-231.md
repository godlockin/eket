# TASK-231: docs / Confluence 重组回灌 main

## 元数据
- **状态**: todo
- **类型**: docs
- **优先级**: P1
- **agent_type**: docs
- **estimate_hours**: 3
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-230
- **assigned_experts**: tech-architect

## 背景

EPIC-003 第 2 步。miao 上 docs / Confluence 重组段（约 6 commit）含归档动作 + 路径重命名，回灌时会触发**4 个 rename/add/delete 冲突**（见 TASK-229 §2.3）。

## 详细描述

回灌范围（按 hash）：
- `f810a045` 澄清 Vision + 三仓库架构
- `09c0c1b2` 整理 confluence/memory/ + 重建 memory-index
- `6148776a` confluence 全面整理
- `ea752809` 整理根目录和 docs/
- `7aee679a` 更新 README + docs/INDEX，归档 node/RELEASE-v2.0.0
- `2d252e5a` 更新 README_zh-CN、THREE-LEVEL-ARCHITECTURE
- `4a17b9b0` 归档过时协议文档
- `b615aa56` QUICKSTART / lib/state README

## 冲突处理（§2.3 中 4 文件）

| 文件 | 冲突类型 | 解决策略 |
|------|----------|----------|
| `docs/archive/roadmap-history/EKET-ROADMAP-2026-Q2-Q4.md` | UA rename/rename | 采用 miao 归档路径 |
| `docs/plans/active/EKET-ROADMAP-2026-Q2-Q4.md` | DD 双方都删 | 双删确认 |
| `docs/reference/EKET-PROTOCOL.md` | AA add/add | 内容 diff 比对，miao 版本为准 + 手动合 main 上独有改动 |
| `docs/roadmap/EKET-ROADMAP-2026-Q2-Q4.md` | AU rename/rename | main 归档路径作废，统一 miao |

## 验收标准

- [ ] AC-1: 8 docs commit cherry-pick 到 testing
- [ ] AC-2: 4 个冲突文件全部解决，`git status` clean
- [ ] AC-3: `docs/reference/EKET-PROTOCOL.md` 唯一存在（不在 active / archive 重复）
- [ ] AC-4: `confluence/memory/memory-index.md` 重建后所有链接 200（`bash scripts/check-memory-links.sh` 全绿）
- [ ] AC-5: PR body 列出原 8 commit hash + 4 冲突解决说明

## observability
- logs: ["epic003.docs.backport_completed"]
- metrics: ["docs.conflict.resolved_count"]

## rollback_plan

revert PR；docs 改动无运行时影响，但 confluence/memory/ 索引会回到旧版本，可接受。

## test_strategy
- unit: 无
- integration: scripts/check-memory-links.sh
- regression: 检查 docs/INDEX.md 路径有效

---

**类型**: Docs (回灌)
**技能要求**: git / docs 重构 / 冲突解决
**依赖**: TASK-230
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: docs
estimate_hours: 3
