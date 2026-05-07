# 根目录相似命名审查总结 — 2026-05-07

## 审查结论

扫描 template*, test*, .worktree* 等相似命名目录，确认必要性。

---

## ✅ 保留（职责明确）

| 目录 | 职责 | 说明 |
|------|------|------|
| `template/` | EKET 框架完整模板 | 供 `eket init` 复制到新项目 |
| `templates/` | Handlebars 动态模板 | .hbs 文件，代码生成用 |
| `tests/` | 测试套件 | 单元/集成/压力/烟雾测试 |

**对比**: template/ vs templates/ — 完整模板 vs 动态模板（职责不同）

---

## ✅ 已清理

### 1. .worktrees/TASK-273/
- Worktree 孤立残留
- 代码已在主分支（db_recover.rs）
- 强制删除 worktree 和分支

### 2. test-fixtures/
- 合并到 tests/fixtures/
- 删除重复根级目录

---

## 数据整合结论

**子模块 .eket/ DB 审查**:
- node/.eket.bak/eket.db (20K) — 仅1表，空数据
- rust/.eket.bak/eket.db (92K) — 9表，空数据  
- **主 DB**: ~/.eket/data/sqlite/eket.db (372K, 227条) ✅

**结论**: 子模块 DB 无实质数据，**无需 merge**

---

**根目录现在清爽、职责明确！** ✅
