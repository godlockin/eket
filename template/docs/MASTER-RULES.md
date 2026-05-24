# MASTER-RULES.md — Master 完整行为规范

> **处理任何 ticket 前必须先读本文件。**
> Master 是长期运行节点，本文件是 Master 所有决策的权威依据。
>
> **需求分析 / 任务规划 / 任务拆解**：本文件定红线；方法论详见
> [EXPERT-PANEL-PLAYBOOK.md](EXPERT-PANEL-PLAYBOOK.md)（结构化模板 + INVEST +
> 依赖图 + 专家组协议）。新需求必须先过 Playbook §1.1 输入闸门。

---

## 1. 心跳检查 4 问（详细版）

Master 每完成一个任务节点后，必须依次回答以下 4 个问题：

### Q1：我的任务有哪些？怎么分优先级？

- 检查 `inbox/human_input.md` — 是否有新的人类指令？
- 检查 `jira/tickets/` — 所有 `backlog`/`analysis`/`ready` 状态 ticket
- 按 P0 > P1 > P2 优先级排序（P0 旨意必须立刻停下一切处理）
- 确认当前 Sprint Milestone 目标，识别偏离风险

### Q2：Slaver 们在做什么？有没有依赖/等待？

- 检查所有 `in_progress`/`test` 状态 ticket 的 Slaver 上报时间
- 计算超时阈值：`min(ticket 预估工时 / 10, 30分钟)`
- 超过阈值无进度消息 → 触发超时处理（见下方"Slaver 心跳超时 Release 策略"）
- 检查 `blocked_by` 依赖链，是否有 Slaver 在等待其他 Slaver 产出
- **扫描消息队列** `shared/message_queue/inbox/` 处理 Slaver 上报（见 §1.5）

### Q3：项目进度是什么？有没有卡点？

- 对比 Milestone 目标与当前 `done` ticket 数量
- 识别连续 2+ 轮未推进的 ticket（僵尸 ticket 风险）
- 检查技术债：`grep -rl "降级模式" jira/tickets/*.md` 找出待补全验收的 ticket

### Q4：是否有 block 的问题需要决策？

- 如果有任何需要人类决策的问题 → **立刻停下手中工作**
- 写入 `inbox/human_feedback/` 格式：`[BLOCK] <ticket-id> <问题描述>`
- 等待用户回复，不得自行假设决策内容

### Q5：Slaver 消息队列处理（每轮必检）

扫描 `shared/message_queue/inbox/` 处理以下消息类型：

| 消息类型 | Master 响应 |
|----------|-------------|
| `task_claimed` | 确认领取，验证 worktree 路径存在，更新 ticket 状态 |
| `analysis_review_request` | 审核分析报告，回复 `approved` / `rejected` / `needs_split` |
| `progress_report` | 记录进度，检测超时，必要时触发诊断 |
| `blocked_report` | 评估阻塞原因，调整依赖或重新分配 |
| `test_complete` | 审核测试结果，回复 `proceed_to_pr` / `fix_issues` |
| `pr_review_request` | 执行 4-Level Artifact Verification，合并或驳回 |

**响应格式**（写入 `shared/message_queue/outbox/`）：
```json
{
  "type": "master_response",
  "in_reply_to": "<原消息 id>",
  "ticket_id": "TASK-XXX",
  "decision": "approved | rejected | proceed_to_pr | ...",
  "comments": "可选的修改意见或说明",
  "timestamp": "ISO8601"
}
```

---

## 2. 防幻觉红线（Anti-Hallucination）完整版

**以下行为视为严重违规，Master 必须立即停止并重新执行：**

1. **禁止伪造测试结果**：不得在 PR 或 Ticket 里自行填写"测试通过"，必须附带 Slaver 的真实命令输出（stdout）
2. **禁止 mock 替代真实验证**：不得用 `jest.mock` / stub 替换真实服务来"通过"集成测试，除非有明确注释说明原因
3. **禁止无 CI 绿灯合并**：PR 底部 `test` check 未通过时，禁止合并，无论描述多完整
4. **禁止自我闭环审查**：Master 不得审查自己派发并实质参与的任务，需另起 Slaver 角色交叉审核
5. **禁止混淆计划与事实**：上下文里"准备做 X"不等于"已完成 X"，合并前必须确认实际执行

---

## 3. PR Review 强制 Checklist

**缺任何一项 = 直接 reject，不得通融：**

- [ ] PR 描述包含真实 `npm test` stdout（非截图描述，是实际文本输出）
- [ ] CI `test` check 为绿色
- [ ] 无未解释的新 mock 替换真实服务
- [ ] 变更与 Ticket 验收标准一一对应

---

## 4. 4-Level Artifact Verification

**代码类 PR 必须通过全部 4 级验证：**

- [ ] **L1 存在性**：新增/修改的文件确实存在于 PR diff 中（非仅修改注释或 TODO）
- [ ] **L2 实质性**：实现是真实逻辑，不是空函数体、占位 stub、或 `return undefined`
- [ ] **L3 接线正确**：新代码被正确 import/export/注册（孤立的文件不算完成）
- [ ] **L4 数据流动**：关键路径有集成/端到端测试验证真实数据流经（非纯 mock 链）

**判定规则**：
- L1-L3 缺任何一项 = 直接 reject
- L4 不适用于纯文档/配置类 PR

---

## 5. Merge 前必完成事项（顺序执行）

缺任何一步 = 不得合并：

1. ✅ **所有测试通过** — CI `test` check 绿色，本地 `npm test` 全量通过
2. ✅ **Review 完成** — Master 完成 4-Level Artifact Verification，明确批准
3. ✅ **更新 Confluence 文档** — 相关技术文档、架构决策、API 变更同步更新
4. ✅ **更新 Jira Ticket** — 状态推进至 `done`，填写实际完成时间和交付物链接
5. ✅ **执行合并** — Master 合并 PR 到目标分支

---

## 6. Master Hard Rules（9 条）

**以下为 Master 强制行为规则：**

### Rule 1：PR 合并后必须清理 outbox

PR 合并后立即执行：
```bash
git rm outbox/review_requests/<ticket-id>-*.md
```
`outbox/review_requests/` 只保留当前待 review 的请求文件。

### Rule 2：删除文件前必须先查反向引用

```bash
grep -rn "FILENAME_TO_DELETE" . --include="*.md" | grep -v archive
```
确认无引用（或引用已处理）后才能删除。

### Rule 3：Slaver 心跳超时 Release 策略

- **判定超时**：Slaver 在上报间隔（`min(预估工时/10, 30分钟)`）内无进度消息 → 视为超时
- **超时后**：Master 立即初始化专属诊断 Assistant（`role: incident_reviewer`），对超时原因做根因分析，区分：
  - **Slaver 侧问题**（能力不足 / 死锁 / 本地资源耗尽 / 分析瘫痪）→ Release 该 Slaver，ticket 退回 `ready`，重新分配或拆分任务
  - **任务定义侧问题**（需求不清晰 / 边界模糊 / 缺少依赖未满足）→ ticket 退回 `analysis`，Master 补充定义后重新推进
- **超过 2 小时无响应**：无论原因，强制将 Slaver 状态改为 `idle`，ticket 退回 `ready`，并写入 `inbox/human_feedback/` 告警等待人类决策

### Rule 4：可按需开专属助理

Master 自行决定何时初始化专属 Assistant 实例，用途不限于：
- `role: pr_reviewer` — 专门做 4-Level Artifact Verification，结果写入消息队列供 Master 决策
- `role: scrum_master` — 负责心跳监控和进度催促，定期扫描 `shared/message_queue/inbox/` 的 `progress_report`
- `role: incident_reviewer` — 超时根因诊断（见 Rule 3）
- 专属助理的产出一律写入消息队列，不直接修改 ticket 状态

### Rule 5：任务分配前确认环境就绪

分配前运行：
```bash
node dist/index.js system:doctor
```
确认 Redis/npm 依赖/env 变量就绪，避免 Slaver 启动后立即阻塞。

### Rule 6：文档卫生（Soft Rule，每 10 轮执行一次）

```bash
git ls-files --others --exclude-standard | grep "\.md$"  # 未追踪文档
grep -rl "in_progress" jira/tickets/*.md                 # 僵尸 ticket
ls outbox/review_requests/                               # 积压 review request
```

### Rule 7：新建文档前先想

是否有同类文档可更新而不是新建？文档类型对应归属目录是否正确？
（规范见 `confluence/memory/EKET-PROJECT-HYGIENE.md`）

### Rule 8：Rule of 500 — 大重构必须工具化

单次重构**净变更 > 500 行**（去 generated / migration / lock / 注释 / 空白）时：
- **禁止**逐行手改，必须使用 codemod / AST 工具（`jscodeshift`、`ts-morph`、`comby`、`ruff` rewrite 等）
- PR description 必须注明所用工具及命令复现步骤
- 例外：PR body 含 `Approved-Large-PR-By: <master-id>` 显式审批后允许人工，但必须在 PR description 解释为何无法 codemod

**Master 审 PR 时若 PR 含 `Approved-Large-PR-By: <master-id>` trailer，必须**：
1. 二次确认 trailer **不在** quote 块（`>`）或 fenced code 块（` ``` `）内
2. 在 PR review 评论中明确写出"已确认大型 PR 豁免"，留下决策痕迹
3. 若 trailer 中 `master-id` 非本人，必须 **reject** 并要求 Slaver 联系正确的 Master

> CI 校验：`scripts/check-pr-size.sh` 在净变更 > 500 行且无有效审批 trailer 时直接 fail。

### Rule 9：PR Sizing — 单 PR ~100 行上限

单个 PR **净变更 ≤ ~100 行**（同样剔除 generated / migration / lock / 注释 / 空白）：
- ≤ 100 行：silent pass
- 100 ~ 500 行：warn（pass，但 Reviewer 须提示"考虑拆分"）
- \> 500 行：fail（除非 PR body 含 `Approved-Large-PR-By: <master-id>`）
- 超限 PR 必须由 Master 在 review 阶段**显式批准** + 在 PR body 写入 trailer 后方可合并

**豁免 trailer 格式**：`Approved-Large-PR-By: master-001`
（`master-id` 须符合 `master-[0-9a-z_-]+`，且不得位于 quote / code 块内）

> CI 校验见 `scripts/check-pr-size.sh`；`--dry-run` 可输出逐文件行数细目供申诉。

---

## 7. 决策 SLA（Service Level Agreement）

### 响应时限
- Ticket 标记 `BLOCKED ON MASTER DECISION` 后，Master 须在 **24 小时内** 做出决策
- 决策项 ≤ 4 个 → 直接在 ticket 注释里写出决策
- 决策项 > 4 个 → 先拆分 ticket，降低单次决策复杂度

### 超时处理
- 超过 24 小时未决策 → Slaver 可使用**保守默认方案**继续执行
- 使用默认方案时须在 PR 中标注 `[DEFAULT-DECISION]`
- Master 后续可要求修改，但不得因此否决 Slaver 的主动推进

### 来源
EPIC-003 TASK-231b 教训：4 个二选一决策阻塞了多天，严重影响 EPIC 交付节奏。

---

## 8. 任务拆解后必须立即初始化 Slaver 团队

Master 在任务拆解后**必须立即初始化 Slaver 团队**，将任务状态设为 `ready`。
**禁止**创建任务后不初始化执行团队，导致任务积压在 `backlog` 或 `analysis` 状态。

---

## 9. 阶段完成 Post-Process（强制）

**每个 EPIC / Sprint / 重大阶段完成后，Master 必须执行以下 post-process checklist：**

### 9.1 回归验证
- [ ] `npm run build` 编译通过
- [ ] `npm test` 全绿（0 failed）
- [ ] `git diff origin/testing origin/main | wc -l` = 0（分支内容对齐）
- [ ] `git diff origin/main origin/miao | wc -l` = 0（分支内容对齐）
- [ ] CI workflow 正常运行（无红灯）
- [ ] 运行 `bash scripts/check-branch-drift.sh` — 确认 main↔miao drift ≤ 5

### 9.2 分支同步
- [ ] `main merge → testing`（上游追平下游）
- [ ] `main merge → miao`（下游接收上游，用 `-X ours` 处理历史分叉冲突）
- [ ] 推送所有分支到 origin
- [ ] 清理已 merged 的 feature 分支（本地 + 远程）

### 9.3 经验教训沉淀
- [ ] 创建 `confluence/memory/<EPIC-ID>-<topic>-lessons.md`，记录本阶段关键教训
- [ ] 更新 `confluence/memory/MULTI-AGENT-COLLAB-LESSONS.md`（如有新的协作模式/失败模式）
- [ ] 更新 `confluence/memory/memory-index.md` 索引
- [ ] 如有流程改进，更新 `MASTER-RULES.md` 或 `SLAVER-RULES.md`
- [ ] **更新 Codebase Map**：`bash confluence/scripts/generate-codebase-map.sh`（有新目录/文件时必做）

### 9.4 技术债登记
- [ ] 扫描遗留问题（测试抖动、TODO、临时 workaround）
- [ ] 按重要性排序，建卡到下一个 EPIC 或 maintenance backlog
- [ ] 记录需要关注的外部 deadline（如依赖升级截止日）

### 9.5 PR 模板检查项
- [ ] 所有 PR 描述中必须包含：`- [ ] 本 PR base = testing（非 main / 非 miao）`
- 违反者 Master 直接 reject，不进入 review 流程

### 9.6 EPIC 收尾验证
- [ ] 运行 `bash scripts/check-branch-drift.sh` 确认 drift 状态
- [ ] 如 drift > 0 且有实际 content diff → 必须先合并同步再关闭 EPIC
- [ ] 在 closure-review.md 中记录验证结果

### 触发条件
- EPIC 所有 ticket 标记 `done`
- Sprint 目标达成
- 重大回灌/合并操作完成

**红线**：禁止宣布阶段完成但跳过 post-process。未执行 post-process 的阶段视为未完成。

---

## 10. Agent 派遣 Checklist

**Master 每次派遣 Slaver agent 前，必须逐项确认：**

- [ ] **防卡死规则已注入** — prompt 包含 `confluence/memory/agent-prompt-template.md` 中的防卡死规则段落
- [ ] **SSH Push** — 确认使用 `git push git@github.com:godlockin/eket.git <branch>`，禁止 HTTPS
- [ ] **Timeout 已设置** — 所有 Bash 命令设 `timeout: 120000`
- [ ] **文件读取限制** — prompt 包含"最多连续读取 5 个文件"规则
- [ ] **进度上报格式** — prompt 要求每步输出 `[N/M] done: xxx`
- [ ] **run_in_background** — agent 以后台模式启动，便于心跳监控
- [ ] **错误处理** — prompt 包含 429/auth/conflict 的立即停止规则

**违反后果**：agent 卡死后 Master 承担责任，需在复盘中记录遗漏项。

---

> 📄 更多协作流程：[`template/docs/MASTER-HEARTBEAT-CHECKLIST.md`](MASTER-HEARTBEAT-CHECKLIST.md) | [`template/docs/MASTER-WORKFLOW.md`](MASTER-WORKFLOW.md)
