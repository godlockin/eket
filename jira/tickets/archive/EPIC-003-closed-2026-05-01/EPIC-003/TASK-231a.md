# TASK-231a: docs 安全段回灌 main（5 commit, 无冲突）

## 元数据
- **状态**: todo
- **类型**: docs
- **优先级**: P1
- **agent_type**: docs
- **estimate_hours**: 2
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: 无
- **assigned_experts**: tech-architect

## 背景

原 TASK-231 在 slaver-005 执行时发现：调研报告 §2.3 漏报 `confluence/memory/` 整目录 rename/delete 冲突簇（testing 上 lessons/ 已扁平化 + EPIC-002/003 新增文件，miao 是不同方向的重组）。

为不阻塞 EPIC-003 进度，将原 TASK-231 拆为两半：
- **TASK-231a（本 ticket）**：5 个 confluence/ 无关 commit，纯文档/README/归档协议改动 — 不触发未列明冲突
- **TASK-231b**：3 个 confluence/memory/ 重组 commit — 需 Master 先决冲突矩阵再启动

## 详细描述

回灌范围（5 commit，按时间顺序）：
- `f810a045` 澄清 Vision + 三仓库架构 + 协议规范
- `4a17b9b0` 归档过时协议文档和旧基准报告，加 banner
- `7aee679a` 更新 README + docs/INDEX，归档 node/RELEASE-v2.0.0
- `2d252e5a` 更新 README_zh-CN、THREE-LEVEL-ARCHITECTURE
- `b615aa56` 更新 QUICKSTART、lib/state README，ops 文档加版本注记

注意：必须**跳过** `09c0c1b2` / `6148776a` / `ea752809`（confluence 整目录重组），这 3 个属 TASK-231b。

## 已知冲突（来自调研报告 §2.3）

`f810a045` 含 docs/reference/EKET-PROTOCOL.md add/add 冲突，按 miao 版本为主 + 手动合 main 上独有改动。
其余 4 commit 应无冲突。如遇未列明冲突，立刻 STOP 报告。

## 验收标准

- [ ] AC-1: 5 commit cherry-pick 到 testing，无丢失
- [ ] AC-2: docs/reference/EKET-PROTOCOL.md 唯一存在
- [ ] AC-3: docs/INDEX.md 路径有效（无 404 链接）
- [ ] AC-4: PR body 列出 5 commit hash + EKET-PROTOCOL.md 冲突解决说明
- [ ] AC-5: 不动 confluence/memory/ 任何文件（如有，STOP）

## observability
- logs: ["epic003.docs_safe.backport_completed"]
- metrics: ["docs.commit.backport_count"]

## rollback_plan

revert PR；纯文档无运行时影响。

## test_strategy
- unit: 无
- integration: 检查 docs/INDEX.md 链接有效
- regression: confluence/memory/ 不变（diff 应不含 confluence/memory/）

---

**类型**: Docs (回灌-安全段)
**技能要求**: git cherry-pick
**依赖**: 无
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: docs
estimate_hours: 2
