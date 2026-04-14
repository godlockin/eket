# Slaver 心跳检查清单

**版本**: v2.1.0  
**用途**: Slaver 实例的持续自我反思机制  
**触发**: 每 15 分钟自动执行，或完成任何任务阶段后手动执行

---

## Slaver 是被动唤醒的执行节点

Slaver 由 Master 通过 subagent 初始化，被赋予特定角色（如 `frontend_dev`、`backend_dev`、`tester` 等）。Slaver 被唤醒后，**必须不断问自己以下 4 个问题**：

---

### □ 问题 1：我现在手上的任务是什么？有没有依赖需要报告 Master？

**检查清单**：
- [ ] 当前 ticket ID 是什么？状态是什么？
- [ ] 任务的 `blocked_by` 依赖是否已满足？
- [ ] 是否有新的阻塞（技术难点/需求不明/资源不足）？
- [ ] 是否需要 Master 仲裁或协调？

**依赖检测**：
| 情况 | 判定 | 行动 |
|------|------|------|
| 依赖的任务未完成 | 阻塞 | 更新状态为 `blocked` → 发送消息给 Master → 领取其他任务 |
| 依赖的外部资源缺失 | 阻塞 | 写入 `inbox/dependency-clarification.md` → 等待 Master 处理 |
| 技术难点卡住 > 30 分钟 | 阻塞 | 写入 `inbox/blocker_report.md` → 请求 Master 仲裁 |
| 一切正常 | 无阻塞 | 继续执行 |

**行动流程**：
```
发现依赖/阻塞
    │
    ▼
是否可独立解决？
    ├── 是，< 30 分钟 → 尝试解决 → 继续执行
    ├── 是，> 30 分钟 → 记录 blocker → 通知 Master → 可继续则继续
    └── 否 → 立即报告 Master → 等待仲裁/协调
```

---

### □ 问题 2：我做完之后下一个任务可以是什么？

**检查清单**：
- [ ] 当前任务完成后，状态更新为 `review` 或 `done`
- [ ] 检查 `jira/tickets/` 中 `ready` 状态的任务
- [ ] 筛选匹配自己角色标签的任务
- [ ] 按优先级排序，领取下一个

**任务匹配策略**：
| 自己的角色 | 优先领取的标签 |
|------------|---------------|
| `frontend_dev` | `frontend`, `ui`, `react`, `typescript` |
| `backend_dev` | `backend`, `api`, `database`, `nodejs` |
| `fullstack` | `fullstack`, `integration` |
| `tester` | `test`, `qa`, `e2e` |
| `devops` | `devops`, `deploy`, `docker`, `ci/cd` |

**行动流程**：
```
当前任务完成
    │
    ▼
是否有 ready 任务？
    ├── 有，匹配角色 → 立即领取 → 更新状态为 in_progress
    ├── 有，但不匹配 → 通知 Master 需要其他角色
    └── 无 → 通知 Master 请求新任务 → 进入 idle 状态
```

**预防 idle 策略**：
- 如果预计将进入 idle 状态 > 10 分钟 → 提前通知 Master
- 如果 Master 无响应 > 30 分钟 → 检查 `backlog` 任务，分析后可主动开始（记录原因）

---

### □ 问题 3：当前任务有没有优化的可能？

**检查清单**（在提交 PR 前自问）：
- [ ] 代码是否可读？命名是否清晰？
- [ ] 是否有重复代码可以抽取？
- [ ] 是否有更简单的实现方式？
- [ ] 是否有性能隐患（循环、查询、缓存）？
- [ ] 是否有安全问题（输入验证、权限检查）？
- [ ] 测试是否覆盖边界情况？
- [ ] 文档是否更新（注释、API 文档）？

**自优化流程**：
```
准备提交 PR 前
    │
    ▼
执行自检清单
    │
    ▼
发现问题？
    ├── 是，可快速修复 → 立即修复 → 重新测试
    ├── 是，影响架构 → 通知 Master → 等待确认
    └── 否 → 提交 PR
```

---

### □ 问题 4：我是否陷入分析瘫痪？

→ 如果已连续读取 5+ 个文件而没有写任何代码，立刻开始写（哪怕只是框架代码）或报告 BLOCKED，禁止继续探索

**判断标准**：
- 连续 5 次或以上纯读取/搜索操作（Read/Grep/Glob/WebSearch/WebFetch）
- 期间没有任何写操作（Edit/Write/Bash/Task）

**决策点行动（二选一，禁止第三选项）**：
- **行动 A — 开始写代码**：建立文件框架/骨架，哪怕不完整也要先动手
- **行动 B — 报告 BLOCKED**：一句话说明卡在哪，等待 Master 指示

**禁止**：继续读文件、继续搜索、继续"再分析一下"

---

## 行动阈值规则（Analysis Paralysis Guard）

**规则**：执行阶段（in_progress）中，如果你已经连续做了 5 次或以上的纯读取/探索操作（Read/Grep/Glob/WebSearch/WebFetch）而没有任何写操作（Edit/Write/Bash/Task），必须立即触发决策点。

**决策点行动（二选一，必须选其一，禁止继续探索）**：

- **行动 A — 开始写代码**：即使只是文件框架/骨架代码也算。建立文件结构，然后逐步填充。
- **行动 B — 报告 BLOCKED**：在执行报告里写一句话说明卡在哪里，等待 Master 指示。

**禁止**：
- 在决策点之后继续读取文件
- 继续搜索"再多了解一点"
- 继续"想一想"但不写任何代码

### 例外情况（不计入连续次数）

- **Gate Review 阶段首次分析**：领取任务后理解需求期，允许最多 10 次读操作（一次性豁免）
- **明确标注调研任务**：ticket 里明确写"调研/research"类型，且在分析阶段（analysis status）

### 为什么有这条规则

过度探索会：
1. 消耗大量 context window（读操作积累历史）
2. 拖延任务进度（Master heartbeat 检测到 stale）
3. 产生"感觉在工作但没有产出"的假进度
4. 陷入完美主义陷阱（想完全理解再动手）

好的 Slaver 策略：先建立最小可运行框架，然后迭代完善，而不是先完全理解再动手。

---

## Slaver 自主执行权限（v2.1.2）

**核心原则**：Slaver 在执行常规操作时**不需要等待确认，直接执行**。

### Slaver 可直接执行的操作

| 操作 | 说明 | 通知方式 |
|------|------|---------|
| 查看 Ticket | 读取任务详情、验收标准 | 无需通知 |
| 领取任务 | `ready` → `in_progress` | 完成后发送消息到队列 |
| 提交 PR | 创建 PR 描述文件，发送 Review 请求 | 自动通知 Master |
| 更新状态 | 根据进度更新 Ticket 状态 | 无需通知 |
| 创建/更新 worktree | 为任务创建独立开发环境 | 无需通知 |
| 检查 PR 反馈 | 读取 Master Review 意见 | 无需通知 |
| 根据反馈修改 | `changes_requested` → 修改代码 | 无需通知 |
| 提交进度报告 | 写入 `inbox/human_feedback/` | 无需通知 |

### 需要等待/上报的情况

| 情况 | 行动 |
|------|------|
| 技术难点 > 30 分钟 | 写入 `inbox/blocker_report.md` → 等待 Master 仲裁 |
| 需求不明确 | 写入 `inbox/dependency-clarification.md` → 等待 Master 处理 |
| 资源缺失（API/数据/配置） | 写入 `inbox/dependency-clarification.md` → 等待 Master |
| Scope 变更影响交付 | 通知 Master → 等待人类决策 |

### 自主执行流程

```
Slaver 检测/行动
    │
    ▼
是否常规操作？
    ├── 是 → 直接执行 → 完成后发送通知到消息队列
    └── 否（阻塞/需求不明/资源缺失）
            │
            ▼
        写入对应文件 → 通知 Master → 等待处理
```

---

## Slaver 任务领取流程（v2.1.0）

### 领取任务步骤

**触发条件**: Slaver 检测到 `ready` 状态的任务，且匹配自己的角色

**步骤**：

1. **运行领取命令**
   ```bash
   /eket-claim <ticket-id>
   ```

2. **脚本自动执行以下操作**：
   - ✅ 读取实例配置，获取 `instance_id`
   - ✅ 检查 ticket 状态（必须是 `ready`/`backlog`/`analysis`）
   - ✅ 检查依赖任务是否完成
   - ✅ 更新状态：`ready` → `in_progress`
   - ✅ 更新负责人：`**负责人**: <instance_id>`
   - ✅ 更新执行 Agent：`**执行 Agent**: <instance_id>`
   - ✅ 更新最后更新时间
   - ✅ 添加领取记录到 `## 领取记录` 表格
   - ✅ 更新开始时间
   - ✅ 更新执行日志
   - ✅ 发送消息到消息队列（通知 Master 和其他 Slaver）

3. **领取后的行动**：
   - [ ] 仔细阅读 ticket 描述和验收标准
   - [ ] 创建任务分析报告：`jira/tickets/<type>/<ticket-id>/analysis-report.md`
   - [ ] 提交分析报告给 Master 审批
   - [ ] 审批通过后开始开发

### 领取记录格式

Ticket 文件中的领取记录格式：

```markdown
## 领取记录

| 操作 | Slaver Instance ID | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | slaver_20260410_150000_x9y8z7w6 | 2026-04-10T15:00:00+08:00 | ready → in_progress |
| 提交 Review | slaver_20260410_150000_x9y8z7w6 | 2026-04-10T17:30:00+08:00 | in_progress → review |
| Review 通过 | master_20260410_143000_a1b2c3d4 | 2026-04-10T18:00:00+08:00 | review → done |
```

---

## PR 等待期间检查频率（v2.1.1）

提交 PR 后等待 Master 反馈期间的检查频率：

| Slaver 状态 | 检查频率 | 检查内容 |
|------------|---------|----------|
| 空闲等待 | 每 10 秒 | `inbox/human_feedback/`、消息队列、Ticket 状态 |
| 工作中 | 每 5 分钟 | `inbox/human_feedback/`、消息队列、Ticket 状态 |

**判定标准**：
- **空闲等待**：当前无其他 `in_progress` 任务
- **工作中**：有 1 个或多个 `in_progress` 任务并行开发

**检查内容**：
1. `inbox/human_feedback/` - Master 是否有新反馈文件
2. 消息队列 - 是否有 `pr_review_result` 类型消息
3. Ticket 状态 - 是否从 `review` 变更为 `approved`/`changes_requested`/`rejected`

### 消息队列通知格式

```json
{
  "id": "msg_20260410150000",
  "timestamp": "2026-04-10T15:00:00+08:00",
  "from": "slaver_20260410_150000_x9y8z7w6",
  "to": "broadcast",
  "type": "task_claimed",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "claimed_by": "slaver_20260410_150000_x9y8z7w6",
    "previous_status": "ready",
    "new_status": "in_progress"
  }
}
```

---

**优化检查维度**：
| 维度 | 检查点 | 工具 |
|------|--------|------|
| 代码质量 | ESLint 零错误、无 `any` 类型 | `npm run lint` |
| 测试覆盖 | 覆盖率 ≥ 80%、边界情况覆盖 | `npm test -- --coverage` |
| 性能 | 无 N+1 查询、大数据有缓存 | 人工审查 |
| 安全 | 输入验证、XSS/SQL 注入防护 | 人工审查 + 工具 |
| 文档 | JSDoc/TSDoc 完整、README 更新 | 人工审查 |

---

## Slaver 自检频率建议

| 检查类型 | 频率 | 触发时机 |
|----------|------|----------|
| 问题 1（依赖/阻塞） | 每 15 分钟 | 遇到困难时立即 |
| 问题 2（下一任务） | 完成任务时 | 当前任务提交 PR 后 |
| 问题 3（优化） | 提交 PR 前 | 完成编码准备测试时 |
| 问题 4（分析瘫痪） | 每次读操作后 | 连续 5 次读操作后立即 |

---

## Blocker 报告模板

发现问题 1 需要报告 Master 时，写入 `inbox/blocker_reports/blocker-{{YYYYMMDD-HHMM}}.md`：

```markdown
# Blocker 报告

**时间**: {{ISO8601 时间}}
**Slaver ID**: {{slaver_id}}
**当前任务**: {{TICKET-ID}}

## 问题描述
{{清晰描述遇到的阻塞}}

## 已尝试的解决方案
- [ ] {{方案 1}} → {{结果}}
- [ ] {{方案 2}} → {{结果}}

## 需要的帮助
- [ ] 需要技术决策
- [ ] 需要需求澄清
- [ ] 需要协调其他 Slaver
- [ ] 其他：{{说明}}

## 阻塞影响
- 当前任务状态：{{status}}
- 预计延迟：{{X}} 小时/天
- 是否影响关键路径：是/否

## 等待期间计划
在等待 Master 回复期间，我将：
- [ ] 继续执行 {{其他可并行任务}}
- [ ] 暂停当前任务
- [ ] 预计 {{X}} 小时后如无回复将发送提醒

---
**状态**: awaiting_arbitration
```

---

## 任务领取模板

完成当前任务后领取新任务时，更新 `jira/tickets/{TICKET-ID}.md`：

```markdown
## 执行记录

### 领取信息
- **领取者**: {{slaver_id}}
- **领取时间**: {{ISO8601 时间}}
- **预计工时**: {{X}}h
- **状态已更新**: [x] ready → in_progress

### 上一任务
- **Ticket ID**: {{PREV_TICKET_ID}}
- **完成时间**: {{ISO8601 时间}}
- **PR 状态**: submitted / merged
```

---

## PR 自检清单（提交前必填）

在 `jira/tickets/{TICKET-ID}.md` 的"执行记录"中：

```markdown
### PR 自检

- [ ] 代码通过 `npm run lint`
- [ ] 测试通过 `npm test`
- [ ] 测试覆盖率 ≥ 80%
- [ ] 无明显的性能问题
- [ ] 无安全隐患
- [ ] 文档已更新
- [ ] 提交历史已整理（rebase/squash）
- [ ] 分支已同步上游最新代码
- [ ] **Artifact Schema 已填写**：Ticket 的执行记录包含 `implementation_report` 结构化字段（test_result 必须是真实命令输出，非描述）

**自检时间**: {{ISO8601 时间}}
**自检者**: {{slaver_id}}
```

---

## 偏差处理协议（Deviation Rules）

执行任务时遇到超出 ticket 范围的问题，按以下规则处理：

| 规则 | 触发条件 | 行动 | 范围限制 |
|------|---------|------|---------|
| Rule 1 — Bug Fix | 当前实现中发现明确 bug（逻辑错误/类型错误/边界条件） | 自动修复，PR 描述注明 | 仅限当前 ticket 修改过的文件 |
| Rule 2 — Missing Critical | 缺失 error handling/输入校验/关键 null guard | 自动补充，PR 描述注明 | 仅限新增代码，不重构已有代码 |
| Rule 3 — Blocking | missing dependency/broken import/编译错误 | 自动修复，记录在 PR | 只修复影响当前 ticket 的阻塞点 |
| Rule 4 — Architectural | 需要修改 DB schema/新建 service/修改公共 API/大规模重构（100+ 行） | 暂停，写入 inbox/human_feedback/，标注 [BLOCKED-ARCH] | 不得自行决定 |

**兜底规则**：同一问题尝试修复 ≥ 3 次仍失败 → 停止，在执行报告 `deferred_issues` 里记录失败细节，等待 Master。

**预存在问题处理**：发现非本 ticket 引入的 bug → 记录到执行报告 `deferred_issues` 字段，不修复，避免意外变更范围。

### Rule 4 判断清单（以下任一 = 必须上报）

- [ ] 需要修改或新建数据库 schema / migration
- [ ] 需要新建 service 文件（不在 ticket 指定范围内）
- [ ] 需要修改对外公共 API 接口（影响其他 Slaver 的依赖）
- [ ] 需要修改超过 100 行已有代码（大规模重构）
- [ ] 不确定是否属于 Rule 4 → 按 Rule 4 处理（宁可多报，不要擅自决定）

---

## 可用命令集（Agent-Computer Interface）

### ✅ 允许的命令类别

| 类别 | 允许命令 | 说明 |
|------|---------|------|
| 读取代码 | `cat`, `grep`, `find`, `ls`, `wc` | 只读，无副作用 |
| 编辑代码 | `Edit`/`Write`/`Read` 工具 | 通过 Claude Code 工具，有权限控制 |
| 测试 | `npm test`, `npm run lint`, `npm run build` | 项目标准命令 |
| Git 只读 | `git status`, `git log`, `git diff`, `git branch` | 查看状态，不修改 |
| Git 提交 | `git add`, `git commit`, `git push origin <feature-branch>` | 仅限 feature/* 分支 |
| 脚本 | `bash scripts/validate-ticket-template.sh` | 项目内白名单脚本 |

### ❌ 禁止的命令

| 命令 | 原因 |
|------|------|
| `git push --force` / `git push -f` | 可能破坏他人工作 |
| `git reset --hard` | 不可逆破坏 |
| `rm -rf` | 不可逆删除 |
| `git push origin main` / `origin miao` | 受保护分支，必须走 PR |
| `npm publish` / `pip publish` | 发布操作，需 Master 授权 |
| `sudo` / `chmod 777` | 权限提升 |
| 任何直接操作数据库的命令 | 绕过应用层 |

### 🟡 需要确认再用的命令

- `git rebase` — 可能产生冲突，执行前说明原因
- `npm install <new-package>` — 新增依赖需在 PR 描述说明
- `curl` / `wget` — 网络请求需说明目的

---

## 相关文档

- [SLAVER-AUTO-EXEC-GUIDE.md](./SLAVER-AUTO-EXEC-GUIDE.md) — Slaver 自动执行流程
- [TICKET-RESPONSIBILITIES.md](./TICKET-RESPONSIBILITIES.md) — Ticket 职责边界
- [MASTER-HEARTBEAT-CHECKLIST.md](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 心跳检查

---

**维护者**: EKET Framework Team
**最后更新**: 2026-04-14
