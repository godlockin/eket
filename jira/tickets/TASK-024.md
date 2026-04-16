# TASK-024: PR Review Checklist 补充 4-Level Artifact Verification

**Ticket ID**: TASK-024
**标题**: Master PR Review 强制清单加入 4-level Artifact Verification（借鉴 GSD verifier）
**类型**: improvement
**优先级**: P2

**状态**: pr_review
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**: 2026-04-14T00:00:00+08:00
**completed_at**: 2026-04-14T00:30:00+08:00

**负责人**: slaver
**Slaver**: slaver

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | — | — | ready → gate_review |
| Gate Review APPROVE | gate_reviewer | — | gate_review → in_progress |
| Gate Review VETO | gate_reviewer | — | gate_review → analysis |
| 提交 Review | — | — | in_progress → pr_review |
| Review 通过 | — | — | pr_review → done |

---

## 1. 任务描述

借鉴 GSD 的 **4-level Artifact Verification** 框架，加强 EKET Master PR review 流程。

GSD verifier 不满足于"测试通过"，要求逐级验证：
1. **Existence**：产物文件存在？
2. **Substantive**：是真实实现还是空壳/stub？
3. **Wired**：被正确引用/导入/调用？
4. **Data-Flow**：真实数据能流经此路径？（非仅靠 mock）

当前 EKET 的 Master PR review checklist（在 `CLAUDE.md` 的"PR Review 强制 checklist"）只有 4 项，主要防止伪造测试结果，但没有系统性的产物验证框架。

### 具体改动

**Part A — `CLAUDE.md`（项目级）**

在现有"PR Review 强制 checklist"之后，新增"4-Level Artifact Verification"子段落：

```markdown
**4-Level Artifact Verification（代码类 PR 必须通过全部 4 级）**：
- [ ] **L1 存在性**：新增/修改的文件确实存在于 PR diff 中（非仅修改注释或 TODO）
- [ ] **L2 实质性**：实现是真实逻辑，不是空函数体、占位 stub、或 `return undefined`
- [ ] **L3 接线正确**：新代码被正确 import/export/注册（孤立的文件不算完成）
- [ ] **L4 数据流动**：关键路径有集成/端到端测试验证真实数据流经（非纯 mock 链）

L1-L3 缺任何一项 = 直接 reject。L4 不适用于纯文档/配置类 PR。
```

**Part B — `template/docs/MASTER-HEARTBEAT-CHECKLIST.md`**

在"PR Review 检查"章节加入 4-level 清单，并补充说明每级的判断标准和常见反例。

**Part C — `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md`**

在现有 PR 模板里加入 4-level checklist，让 PR 提交者（Slaver）自检：

```markdown
## Artifact Verification (4-Level)

- [ ] L1 存在性：所有声称新增/修改的文件在 diff 中可见
- [ ] L2 实质性：无空函数体、无纯占位 stub（如有特殊原因请说明）
- [ ] L3 接线：新增模块已被正确 import/注册/export
- [ ] L4 数据流：核心路径有非纯-mock 的测试（如不适用请注明原因）
```

---

## 2. 验收标准

- [ ] `CLAUDE.md` 包含 4-Level Artifact Verification 说明；验证：`grep -c 'L1\|L2\|L3\|L4' CLAUDE.md`
- [ ] `template/docs/MASTER-HEARTBEAT-CHECKLIST.md` 包含 4-level 清单；验证：`grep -c '4-Level\|L1 存在' template/docs/MASTER-HEARTBEAT-CHECKLIST.md`
- [ ] `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md` 包含 Artifact Verification section；验证：`grep -l 'Artifact Verification' .github/PULL_REQUEST_TEMPLATE/pull_request_template.md`
- [ ] 新增内容与现有 checklist 无重复项，逻辑一致；验证：人工阅读确认（在 PR 描述里附相关段落截图/文本）
- [ ] `npm test` 1109+ 全部通过（纯文档改动，不影响 Node 测试）；验证：`cd node && npm test 2>&1 | tail -5`

---

## 3. 技术方案

改动均为 Markdown 文档，无代码修改。

**注意事项**：
- `CLAUDE.md` 现有"PR Review 强制 checklist（缺任何一项 = 直接 reject）"中已有 4 项。新增 4-level verification 作为独立子段，不替换现有项
- MASTER-HEARTBEAT-CHECKLIST.md 补充时需与现有"防幻觉"检查项对齐，L2（实质性）对应当前"禁止伪造测试结果"，L4 对应"禁止 mock 替代真实验证"——需说明层级关系，避免重复
- PR 模板新增 checklist 项后，Slaver 提交 PR 时可见，有自检效果

---

## 4. 影响范围

- `CLAUDE.md` — 新增 4-level verification 段落
- `template/docs/MASTER-HEARTBEAT-CHECKLIST.md` — PR review 章节扩充
- `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md` — 新增 checklist section

---

## 5. blocked_by

无依赖，可立即开始。与 TASK-023/025/026 完全独立，可并行。

---

## 6. 执行报告

**Slaver**: slaver
**started_at**: 2026-04-14T00:00:00+08:00
**completed_at**: 2026-04-14T00:30:00+08:00

### 测试结果

```
Test Suites: 44 passed, 44 total
Tests:       1109 passed, 1109 total
Snapshots:   0 total
Time:        10.597 s
Ran all test suites.
```

### 构建结果

纯文档改动，无需构建。

### 验收标准验证

- [x] `CLAUDE.md` L1-L4 匹配数: 5 (`grep -c 'L1\|L2\|L3\|L4' CLAUDE.md` → 5)
- [x] `template/docs/MASTER-HEARTBEAT-CHECKLIST.md` 包含 4-level 表格和关系说明
- [x] `.github/PULL_REQUEST_TEMPLATE/pull_request_template.md` 包含 Artifact Verification section
- [x] 新增内容与现有 checklist 不重复，L2 对应"禁止伪造测试结果"，L4 对应"禁止 mock 替代真实验证"，已在 HEARTBEAT-CHECKLIST 中明确说明层级关系
- [x] `npm test` 1109/1109 全部通过

### 实现说明

**Part A（CLAUDE.md）**：在"PR Review 强制 checklist"段落正文之后、`> 使用其他大模型`提示之前，插入独立的 4-Level Artifact Verification 子段落，保留原有 4 项不变。

**Part B（MASTER-HEARTBEAT-CHECKLIST.md）**：在"快速检查（空闲模式）"章节的 `### □ PR 队列检查` 之前插入新章节 `### □ PR Review：4-Level Artifact Verification`，包含 4 级对照表和与现有防幻觉规则的映射说明。

**Part C（pull_request_template.md）**：在"变更描述"和"验证证据"之间插入 `## Artifact Verification (4-Level)` section，让 Slaver 提 PR 时先自检 4 级。

**分支**: `feature/TASK-024-artifact-verification`
