---
id: TASK-088
title: P2 docs/archive 建立 INDEX + 过时文档加 DEPRECATED 标记
type: chore
priority: P2
status: done
created_by: Master
created_at: 2026-04-19
dependencies: [TASK-086]
acceptance_criteria:
  - `docs/archive/INDEX.md` 存在，列出所有 61 个文件及状态
  - `MASTER_SLAYER_ROLES.md`、`MASTER-STRATEGY-v2.3.2.md`、`MASTER-STRATEGY-ADJUSTMENT.md` 文件头部有 DEPRECATED 标注
  - `目标设定_v1.md` 和 `目标设定.md` 标明哪个是最新版
  - `.benchmarks/` 加入 `.gitignore`（确认为运行时残留）
  - `docs-site/build/` 加入 `.gitignore`
---

## 需求

### 1. docs/archive/INDEX.md
建立索引文件，每条记录格式：`| 文件名 | 状态(active/deprecated/historical) | 替代文档 | 备注 |`

### 2. 过时文档加 DEPRECATED 头部
在以下文件**最顶部**加入：
```markdown
> ⚠️ **DEPRECATED** — 此文档已过时，当前版本请参考 [替代文档链接]。
```
- `docs/archive/MASTER_SLAYER_ROLES.md` → 替代：`template/docs/MASTER-RULES.md`（同时修正 typo SLAYER→SLAVER）
- `docs/archive/MASTER-STRATEGY-v2.3.2.md` → 替代：`template/docs/MASTER-RULES.md`
- `docs/archive/MASTER-STRATEGY-ADJUSTMENT.md` → 替代：`template/docs/MASTER-RULES.md`
- `docs/archive/目标设定_v1.md` → 标注 v1，替代：`docs/archive/目标设定.md`

### 3. gitignore 补充
```bash
echo '.benchmarks/' >> .gitignore
echo 'docs-site/build/' >> .gitignore
```

## Slaver 完成信息

**领取人**: Slaver
**完成时间**: 2026-04-19
**分支**: feature/TASK-088-archive-index-deprecated

### 实现摘要
1. **gitignore**：确认 `.benchmarks/` 和 `docs-site/build/` 已存在，无需追加
2. **INDEX.md**：扫描 archive 下全部 61 文件（含子目录），按 active/deprecated/historical 分类建立索引
3. **DEPRECATED 标注**：
   - `MASTER_SLAYER_ROLES.md` → deprecated → MASTER-RULES.md（文件内容已使用 SLAVER，无 SLAYER typo）
   - `MASTER-STRATEGY-v2.3.2.md` → deprecated → MASTER-RULES.md
   - `MASTER-STRATEGY-ADJUSTMENT.md` → deprecated → MASTER-RULES.md
   - `目标设定_v1.md` → deprecated → docs/archive/目标设定.md
4. **测试**：`npm test` 结果 1197 passed，2 failed（pre-existing，与本 ticket 无关）

### 验收标准检查
- [x] `docs/archive/INDEX.md` 存在，列出所有文件及状态
- [x] 3 个 MASTER 文档头部有 DEPRECATED 标注
- [x] `目标设定_v1.md` 标注 v1，指向最新版
- [x] `.benchmarks/` 已在 `.gitignore`（已存在）
- [x] `docs-site/build/` 已在 `.gitignore`（已存在）
