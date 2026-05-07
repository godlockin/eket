# EKET Documentation Audit — 2026-05-07（最终版）

## 重要澄清

**template/** vs **templates/** vs **docs/**:
- `template/` = **EKET 框架完整模板**（新项目 `eket init` 复制的源）
- `templates/` = **Handlebars 模板文件**（.hbs，动态生成用）
- `docs/` = **EKET 项目自身文档**（设计、架构、ADR）

**核心结论**: template/docs/ **不应移动**，它是框架规范模板，非项目文档。

---

## 问题分类与建议

### ✅ Phase 1: Root 清理（低风险，推荐执行）

**归档 12 文件**:

**状态报告 (5) → confluence/memory/retrospectives/2026/**:
```bash
git mv FINAL-STATUS.md confluence/memory/retrospectives/2026/05-final-status.md
git mv MASTER-FINAL-REPORT.md confluence/memory/retrospectives/2026/05-master-final-report.md
git mv PROJECT-100-PERCENT-COMPLETE.md confluence/memory/retrospectives/2026/05-project-100-percent-complete.md
git mv PROJECT-COMPLETION-REPORT.md confluence/memory/retrospectives/2026/05-project-completion-report.md
git mv STATUS-SUMMARY.md confluence/memory/retrospectives/2026/05-status-summary.md
```

**探索报告 (3) → docs/archive/exploration/**:
```bash
mkdir -p docs/archive/exploration
git mv EKET-EXPLORATION-REPORT.md docs/archive/exploration/
git mv EXPLORATION_SUMMARY.md docs/archive/exploration/
git mv eket-behavior-equivalence-analysis.md docs/archive/exploration/
```

**Rust 迁移 (3) → docs/archive/rust-migration/** (已存在):
```bash
git mv EKET_RUST_REWRITE_SUMMARY.md docs/archive/rust-migration/
git mv EKET_RUST_REWRITE_VISUAL_ROADMAP.md docs/archive/rust-migration/
git mv eket-rust-fix-guide.md docs/archive/rust-migration/
```

**快速参考 (1) → docs/reference/**:
```bash
git mv eket-quick-reference.md docs/reference/
```

**结果**: Root 18 → 6 文件 (-67%)

**风险**: ✅ 低（无外部引用）  
**预计**: 1 次提交

---

### ❌ Phase 2: template/docs/ 迁移（已取消）

**理由**: 
- template/docs/ = **框架文档模板**（供 `eket init` 复制到新项目）
- 职责正确，不应移动到 docs/
- CLAUDE.md 引用 `template/docs/MASTER-RULES.md` 是正确的（指向框架规范）

**正确理解**:
| 问题 | 之前判断 | 修正后 |
|------|---------|--------|
| template/docs/ 位置 | ❌ 错误，应移到 docs/ | ✅ 正确，保持原位 |
| SLAVER-RULES碎片化 | ❌ 应合并 | ✅ 框架模块化合理 |
| CLAUDE.md 引用 | ⚠️ 需更新 | ✅ 引用正确无需改 |

**实际缺失**: docs/ 缺少 **EKET 项目自身**的实现设计文档（非框架文档）

---

### 🔍 Phase 3: docs/ 内容审查（可选）

**当前 docs/ 结构**:
```
docs/
├── adr/              ✅ 架构决策记录
├── architecture/     ✅ 架构设计
├── archive/          ✅ 历史文档
├── getting-started/  ✅ 入门指南
├── guides/           ✅ 操作指南
├── ops/              ✅ 运维文档
├── performance/      ✅ 性能文档
├── reference/        ✅ 参考文档
├── reviews/          ⚠️ 评审记录（应合并到 confluence/retrospectives/？）
├── roadmap/          ✅ 路线图
└── troubleshooting/  ✅ 故障排查
```

**潜在优化**:
1. `docs/reviews/` → `confluence/memory/retrospectives/` （统一复盘位置）
2. `docs/THREE-REPO-DEPLOYMENT.md` → `docs/architecture/` 或 `docs/ops/`
3. 补充 EKET 自身实现设计（如：Master/Slaver Rust 实现细节）

**优先级**: 低（现有结构合理）

---

### 📊 Phase 4: jira/ 优化（可选）

**当前**:
```
jira/
├── archive/         (已归档 ticket)
├── decisions/       (决策记录)
├── epics/           (EPIC)
├── templates/       (模板)
├── tickets/         (357个 ticket)
└── TICKET-NUMBERING.md
```

**潜在优化**:
1. `TICKET-NUMBERING.md` → `templates/` 或 `docs/reference/`
2. `decisions/` → `docs/adr/` （统一决策记录）
3. `tickets/` 按年份/状态分类（避免单目录357文件）

**风险**: 中（ticket路径引用多）  
**优先级**: 低（不影响使用）

---

## 推荐执行方案

### 立即执行: Phase 1 Root 清理

**原因**:
- ✅ 低风险（无外部引用）
- ✅ 高收益（Root清爽 67%）
- ✅ 单次提交完成

**步骤**:
```bash
# 1. 创建目标目录
mkdir -p docs/archive/exploration

# 2. 移动文件（见上方命令）

# 3. 验证
ls -1 *.md | grep -E "FINAL|EXPLORATION|RUST|quick-reference"  # 应为空

# 4. 提交
git add -A
git commit -m "refactor(docs): 归档 Root 级文档 (12→0)

- 状态报告 → confluence/retrospectives/2026/
- 探索报告 → docs/archive/exploration/
- Rust 迁移 → docs/archive/rust-migration/
- 快速参考 → docs/reference/

Root markdown files: 18 → 6 (-67%)
"
```

### 暂缓执行: Phase 2~4

**原因**:
- Phase 2 已取消（template/docs/ 职责正确）
- Phase 3~4 优化收益低，可后续按需执行

---

## 风险评估更新

| Phase | 操作 | 风险 | 修正 |
|-------|------|------|------|
| 1 | Root归档 | ✅ 低 | 无引用，安全 |
| 2 | template/docs迁移 | ❌ 已取消 | 职责正确，无需改 |
| 3 | docs/reviews合并 | 🟡 中 | 需评估引用 |
| 4 | jira/重组 | 🟡 中 | 需评估引用 |

---

## 总结

**已完成** ✅:
- confluence/memory/ 重组（2次提交）
- 文档职责澄清（template/ vs docs/）

**推荐执行** 🎯:
- Phase 1: Root 清理（1次提交，低风险）

**无需执行** ❌:
- template/docs/ 迁移（职责正确）
- SLAVER-RULES 合并（框架模块化合理）

**可选优化** 🔵:
- docs/reviews/ 合并到 confluence/
- jira/tickets/ 分类归档
- 补充 EKET 自身实现设计文档

---

**Next Steps**: 用户确认执行 Phase 1？
