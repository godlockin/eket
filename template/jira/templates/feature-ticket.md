# Feature Ticket: FEAT-{{SEQUENCE_NUMBER}} - {{FEATURE_TITLE}}

**创建时间**: {{CREATE_DATE}}
**创建者**: Master Agent
**重要性**: critical | high | medium | low
**优先级**: P0 | P1 | P2 | P3
**状态**: backlog
**标签**: `feature`, `{{MODULE_TAG}}`
**Epic**: {{EPIC_ID}}
**分配给**: null

<!-- dispatched_by: Master 的 GitHub handle，pr-reviewer-check Action 用此判定自我闭环；不得与 PR 作者相同 -->
dispatched_by: null

---

## 0. 任务元数据

### 0.1 重要性说明
<!--
critical: 关键业务功能，阻塞其他任务
high: 重要功能，影响核心体验
medium: 一般功能，提升用户体验
low: 优化类功能，可选
-->

### 0.2 优先级说明
<!--
P0: 紧急缺陷，生产事故
P1: 高优先级功能
P2: 正常优先级
P3: 低优先级
-->

### 0.3 依赖关系
```yaml
blocks: []  # 本任务阻塞的任务
blocked_by: []  # 本任务依赖的任务
related: []  # 相关任务，可并行开发
external: []  # 外部依赖（如：等待 API 文档、第三方服务）
```

### 0.4 背景信息
**业务背景**：<!-- 为什么要做这件事？用户/业务痛点是什么？ -->

**当前状态**：<!-- 目前是什么样的，有什么问题或缺失？ -->

**期望变化**：<!-- 做完后，什么改变了？ -->

**成功度量**：<!-- 怎么知道做好了？最好是可量化的指标 -->

### 0.5 技能要求
<!-- 列出完成本任务需要的技能，如：react, typescript, nodejs, postgresql -->

### 0.6 预估工时
<!-- 如：2h, 4h, 8h, 1d -->

---

## 1. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| {{CREATE_DATE}} | backlog → analysis | Master | 初始创建 |
| {{ANALYSIS_DATE}} | analysis → approved | Master | 需求分析完成 |
| {{DESIGN_DATE}} | approved → design | Master | 技术设计完成 |
| {{READY_DATE}} | design → ready | Master | 准备就绪 |
| {{CLAIM_DATE}} | ready → in_progress | ${Slaver_ID} | **已领取** |
| {{DESIGN_UPDATE_DATE}} | in_progress → design_review | ${Slaver_ID} | 补充设计文档 |
| {{TEST_DATE}} | design_review → testing | ${Slaver_ID} | 测试完成 |
| {{SUBMIT_DATE}} | testing → review | ${Slaver_ID} | PR 提交 |
| {{APPROVE_DATE}} | review → done | Master | Review 通过 |

> **重要**: Slaver 领取任务后必须按顺序更新状态，不可跳过任何阶段！

---

## 1. 需求概述

### 1.1 功能描述
${功能描述：用户故事格式}

> 作为 ${用户角色}，我需要 ${功能}，以便 ${价值/目的}

### 1.2 验收标准
- [ ] ${验收标准 1}
- [ ] ${验收标准 2}
- [ ] ${验收标准 3}

---

## 2. 技术设计（Master 填写 / Slaver 可补充）

### 2.1 影响范围
- **涉及模块**: `${module1}`, `${module2}`
- **依赖关系**: `${dependencies}`
- **向后兼容**: Yes/No

### 2.2 实现方案
${技术方案概述}

### 2.3 API/接口变更
```typescript
// 新增/修改的接口定义
{{API_CODE_SNIPPET}}
```

---

## 3. 执行记录（Slaver 领取后填写）

### 3.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: {{CLAIM_DATE}}
- **预计工时**: {{ESTIMATED_HOURS}}h
- **状态已更新**: [ ] 是（必须勾选）

### 3.2 必需执行流程（Slaver 职责）

> **注意**: 以下是 Slaver 领取任务后**必须**按顺序执行的步骤，不可跳过！

#### 步骤 1: 更新状态为 in_progress
- [ ] 已更新 ticket 状态：`ready` → `in_progress`
- [ ] 已在本文件中记录领取信息

#### 步骤 2: 修改/补充设计文档
- [ ] 已阅读 Master 填写的技术设计
- [ ] 已补充详细设计（如需要）
- [ ] 已更新状态：`in_progress` → `design_review`
- [ ] 设计文档位置：`{{DESIGN_DOC_PATH}}`

#### 步骤 3: 编写测试（代码修改必需）
- [ ] 已编写单元测试
- [ ] 已编写集成测试（如需要）
- [ ] 测试覆盖率：{{COVERAGE}}%
- [ ] 已更新状态：`design_review` → `testing`

#### 步骤 4: 提交 PR
- [ ] 代码已提交到分支：`{{BRANCH_NAME}}`
- [ ] PR 已创建：`{{PR_URL}}`
- [ ] 已更新状态：`testing` → `review`
- [ ] 已通知 Master Review

### 3.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 领取 | ✓/✗ | {{CLAIM_DATE}} | ${Slaver_ID} |
| 设计文档 | ✓/✗ | {{DESIGN_UPDATE_DATE}} | - |
| 测试编写 | ✓/✗ | {{TEST_DATE}} | - |
| PR 提交 | ✓/✗ | {{SUBMIT_DATE}} | {{PR_NUMBER}} |

### 3.4 实现细节
${实际实现说明，包括关键代码结构、算法选择等}

### 3.5 遇到的问题和解决方案
| 问题 | 解决方案 | 备注 |
|------|----------|------|
| ${问题 1} | ${方案 1} | - |

---

## 4. 提交信息（Review 时使用）

### 4.1 Git 分支
`${feature/{{FEATURE_ID}}-${short-description}}`

### 4.2 提交记录
```bash
# 在此列出主要提交
git log --oneline {{BRANCH_NAME}}
```

### 4.3 测试覆盖
- **单元测试**: {{PASS_COUNT}}/{{TOTAL_COUNT}} passed
- **集成测试**: {{STATUS}}
- **手动测试**: {{STATUS}}

---

## 5. Review 记录（Master 填写）

### 5.1 Review 检查清单
- [ ] 代码符合项目规范
- [ ] 测试覆盖充分
- [ ] 文档已更新
- [ ] 无安全漏洞
- [ ] 性能无显著退化
- [ ] **状态已更新**: `review` → `done`

### 5.2 Review 意见
${Review 意见和修改建议}

### 5.3 Review 结果
- [ ] **批准合并** - 代码质量良好，状态已更新为 done
- [ ] **需要修改** - 见 Review 意见，状态已改回 `in_progress`
- [ ] **拒绝** - ${原因}

**Reviewer**: {{REVIEWER_ID}}
**Review 时间**: {{REVIEW_DATE}}

---

## 6. 知识沉淀（完成后填写）

### 6.1 经验总结
${值得记录的经验或教训}

### 6.2 可复用模式
${可复用于其他任务的设计模式或代码片段}

---

**状态流转**: `backlog` → `analysis` → `approved` → `design` → `ready` → `in_progress` → `review` → `done`
