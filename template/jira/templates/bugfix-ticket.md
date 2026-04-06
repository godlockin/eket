# Bugfix Ticket: FIX-{{SEQUENCE_NUMBER}} - {{BUG_TITLE}}

**创建时间**: {{CREATE_DATE}}
**创建者**: Master Agent / Slaver Agent
**优先级**: Critical/High/Medium/Low
**状态**: backlog
**标签**: `bug`, `{{MODULE_TAG}}`, `{{SEVERITY}}`

---

## 0. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| {{CREATE_DATE}} | backlog → analysis | Master | 初始创建 |
| {{ANALYSIS_DATE}} | analysis → ready | Master | 根因分析完成 |
| {{CLAIM_DATE}} | ready → in_progress | ${Slaver_ID} | **已领取** |
| {{FIX_DATE}} | in_progress → testing | ${Slaver_ID} | 修复完成 |
| {{TEST_DATE}} | testing → review | ${Slaver_ID} | 验证通过，PR 提交 |
| {{APPROVE_DATE}} | review → done | Master | Review 通过 |

> **重要**: Slaver 领取任务后必须按顺序更新状态，不可跳过任何阶段！

---

## 1. Bug 描述

### 1.1 问题现象
${清晰描述用户遇到的问题现象}

### 1.2 复现步骤
1. ${步骤 1}
2. ${步骤 2}
3. ${步骤 3}

### 1.3 预期行为
${应该发生什么}

### 1.4 实际行为
${实际发生了什么}

### 1.5 影响范围
- **影响用户**: ${用户群体}
- **影响功能**: ${功能模块}
- **严重程度**: ${严重/一般/轻微}

---

## 2. 技术诊断（Master/Slaver 填写）

### 2.1 错误日志
```
${错误日志/堆栈信息}
```

### 2.2 根因分析
${导致问题的根本原因}

### 2.3 影响分析
- **数据影响**: ${是否有数据损坏/丢失}
- **功能影响**: ${哪些功能受影响}
- **用户影响**: ${多少用户受影响}

### 2.4 修复方案
${计划的修复方案}

---

## 3. 执行记录（Slaver 领取后填写）

### 3.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: {{CLAIM_DATE}}
- **状态已更新**: [ ] 是（必须勾选）

### 3.2 必需执行流程（Slaver 职责）

> **注意**: 以下是 Slaver 领取任务后**必须**按顺序执行的步骤，不可跳过！

#### 步骤 1: 更新状态为 in_progress
- [ ] 已更新 ticket 状态：`ready` → `in_progress`
- [ ] 已在本文件中记录领取信息

#### 步骤 2: 实施修复
- [ ] 已实施修复
- [ ] 修复说明：{{FIX_DESCRIPTION}}
- [ ] 已更新状态：`in_progress` → `testing`

#### 步骤 3: 验证修复
- [ ] 已验证复现步骤通过
- [ ] 已添加回归测试
- [ ] 已更新状态：`testing` → `review`

#### 步骤 4: 提交 PR
- [ ] 代码已提交到分支：`{{BRANCH_NAME}}`
- [ ] PR 已创建：`{{PR_URL}}`
- [ ] 已更新状态：`testing` → `review`
- [ ] 已通知 Master Review

### 3.3 测试验证
- [ ] 复现步骤验证通过
- [ ] 回归测试通过
- [ ] 单元测试已添加

---

## 4. 验证标准（Master 填写）

### 4.1 修复验证
- [ ] Bug 已修复，复现步骤验证通过
- [ ] 无副作用/回归问题
- [ ] 测试覆盖充分

### 4.2 代码质量
- [ ] 代码简洁清晰
- [ ] 有适当的错误处理
- [ ] 有必要的注释

### 4.3 验证结果
- [ ] **批准合并** - 修复有效
- [ ] **需要修改** - 见验证意见
- [ ] **无法修复** - ${原因}

**验证者**: {{REVIEWER_ID}}
**验证时间**: {{VERIFICATION_DATE}}

---

## 5. 知识沉淀

### 5.1 根本原因
${导致 bug 的根本原因，用于预防类似问题}

### 5.2 预防措施
${如何预防类似的 bug 再次发生}

### 5.3 相关改进
${是否需要改进相关代码或流程}

---

**状态流转**: `backlog` → `analysis` → `in_progress` → `review` → `done`
