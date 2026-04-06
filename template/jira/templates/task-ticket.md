# Task Ticket: TASK-{{SEQUENCE_NUMBER}} - {{TASK_TITLE}}

**创建时间**: {{CREATE_DATE}}
**创建者**: Master Agent
**优先级**: High/Medium/Low
**状态**: backlog
**标签**: `task`, `{{MODULE_TAG}}`

---

## 0. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| {{CREATE_DATE}} | backlog → ready | Master | 初始创建 |
| {{CLAIM_DATE}} | ready → in_progress | ${Slaver_ID} | **已领取** |
| {{DOC_DATE}} | in_progress → documentation | ${Slaver_ID} | 文档已更新 |
| {{TEST_DATE}} | documentation → testing | ${Slaver_ID} | 测试完成（如适用） |
| {{SUBMIT_DATE}} | testing → review | ${Slaver_ID} | PR 提交 |
| {{APPROVE_DATE}} | review → done | Master | Review 通过 |

> **重要**: Slaver 领取任务后必须按顺序更新状态，不可跳过任何阶段！

---

## 1. 任务描述

### 1.1 任务类型
- [ ] 开发任务
- [ ] 测试任务
- [ ] 文档任务
- [ ] 重构任务
- [ ] 部署任务
- [ ] 其他：${类型}

### 1.2 任务目标
${清晰描述任务要达成的目标}

### 1.3 交付物
- [ ] ${交付物 1}
- [ ] ${交付物 2}

---

## 2. 背景信息（Master 填写）

### 2.1 任务背景
${为什么需要这个任务，相关的上下文信息}

### 2.2 技术提示
${Master 给出的技术建议或注意事项}

### 2.3 相关资源
- 相关文档：{{DOC_LINK}}
- 相关文件：`{{FILE_PATH}}`
- 相关 Issue: `{{ISSUE_ID}}`

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

#### 步骤 2: 修改/补充文档（如需要）
- [ ] 已更新相关文档
- [ ] 文档位置：`{{DOC_PATH}}`
- [ ] 已更新状态：`in_progress` → `documentation`

#### 步骤 3: 编写测试（代码修改必需）
- [ ] 不适用（纯文档任务）
- 或
- [ ] 已编写单元测试
- [ ] 已更新状态：`documentation` → `testing`

#### 步骤 4: 提交 PR
- [ ] 代码已提交到分支：`{{BRANCH_NAME}}`
- [ ] PR 已创建：`{{PR_URL}}`
- [ ] 已更新状态：`testing` → `review`
- [ ] 已通知 Master Review

### 3.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 领取 | ✓/✗ | {{CLAIM_DATE}} | ${Slaver_ID} |
| 文档更新 | ✓/✗ | {{DOC_DATE}} | - |
| 测试编写 | ✓/✗ | {{TEST_DATE}} | N/A 或 {{COVERAGE}}% |
| PR 提交 | ✓/✗ | {{SUBMIT_DATE}} | {{PR_NUMBER}} |

---

## 4. 验证标准（Master 填写）

### 4.1 验收检查
- [ ] 任务目标已达成
- [ ] 交付物完整
- [ ] 质量符合要求

### 4.2 验证结果
- [ ] **通过** - 任务完成
- [ ] **需要补充** - ${补充说明}

**验证者**: {{REVIEWER_ID}}
**验证时间**: {{VERIFICATION_DATE}}

---

## 5. 知识沉淀

### 5.1 经验总结
${值得记录的经验}

---

**状态流转**: `backlog` → `ready` → `in_progress` → `review` → `done`
