# MASTER-RULES.md — Master 行为规范

> 处理 ticket 前必读。需求分析/任务拆解方法论见 [EXPERT-PANEL-PLAYBOOK.md](EXPERT-PANEL-PLAYBOOK.md)。

---

## 1. 心跳检查 5 问

每完成一个任务节点后必答：

| # | 问题 | 检查项 |
|---|------|--------|
| Q1 | 任务优先级？ | `inbox/human_input.md` 新指令、`jira/tickets/` backlog/ready，P0>P1>P2 |
| Q2 | Slaver 状态？ | `in_progress` ticket 上报时间，超时阈值 `min(预估/10, 30min)` |
| Q3 | 项目进度？ | Milestone vs done 数量，僵尸 ticket（2+轮未推进） |
| Q4 | 阻塞决策？ | 有 → 写 `inbox/human_feedback/`，停下等待 |
| Q5 | 消息队列？ | 扫描 `shared/message_queue/inbox/` 处理 Slaver 上报 |

**Q5 消息类型**：`task_claimed` / `analysis_review_request` / `progress_report` / `blocked_report` / `test_complete` / `pr_review_request`

---

## 2. 防幻觉红线

违反任一条 = 立即停止重新执行：

1. **禁止伪造测试结果** — 必须附带真实 stdout
2. **禁止 mock 替代真实验证** — 除非有明确注释
3. **禁止无 CI 绿灯合并**
4. **禁止自我闭环审查** — 需交叉审核
5. **禁止混淆计划与事实** — "准备做" ≠ "已完成"

---

## 3. PR Review Checklist

缺任一项 = reject：

- [ ] PR 含真实 `npm test` stdout
- [ ] CI test check 绿色
- [ ] 无未解释的新 mock
- [ ] 变更与 Ticket AC 一一对应

---

## 4. 4-Level Artifact Verification

- [ ] **L1 存在性**：文件存在于 diff
- [ ] **L2 实质性**：真实逻辑，非 stub
- [ ] **L3 接线正确**：正确 import/export
- [ ] **L4 数据流动**：集成测试验证真实数据流（纯文档 PR 豁免）

L1-L3 缺任一项 = reject

---

## 5. Merge 前必完成

1. 所有测试通过（CI + 本地）
2. Review 完成（4-Level 验证）
3. Confluence 文档更新
4. Ticket 状态 → `done`
5. 执行合并

---

## 6. Hard Rules（9 条）

| # | 规则 | 要点 |
|---|------|------|
| 1 | PR 合并后清理 outbox | `git rm outbox/review_requests/<id>-*.md` |
| 2 | 删除前查反向引用 | `grep -rn "FILE" . --include="*.md"` |
| 3 | Slaver 超时 Release | 超时→诊断→区分 Slaver/任务侧问题→Release 或退回 analysis |
| 4 | 负载分担 | 并行>3 或积压>10 → 委托助理（详见 `MASTER-DELEGATION.md`） |
| 5 | 分配前确认环境 | `node dist/index.js system:doctor` |
| 6 | 文档卫生（每10轮） | 检查未追踪 md、僵尸 ticket、积压 review |
| 7 | 新建前先想 | 是否有同类文档可更新？ |
| 8 | Rule of 500 | 净变更>500行 → 必须 codemod，或 `Approved-Large-PR-By:` |
| 9 | PR ~100 行上限 | ≤100 pass，100-500 warn，>500 fail |

---

## 7. 决策 SLA

- 标记 `BLOCKED ON MASTER DECISION` 后 **24h 内**决策
- 超时 → Slaver 可用保守默认方案继续，标注 `[DEFAULT-DECISION]`

---

## 8. 任务拆解后立即初始化 Slaver

禁止创建任务后不初始化，导致积压在 backlog/analysis。

---

## 9. EPIC 验收 — 对抗式 Review

详见 [ADVERSARIAL-REVIEW-PLAYBOOK.md](ADVERSARIAL-REVIEW-PLAYBOOK.md)

**核心**：100% 信心上线？No → 继续迭代

| 组 | 职责 | 输出 |
|----|------|------|
| A 组 | 验证完整性/质量/测试/文档 | Review 报告 |
| B 组 | 有理有据挑战 A 组 | 漏洞盲区清单 |

---

## 10. 阶段完成 Post-Process

EPIC/Sprint 完成后必执行：

**回归验证**：build 通过、test 全绿、分支对齐、CI 无红灯

**分支同步**：main→testing、main→miao、推送、清理 merged 分支

**经验沉淀**：创建 lessons.md、更新 memory-index、更新 RULES（如有改进）

**技术债登记**：扫描 TODO/workaround → 建卡到 backlog

---

## 11. Agent 派遣 Checklist

- [ ] 防卡死规则已注入
- [ ] SSH Push（禁 HTTPS）
- [ ] Timeout 120000ms
- [ ] 文件读取限制（最多连续 5 个）
- [ ] 进度上报格式 `[N/M] done: xxx`
- [ ] run_in_background
- [ ] 错误处理（429/auth/conflict 停止）

---

> 详细流程：[MASTER-HEARTBEAT-CHECKLIST.md](MASTER-HEARTBEAT-CHECKLIST.md) | [MASTER-WORKFLOW.md](MASTER-WORKFLOW.md) | [MASTER-DELEGATION.md](MASTER-DELEGATION.md)
