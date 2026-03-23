# Jira Ticket 模板

**Ticket ID**: {{TICKET_ID}}
**创建时间**: {{TIMESTAMP}}

---

## 基本信息

- **标题**: {{TITLE}}
- **类型**: {{TYPE}}  <!-- feature / bugfix / task / improvement -->
- **优先级**: {{PRIORITY}}  <!-- P0 / P1 / P2 / P3 -->
- **状态**: {{STATUS}}  <!-- backlog / ready / in_progress / test / review / done -->
- **负责人**: {{ASSIGEE}}
- **Slaver**: {{SLAVER_NAME}}

---

## 时间追踪 (v0.5 新增)

- **预估时间**: {{ESTIMATED_MINUTES}} 分钟
- **开始时间**: {{START_TIME}}
- **截止时间**: {{DEADLINE_TIME}}
- **最后更新**: {{LAST_UPDATED}}
- **最后心跳**: {{LAST_HEARTBEAT}}
- **无响应计时**: {{NO_RESPONSE_MINUTES}} 分钟

---

## 任务描述

{{DESCRIPTION}}

---

## 验收标准

{{ACCEPTANCE_CRITERIA}}

---

## 依赖

{{DEPENDENCIES}}

---

## 执行日志

{{EXECUTION_LOG}}

---

## 关联

- **Epic**: {{EPIC_ID}}
- **Blocked By**: {{BLOCKED_BY}}
- **Blocks**: {{BLOCKS}}
- **Related PR**: {{PR_URL}}

---

## 人类参与 (v0.5 新增)

- [ ] 依赖确认 (如需要)
- [ ] 仲裁决策 (如需要)
- [ ] 任务完成确认

---

**模板版本**: v0.5
**最后更新**: 2026-03-23
