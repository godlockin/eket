# TASK-231b: confluence/memory/ 重组回灌 main（3 commit, 复杂冲突）

## 元数据
- **状态**: done
- **类型**: docs
- **优先级**: P2
- **agent_type**: docs
- **estimate_hours**: 4
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-231a + Master 冲突矩阵决议
- **assigned_experts**: tech-architect

## 背景

原 TASK-231 拆出。slaver-005 在执行 `09c0c1b2` "整理 confluence/memory/" 时发现 7 个未列明冲突：
- 4 个 rename/delete 簇（lessons/ 目录 testing 上扁平化 vs miao 上不同合并）
- 2 个 modify/delete (memory-index.md / round-22-archon-lessons.md)
- 1 个 content conflict (EKET-PROJECT-HYGIENE.md)

testing 已含 EPIC-002 / EPIC-003 期间新增的：
- `confluence/memory/EPIC-002-pr-closure-lessons.md` (PR #137)
- `confluence/memory/main-miao-debt-investigation.md` (PR #149)
- `confluence/memory/EPIC-002-closure-review.md` (PR #148)
- `confluence/memory/main-miao-debt-investigation.md` (TASK-229 报告，已 merge)

miao 上是**不同方向**的 lessons/ 重组（rename + delete + 拆扁），与 testing 现状**结构不兼容**。

## 阻塞原因

调研报告 §2.3 漏列 confluence/memory/ 冲突簇，需 Master 补充冲突解决矩阵后再启动。

## 待 Master 决策的关键问题

1. **目录结构冲突**：testing 上 `confluence/memory/` 是扁平结构（直接挂文件），miao 上仍在用 `confluence/memory/lessons/` 子目录。**采用哪个**？
   - A: 保留 testing 扁平 → 跳过 miao 上的 rename，只 cherry-pick miao 新增内容到 testing 扁平结构
   - B: 还原 miao 的 lessons/ 子目录 → testing 上现有文件迁移到子目录
2. **modify/delete 冲突**：miao 上删除的 `memory-index.md` 和 `round-22-archon-lessons.md`，testing 上是否还需要？
3. **rename/rename 冲突** (`doc-debt-cleanup.md` ↔ `codebase-maintenance.md`)：用哪个名字？
4. 是否同时需要 backport 旧的 `lessons/` 子目录命名约定？

## 详细描述（待解锁后填）

回灌范围：
- `09c0c1b2` 整理 confluence/memory/ + 重建 memory-index
- `6148776a` confluence 全面整理
- `ea752809` 整理根目录和 docs/

## 验收标准（待 Master 决议后细化）

- [ ] AC-1: Master 提供 confluence/memory/ 冲突解决矩阵（A/B 路径选择 + 7 文件取舍）
- [ ] AC-2: 3 commit 按矩阵 cherry-pick 完成
- [ ] AC-3: testing 上 EPIC-002/003 新增 memory 文件不丢失
- [ ] AC-4: confluence/memory/ 目录结构符合矩阵决议

## observability
- logs: ["epic003.confluence_reorg.backport_completed"]
- metrics: ["confluence.memory.file_count", "confluence.memory.conflict_resolved"]

## rollback_plan

revert PR；nightmare 场景：matrix 决议错误导致 testing 上 EPIC-002 历史经验文件丢失，rollback 即恢复。

## test_strategy
- 待解锁后定

---

**状态**：⛔ BLOCKED ON MASTER DECISION
**触发条件**：Master 在本 ticket 评论里写出 confluence/memory/ 冲突解决矩阵 → 状态改 todo

**类型**: Docs (回灌-复杂段)
**依赖**: TASK-231a + 冲突矩阵
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: docs
estimate_hours: 4
