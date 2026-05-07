# EKET Documentation Audit — 2026-05-07

## Executive Summary

**Total .md files**: 1,601
**Markdown links**: ~708
**Key issues**:
1. Root clutter: 18 files (should be ≤6)
2. template/docs/ misuse: 43核心文档 (~300K) 被 CLAUDE.md/AGENTS.md 强引用
3. Slaver规则碎片化: 18个 SLAVER-RULES-*.md 文件
4. docs/ vs template/docs/ 职责不清
5. templates/ vs template/ 目录混淆

## Root-Level Documents (18 → 6)

### 保留 (6)
- README.md, README_zh-CN.md
- CLAUDE.md, AGENTS.md
- CHANGELOG.md, CONTRIBUTING.md

### 归档 (12)
**状态报告 (5) → confluence/memory/retrospectives/2026/**:
- FINAL-STATUS.md
- MASTER-FINAL-REPORT.md
- PROJECT-100-PERCENT-COMPLETE.md
- PROJECT-COMPLETION-REPORT.md
- STATUS-SUMMARY.md

**探索报告 (3) → docs/archive/exploration/**:
- EKET-EXPLORATION-REPORT.md
- EXPLORATION_SUMMARY.md
- eket-behavior-equivalence-analysis.md

**Rust 迁移 (3) → docs/archive/rust-migration/**:
- EKET_RUST_REWRITE_SUMMARY.md
- EKET_RUST_REWRITE_VISUAL_ROADMAP.md
- eket-rust-fix-guide.md

**快速参考 (1) → docs/reference/**:
- eket-quick-reference.md

## template/docs/ Analysis

**Total**: 43 files, ~300K

### 被引用情况
- CLAUDE.md: 3处硬引用 (MASTER-RULES.md, SLAVER-RULES.md, EXPERT-PANEL-PLAYBOOK.md)
- AGENTS.md: 3处引用 (心跳checklist, 职责分工)
- 其他文档: ~50+处内部交叉引用

### 建议重组

```
template/docs/ → docs/
├── master/
│   ├── rules.md
│   ├── workflow.md
│   ├── heartbeat-checklist.md
│   ├── pr-review-flow.md
│   └── pr-wait-work.md
├── slaver/
│   ├── rules.md (合并18个 SLAVER-RULES-*.md)
│   ├── heartbeat-checklist.md
│   ├── pr-wait-flow.md
│   └── auto-exec-guide.md
├── protocols/
│   ├── expert-panel-playbook.md
│   ├── gate-review.md
│   ├── communication.md
│   └── loop-heartbeat.md
├── tickets/
│   ├── responsibilities.md
│   ├── template-summary.md
│   └── numbering.md
└── system/
    ├── agent-memory.md
    ├── dynamic-injection.md
    └── settings-permissions.md
```

**需同步更新**:
- CLAUDE.md: 3处路径
- AGENTS.md: 3处路径
- template/docs/ 内部50+交叉引用

## 风险评估

| 操作 | 影响范围 | 风险级别 | 缓解措施 |
|------|---------|---------|---------|
| Root 归档 | 12文件 | 低 | 保留链接，软链接过渡 |
| template/docs 迁移 | 43文件 + 60+引用 | **高** | 分阶段：先复制后删除，全局搜索替换 |
| SLAVER-RULES 合并 | 18文件 → 1文件 | 中 | 保留章节锚点，添加目录 |

## 推荐执行顺序

### Phase 1: Root 清理（低风险）
1. 状态报告归档到 confluence/memory/retrospectives/2026/
2. 探索报告归档到 docs/archive/exploration/
3. Rust 文档归档到 docs/archive/rust-migration/
4. 快速参考移到 docs/reference/

### Phase 2: template/docs 迁移准备
1. 生成完整引用图谱
2. 在 docs/ 建立新结构
3. 复制文件到新位置（保留原文件）
4. 更新 CLAUDE.md/AGENTS.md 引用
5. 测试新引用路径可访问
6. 删除 template/docs/ 旧文件

### Phase 3: SLAVER-RULES 合并
1. 合并18个文件为单一 docs/slaver/rules.md
2. 添加目录和章节锚点
3. 更新所有引用

## Next Steps

1. 用户确认执行计划
2. 执行 Phase 1（预计1次提交）
3. 执行 Phase 2（预计2-3次提交）
4. 执行 Phase 3（预计1次提交）
