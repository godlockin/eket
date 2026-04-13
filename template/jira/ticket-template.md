# Jira Ticket 模板 (v2.1.0)

<!--
================================================================================
  元信息区域 - 放在文件开头，便于快速查看和解析
================================================================================
-->

**Ticket ID**: {{TICKET_ID}}
**标题**: {{TITLE}}
**类型**: {{TYPE}}  <!-- feature / bugfix / task / improvement / research -->
**优先级**: {{PRIORITY}}  <!-- P0(紧急) / P1(高) / P2(中) / P3(低) -->

**状态**: {{STATUS}}  <!-- backlog → analysis → approved → ready → in_progress → test → review → done -->
**创建时间**: {{CREATED_AT}}
**最后更新**: {{UPDATED_AT}}

**负责人**: {{ASSIGNEE}}  <!-- Slaver 领取时填写 instance_id -->
**执行 Agent**: {{SLAVER_NAME}}  <!-- Slaver 领取时填写 instance_id -->
**所属 Epic**: {{EPIC_ID}}
**所属 Sprint**: {{SPRINT_ID}}
**所属 Milestone**: {{MILESTONE_ID}}
**适配角色**: {{TARGET_ROLE}}  <!-- frontend_dev / backend_dev / fullstack / tester / devops -->

<!--
================================================================================
  Slaver 领取任务记录 (v2.1.0 新增)
================================================================================
-->

## 领取记录

| 操作 | Slaver Instance ID | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | {{CLAIMED_BY}} | {{CLAIMED_AT}} | ready → in_progress |
| 提交 Review | {{REVIEW_SUBMITTED_BY}} | {{REVIEW_SUBMITTED_AT}} | in_progress → review |
| Review 通过 | {{REVIEW_APPROVED_BY}} | {{REVIEW_APPROVED_AT}} | review → done |

<!--
================================================================================
  以下为详细内容
================================================================================
-->

---

## 1. 任务描述

{{DESCRIPTION}}

---

## 2. 验收标准

{{ACCEPTANCE_CRITERIA}}

---

## 3. 依赖关系

### 3.1 前置依赖
{{DEPENDENCIES}}

### 3.2 阻塞其他
{{BLOCKS}}

---

## 4. 时间追踪

| 项目 | 值 |
|------|-----|
| 预估时间 | {{ESTIMATED_MINUTES}} 分钟 |
| 开始时间 | {{START_TIME}} |
| 截止时间 | {{DEADLINE_TIME}} |
| 最后心跳 | {{LAST_HEARTBEAT}} |
| 无响应计时 | {{NO_RESPONSE_MINUTES}} 分钟 |

---

## 5. 任务分析文档 (v0.8.0+)

**文档链接**: {{TASK_ANALYSIS_DOC}}
**审查状态**: {{ANALYSIS_STATUS}}  <!-- pending_review / approved / rejected -->
**审查者**: {{REVIEWER}}
**批准时间**: {{APPROVED_AT}}

---

## 6. 执行日志

{{EXECUTION_LOG}}

---

## 7. Review 记录 (v0.9.0+)

### 7.1 Master Review 初始化

**Review 发起时间**: {{REVIEW_STARTED_AT}}
**Review Master**: {{MASTER_ID}}
**共享记忆 Subagents**:

| Subagent ID | 角色 | 职责 | 状态 |
|-------------|------|------|------|
| {{SUBAGENT_1_ID}} | 代码审查员 | 代码质量、规范检查 | initialized / analyzing / complete |
| {{SUBAGENT_2_ID}} | 测试审查员 | 测试覆盖、边界检查 | initialized / analyzing / complete |
| {{SUBAGENT_3_ID}} | 安全审查员 | 安全漏洞、权限检查 | initialized / analyzing / complete |
| {{SUBAGENT_4_ID}} | 文档审查员 | 文档完整性、一致性 | initialized / analyzing / complete |

### 7.2 Subagent 审查意见

#### 代码审查员
- **状态**: {{CODE_REVIEW_STATUS}}
- **意见**: {{CODE_REVIEW_COMMENTS}}
- **评分**: {{CODE_REVIEW_SCORE}} / 10

#### 测试审查员
- **状态**: {{TEST_REVIEW_STATUS}}
- **意见**: {{TEST_REVIEW_COMMENTS}}
- **评分**: {{TEST_REVIEW_SCORE}} / 10

#### 安全审查员
- **状态**: {{SECURITY_REVIEW_STATUS}}
- **意见**: {{SECURITY_REVIEW_COMMENTS}}
- **评分**: {{SECURITY_REVIEW_SCORE}} / 10

#### 文档审查员
- **状态**: {{DOC_REVIEW_STATUS}}
- **意见**: {{DOC_REVIEW_COMMENTS}}
- **评分**: {{DOC_REVIEW_SCORE}} / 10

### 7.3 综合审查结果

**Review 状态**: {{REVIEW_STATUS}}  <!-- pending / in_progress / completed -->
**Review 完成时间**: {{REVIEW_COMPLETED_AT}}
**审查结果**: {{REVIEW_RESULT}}  <!-- approved / changes_requested / rejected -->

**Master 意见**:
{{MASTER_COMMENTS}}

---

## 8. 人类参与 (v0.9.0+)

### 8.1 人类审查点

| 审查点 | 类型 | 状态 | 审查者 | 日期 |
|--------|------|------|--------|------|
| B1: 任务分析文档 | 必须 | {{HUMAN_REVIEW_B1_STATUS}} | {{HUMAN_REVIEWER_B1}} | {{B1_DATE}} |
| B2: PR 验证审查 | 必须 | {{HUMAN_REVIEW_B2_STATUS}} | {{HUMAN_REVIEWER_B2}} | {{B2_DATE}} |

### 8.2 人类反馈

{{HUMAN_FEEDBACK}}

---

## 9. 变更记录

| 版本 | 日期 | 变更内容 | 变更者 |
|------|------|----------|--------|
| v1.0 | {{CREATED_AT}} | 初始创建 | {{CREATOR}} |
| {{VERSION}} | {{CHANGE_DATE}} | {{CHANGE_DESCRIPTION}} | {{CHANGER}} |

---

## 10. 关联资源

- **PR URL**: {{PR_URL}}
- **分支**: {{BRANCH_NAME}}
- **任务分析文档**: {{TASK_ANALYSIS_URL}}
- **测试报告**: {{TEST_REPORT_URL}}

---

**模板版本**: v2.0.0
**最后更新**: 2026-04-06
**变更说明**:
- 元信息移到文件开头
- 新增 Master Review Subagent 初始化记录
- 新增人类参与审查点追踪
- 结构化审查流程
