# EKET 文档归并计划

**创建日期**: 2026-04-07
**目标**: 整理重复文档，建立清晰的文档结构
**状态**: 🔄 进行中

---

## 🎯 归并原则

1. **单一来源原则** (Single Source of Truth)
   - 每类信息只在一个地方维护
   - 其他地方通过链接引用

2. **历史保留原则**
   - 重要的历史文档归档而非删除
   - 保留版本演进轨迹

3. **清晰分类原则**
   - 按文档类型分类（指南/报告/参考等）
   - 按状态分类（活跃/归档/草稿等）

---

## 📦 归并任务清单

### 任务 1: 审查报告归并

**问题**:
存在 3 个审查报告，内容部分重复，造成维护混乱。

**当前状态**:
```
docs/
├── DOCUMENTATION_AUDIT_REPORT.md        (744 行, 第一版)
├── DOCUMENTATION_AUDIT_REPORT_V2.md     (637 行, 修正版)
└── audit/
    └── ROUND2-DOCUMENTATION-AUDIT.md    (本轮审查, 最新)
```

**归并方案**:
```
docs/
├── audit/                                      # 🆕 审查报告目录
│   ├── ROUND2-DOCUMENTATION-AUDIT.md          # ✅ 保留 (最新)
│   ├── documentation-issues.md                # ✅ 保留 (问题清单)
│   ├── merge-plan.md                          # ✅ 保留 (本文件)
│   └── README.md                              # 🆕 审查报告索引
└── archive/
    └── audit-history/                         # 🆕 历史审查报告
        ├── 2026-04-07-audit-report-v1.md      # 📦 归档
        └── 2026-04-07-audit-report-v2.md      # 📦 归档
```

**执行动作**:
- [ ] 创建 `docs/archive/audit-history/` 目录
- [ ] 重命名并移动旧报告
  - `DOCUMENTATION_AUDIT_REPORT.md` → `archive/audit-history/2026-04-07-audit-report-v1.md`
  - `DOCUMENTATION_AUDIT_REPORT_V2.md` → `archive/audit-history/2026-04-07-audit-report-v2.md`
- [ ] 在旧报告顶部添加归档标记
- [ ] 创建 `docs/audit/README.md` 索引

**影响评估**: ✅ 低风险（旧报告归档，不影响当前使用）

---

### 任务 2: 测试报告归并

**问题**:
测试报告分散在根目录和 `docs/test-reports/`，缺少统一管理。

**当前状态**:
```
/ (根目录)
├── TEST_FAILURE_ANALYSIS.md                    (测试失败分析)
├── TEST_FIX_FINAL_REPORT.md                    (测试修复报告)
└── fix-jest-imports.md                          (临时文档)

docs/test-reports/
├── 2026-04-07-http-server-test-report.md       (HTTP Server 测试)
└── TASK-004-EXECUTION-SUMMARY.md               (任务执行总结)
```

**归并方案**:
```
docs/test-reports/
├── INDEX.md                                     # 🆕 测试报告索引
├── 2026-04-07-http-server-test-report.md       # ✅ 保留
├── 2026-04-07-test-failure-analysis.md          # 📦 从根目录移动
├── 2026-04-07-test-fix-final-report.md          # 📦 从根目录移动
├── TASK-004-execution-summary.md                # ✅ 保留（重命名）
└── archive/
    └── 2026-04-07-jest-import-fix.md            # 📦 归档临时文档
```

**执行动作**:
- [ ] 移动根目录测试报告到 `docs/test-reports/`
  - `TEST_FAILURE_ANALYSIS.md` → `docs/test-reports/2026-04-07-test-failure-analysis.md`
  - `TEST_FIX_FINAL_REPORT.md` → `docs/test-reports/2026-04-07-test-fix-final-report.md`
- [ ] 归档临时文档
  - `fix-jest-imports.md` → `docs/test-reports/archive/2026-04-07-jest-import-fix.md`
- [ ] 统一命名格式（小写，使用连字符）
  - `TASK-004-EXECUTION-SUMMARY.md` → `TASK-004-execution-summary.md`
- [ ] 创建 `docs/test-reports/INDEX.md`

**影响评估**: ✅ 低风险（只是移动位置，内容不变）

---

### 任务 3: 状态报告归并

**问题**:
存在多个状态报告，内容部分重复，缺少明确的主报告。

**当前状态**:
```
docs/
├── STATUS_REPORT.md                  (441 行, v2.1.0, 进度报告)
├── EKET_COMPLETION_REPORT.md         (完成报告)
├── PROJECT_REVIEW_REPORT.md          (项目审查报告)
└── BUG_FIXES_2026-04-07.md           (Bug 修复报告)
```

**归并方案**:
```
docs/
├── STATUS_REPORT.md                           # ✅ 保留（主状态报告，更新到 v2.2.0）
├── reports/                                   # 📂 各类报告目录
│   ├── README.md                              # 🆕 报告索引
│   ├── bug-fixes-2026-04-07.md                # 📦 移动（重命名）
│   ├── parallel-execution-completion-report.md  # ✅ 已存在
│   ├── agent-2-completion-report.md           # ✅ 已存在
│   └── agent3-http-security-completion-report.md  # ✅ 已存在
└── archive/
    └── status-history/                        # 🆕 历史状态报告
        ├── 2026-04-07-completion-report.md    # 📦 归档
        └── 2026-04-07-project-review.md       # 📦 归档
```

**执行动作**:
- [ ] 更新 `docs/STATUS_REPORT.md` 版本到 v2.2.0
- [ ] 创建 `docs/archive/status-history/` 目录
- [ ] 归档重复的状态报告
  - `EKET_COMPLETION_REPORT.md` → `archive/status-history/2026-04-07-completion-report.md`
  - `PROJECT_REVIEW_REPORT.md` → `archive/status-history/2026-04-07-project-review.md`
- [ ] 移动 Bug 修复报告到 `docs/reports/`
  - `BUG_FIXES_2026-04-07.md` → `docs/reports/bug-fixes-2026-04-07.md`
- [ ] 创建 `docs/reports/README.md` 索引

**影响评估**: ✅ 低风险（保留主报告，其他归档）

---

### 任务 4: 计划文档重组

**问题**:
`docs/plans/` 混合了新旧计划，缺少状态标记。

**当前状态**:
```
docs/plans/
├── 2026-03-26-file-structure-and-excellence-gap.md    (旧)
├── 2026-03-31-multi-agent-patterns-design.md          (旧)
├── 2026-04-06-optimization-loop-design.md             (旧)
├── 2026-04-07-phase-b-http-server.md                  (Phase B 计划)
├── 2026-04-07-phase-b-completed.md                    (Phase B 完成)
├── 2026-04-07-roadmap-analysis.md                     (路线图分析)
├── 2026-04-07-sprint1-kanban.md                       (Sprint 1 看板)
├── PARALLEL_EXECUTION_BOARD.md                        (Round 2 看板)
├── containerization-deployment-audit-report.md        (容器化审查)
└── v0.9.1-improvement-plan.md                         (v0.9.1 改进计划)
```

**归并方案**:
```
docs/plans/
├── README.md                                          # 🆕 计划文档索引
├── active/                                            # 🆕 进行中的计划
│   ├── PARALLEL_EXECUTION_BOARD.md                    # 📦 移动 (Round 2)
│   └── 2026-04-07-sprint1-kanban.md                   # 📦 移动
├── completed/                                         # 🆕 已完成的计划
│   ├── 2026-04-07-phase-b-http-server.md              # 📦 移动
│   ├── 2026-04-07-phase-b-completed.md                # 📦 移动
│   └── 2026-04-07-roadmap-analysis.md                 # 📦 移动
└── archive/                                           # ✅ 已存在（旧计划归档）
    ├── v0.9.1-improvement-plan.md                     # ✅ 已归档
    ├── 2026-03-26-file-structure-and-excellence-gap.md  # 📦 移动
    ├── 2026-03-31-multi-agent-patterns-design.md       # 📦 移动
    ├── 2026-04-06-optimization-loop-design.md          # 📦 移动
    └── containerization-deployment-audit-report.md     # 📦 移动
```

**执行动作**:
- [ ] 创建 `docs/plans/active/` 目录
- [ ] 创建 `docs/plans/completed/` 目录
- [ ] 移动活跃计划到 `active/`
- [ ] 移动已完成计划到 `completed/`
- [ ] 移动旧计划到 `archive/`
- [ ] 创建 `docs/plans/README.md` 索引

**影响评估**: ✅ 低风险（只是重组目录结构）

---

### 任务 5: 临时文档清理

**问题**:
项目中存在临时文档，缺少清理机制。

**当前状态**:
```
/ (根目录)
├── fix-jest-imports.md           (Jest 导入修复，临时文档)
├── TEST_FAILURE_ANALYSIS.md      (已在任务 2 处理)
└── TEST_FIX_FINAL_REPORT.md      (已在任务 2 处理)

docs/
├── LARGE_FILES_REVIEW.md         (大文件审查，临时性质)
└── DOCUMENTATION_REVIEW_CHECKLIST.md  (Round 1 检查清单，已过时)
```

**归并方案**:
```
docs/
├── archive/
│   ├── temp/                              # 🆕 临时文档归档
│   │   ├── 2026-04-07-large-files-review.md  # 📦 归档
│   │   └── 2026-04-07-jest-import-fix.md     # 📦 归档
│   └── audit-history/
│       └── round1-review-checklist.md     # 📦 归档
```

**执行动作**:
- [ ] 创建 `docs/archive/temp/` 目录
- [ ] 归档临时文档
  - `fix-jest-imports.md` → `docs/archive/temp/2026-04-07-jest-import-fix.md`
  - `docs/LARGE_FILES_REVIEW.md` → `docs/archive/temp/2026-04-07-large-files-review.md`
  - `docs/DOCUMENTATION_REVIEW_CHECKLIST.md` → `docs/archive/audit-history/round1-review-checklist.md`

**影响评估**: ✅ 低风险（归档不常用的临时文档）

---

## 📊 归并统计

| 任务 | 移动文件数 | 创建文件数 | 删除文件数 | 状态 |
|------|-----------|-----------|-----------|------|
| 任务 1: 审查报告归并 | 2 | 2 | 0 | ⏳ 待执行 |
| 任务 2: 测试报告归并 | 3 | 1 | 0 | ⏳ 待执行 |
| 任务 3: 状态报告归并 | 3 | 2 | 0 | ⏳ 待执行 |
| 任务 4: 计划文档重组 | 9 | 1 | 0 | ⏳ 待执行 |
| 任务 5: 临时文档清理 | 3 | 1 | 0 | ⏳ 待执行 |
| **总计** | **20** | **7** | **0** | - |

---

## 🗓️ 执行时间线

### Phase 1: 创建目录结构 (15 分钟)
- [ ] 创建所有新目录
- [ ] 创建占位 README 文件

### Phase 2: 移动和重命名 (30 分钟)
- [ ] 执行文件移动操作
- [ ] 统一文件命名格式

### Phase 3: 更新索引和引用 (30 分钟)
- [ ] 创建各目录的 INDEX/README
- [ ] 更新文档内部链接
- [ ] 在旧位置添加重定向说明

### Phase 4: 验证 (15 分钟)
- [ ] 检查所有链接有效性
- [ ] 验证目录结构正确性
- [ ] 确认没有断裂的引用

**总计时间**: ~90 分钟

---

## 🎯 归并后的目录结构

```
docs/
├── INDEX.md                          # 🆕 统一文档入口
├── README.md                         # ✅ 文档说明（已更新）
├── STATUS_REPORT.md                  # ✅ 主状态报告（已更新到 v2.2.0）
├── 01-getting-started/               # ✅ 入门指南
├── 02-architecture/                  # ✅ 架构设计
├── 03-implementation/                # ✅ 实现细节
├── 04-testing/                       # ✅ 测试文档
├── 05-reference/                     # ✅ 参考资料
├── 06-sop/                           # ✅ 标准操作流程
├── protocol/                         # ✅ EKET 协议规范
├── plans/                            # 📂 计划文档（重组）
│   ├── README.md                     # 🆕 计划索引
│   ├── active/                       # 🆕 进行中
│   ├── completed/                    # 🆕 已完成
│   └── archive/                      # ✅ 已归档
├── test-reports/                     # ✅ 测试报告（整合）
│   ├── INDEX.md                      # 🆕 测试报告索引
│   └── archive/                      # 🆕 归档
├── reports/                          # ✅ 各类报告（整合）
│   └── README.md                     # 🆕 报告索引
├── audit/                            # ✅ 审查报告
│   ├── ROUND2-DOCUMENTATION-AUDIT.md # ✅ 本轮审查
│   ├── documentation-issues.md       # ✅ 问题清单
│   ├── merge-plan.md                 # ✅ 本文件
│   └── README.md                     # 🆕 审查报告索引
├── archive/                          # 📂 历史归档（扩展）
│   ├── v0.x/                         # ✅ v0.x 版本文档
│   ├── audit-history/                # 🆕 历史审查报告
│   ├── status-history/               # 🆕 历史状态报告
│   ├── temp/                         # 🆕 临时文档
│   └── plans/                        # ✅ 旧版计划
├── adr/                              # ✅ 架构决策记录
├── api/                              # ✅ API 文档
├── performance/                      # ✅ 性能文档
├── troubleshooting/                  # ✅ 故障排查
├── developer/                        # ✅ 开发者指南
└── ops/                              # ✅ 运维指南
```

---

## ✅ 验收标准

归并完成后，应满足以下标准：

1. **单一来源**
   - [ ] 每类信息只在一个地方维护
   - [ ] 无重复内容（除归档外）

2. **清晰分类**
   - [ ] 所有文档都在合适的目录中
   - [ ] 目录结构符合逻辑

3. **易于导航**
   - [ ] 每个目录都有 README/INDEX
   - [ ] 文档间有清晰的链接

4. **历史可追溯**
   - [ ] 重要的历史文档已归档
   - [ ] 归档文档有明确的日期标记

5. **无断裂链接**
   - [ ] 所有内部链接有效
   - [ ] 旧位置有重定向说明

---

**归并计划创建时间**: 2026-04-07
**预计完成时间**: 2026-04-07（本日）
**执行者**: Slaver E (Technical Writer)
**状态**: ✅ 计划完成，待执行
