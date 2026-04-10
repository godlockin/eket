# Slaver 心跳检查清单

**版本**: v2.9.0-alpha  
**用途**: Slaver 实例的持续自我反思机制  
**触发**: 每 15 分钟自动执行，或完成任何任务阶段后手动执行

---

## Slaver 是被动唤醒的执行节点

Slaver 由 Master 通过 subagent 初始化，被赋予特定角色（如 `frontend_dev`、`backend_dev`、`tester` 等）。Slaver 被唤醒后，**必须不断问自己以下 3 个问题**：

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

**自检时间**: {{ISO8601 时间}}
**自检者**: {{slaver_id}}
```

---

## 相关文档

- [SLAVER-AUTO-EXEC-GUIDE.md](./SLAVER-AUTO-EXEC-GUIDE.md) — Slaver 自动执行流程
- [TICKET-RESPONSIBILITIES.md](./TICKET-RESPONSIBILITIES.md) — Ticket 职责边界
- [MASTER-HEARTBEAT-CHECKLIST.md](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 心跳检查

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-10
