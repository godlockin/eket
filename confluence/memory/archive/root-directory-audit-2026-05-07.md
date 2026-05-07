# 根目录相似命名审查总结 — 2026-05-07

## 审查结论

扫描 template*, test*, .worktree* 等相似命名目录，确认必要性。

---

## ✅ 保留（职责明确，无冗余）

### 1. template/ vs templates/

| 目录 | 职责 | 格式 | 使用方 |
|------|------|------|--------|
| `template/` | EKET 框架完整模板 | .md (Markdown) | `eket init` 初始化新项目 |
| `templates/` | 运行时动态模板 | .hbs (Handlebars) | Rust CLI 命令渲染 |

**代码证据**:
```rust
// rust/crates/eket-cli/src/commands/epic_create.rs
let t = dir.path().join("templates/jira");  // 使用 templates/
let c = dir.path().join("templates/confluence");
```

**结论**: ✅ **职责完全不同，必须都保留**
- `templates/` = 运行时模板引擎（9个 .hbs）
- `template/` = 项目初始化框架（16子目录）

### 2. tests/ ✅ 测试套件

**内容**: 5子目录 + 9脚本
- compat/, dry-run/, dual-engine/, fixtures/, integration/
- run-*-tests.sh（单元/集成/压力/烟雾测试）

**结论**: ✅ 核心测试基础设施，保留

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

## 最终根目录结构（已验证无冗余）

```
/
├── template/          ✅ 框架完整模板（eket init 用）
├── templates/         ✅ Handlebars 运行时模板（CLI 渲染用）
├── tests/             ✅ 测试套件
│   └── fixtures/      (已合并 test-fixtures/)
├── docs/              ✅ 项目文档
├── confluence/        ✅ 知识沉淀
├── jira/              ✅ 票据管理
├── node/              ✅ Node 实现
├── rust/              ✅ Rust 实现
├── scripts/           ✅ 项目脚本
└── ...

已删除:
- .worktrees/          ❌ Worktree 残留
- test-fixtures/       ❌ 重复 fixture 目录
```

**根目录现在清爽、职责明确、无冗余！** ✅
