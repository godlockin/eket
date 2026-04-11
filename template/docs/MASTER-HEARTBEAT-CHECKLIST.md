# Master 心跳检查清单

**版本**: v2.1.2  
**用途**: Master 实例的持续自我反思机制  
**触发**: 根据 Master 状态动态调整检查频率

---

## 检查频率（v2.1.2）

| Master 状态 | 检查频率 | 检查内容 |
|------------|---------|----------|
| 空闲 | 每 10 秒 | PR 队列、仲裁请求、人类通知 |
| 工作中 | 每 5 分钟 | PR 队列、Slaver 状态、项目进度 |
| 等待人类反馈 | 每 10 秒 | `inbox/human_feedback/` 回复 |
| **定期任务** | **每 10 分钟** | **项目状态更新、Slaver 空闲检测、所有卡状态** |
| **等待 PR Review 期间** | **每 5 分钟** | **同步 roadmap、规划下阶段任务、拆解新需求** |

**状态判定**：
- **空闲**：无进行中的 Review、无待处理仲裁、无等待人类决策
- **工作中**：有 Review 进行中、或有 Slaver 等待仲裁、或有任务分析/拆解中
- **等待人类反馈**：已发送决策请求，等待人类回复
- **等待 PR Review 期间**：PR 已提交给人类/Master Review，等待反馈中

**定期任务（每 10 分钟）**：
无论 Master 处于什么状态，每 10 分钟执行一次项目状态更新：
1. 更新 `jira/state/ticket-index.yml`
2. 检查 Slaver 空闲状态
3. 生成项目状态报告到 `jira/state/project-status.yml`

**等待 PR Review 期间的主动工作（v2.1.4）**：
Master 在等待 PR 反馈期间**不是被动等待**，而是主动执行以下工作：
1. 同步/修正 roadmap（对齐当前进度）
2. 规划下阶段任务（下一个 Sprint/Milestone）
3. 拆解新需求到 ticket 级别
4. 标记 ticket 优先级和依赖关系
5. 预初始化 Slaver 团队（让新任务保持 ready 状态）

---

## 快速检查（空闲模式 - 每 10 秒）

### □ PR 队列检查

**检查位置**：
- `outbox/review_requests/` — 待审核 PR 列表
- `jira/tickets/*/status: review` — Review 状态任务

**行动**：
- [ ] 是否有新的 PR 请求？
- [ ] 是否有 PR 等待超过 30 分钟？
- [ ] 立即开始审核最紧急的 PR

### □ 仲裁请求检查

**检查位置**：
- `inbox/blocker_reports/` — Slaver 阻塞报告
- `shared/message_queue/inbox/` — 仲裁请求消息

**行动**：
- [ ] 是否有新的仲裁请求？
- [ ] 是否有阻塞超过 30 分钟？
- [ ] 立即介入仲裁或升级到人类

### □ 人类通知检查

**检查位置**：
- `inbox/human_feedback/` — 人类回复
- `inbox/human_input.md` — 新需求输入

**行动**：
- [ ] 人类是否回复了决策请求？
- [ ] 是否有新需求输入？
- [ ] 立即处理人类反馈

---

## 详细检查（工作模式 - 每 5 分钟）

### □ 问题 1：我的任务有哪些？怎么分优先级？

**检查位置**：
- `inbox/human_input.md` — 新需求入口
- `jira/tickets/backlog/` — 待处理任务
- `jira/tickets/analysis/` — 分析中任务

**优先级排序**：
```
P0 (紧急): 生产事故、Block 问题
P1 (高):   关键路径任务、阻塞其他任务
P2 (中):   正常功能开发
P3 (低):   优化类、技术债务
```

**下一步行动**：
- [ ] 识别出下一个要处理的任务
- [ ] 如果有新需求，开始需求分析
- [ ] 如果任务不清晰，创建澄清任务

**检查位置**：
- `jira/tickets/*/status: in_progress` — 进行中的任务
- `jira/tickets/*/last_heartbeat` — 最后更新时间
- `shared/message_queue/inbox/` — Slaver 消息

**检测规则**：
| 状态 | 判定 | 行动 |
|------|------|------|
| 正常 | 最后更新 < 15 分钟 | 继续观察 |
| 警告 | 最后更新 15-30 分钟 | 发送心跳检查 |
| 危险 | 最后更新 > 30 分钟 | 立即介入 |

**依赖检查**：
- [ ] 是否有任务标记为 `blocked_by` 其他任务？
- [ ] 被依赖的任务进度如何？
- [ ] 是否需要调整优先级解锁阻塞？

**Slaver 阻塞报告**：
- [ ] 检查 `inbox/blocker_reports/` 是否有新报告
- [ ] 如果有，立即仲裁或升级到人类

---

## 等待 PR Review 期间的主动工作（v2.1.4）

**核心原则**：Master 在等待 PR 反馈期间**不是被动等待**，而是主动执行项目管理和规划工作。

### □ 任务 1：同步和修正 roadmap

**检查位置**：
- `confluence/projects/{project}/roadmap.md` — 产品路线图
- `jira/state/project-status.yml` — 当前项目状态
- `jira/tickets/*/status: done` — 已完成任务

**行动清单**：
- [ ] 检查已完成的任务，更新 roadmap 完成百分比
- [ ] 识别延期的任务，调整里程碑日期
- [ ] 标记风险项（可能影响交付的功能）
- [ ] 更新 `roadmap.md` 的进度状态

**Roadmap 同步模板**：
```markdown
## 当前进度（更新于：YYYY-MM-DD HH:mm）

| Milestone | 计划完成 | 预计完成 | 完成率 | 状态 |
|-----------|----------|----------|--------|------|
| MILESTONE-001 | 2026-04-15 | 2026-04-15 | 80% | 🟢 正常 |
| MILESTONE-002 | 2026-04-30 | 2026-05-05 | 30% | 🟡 风险 |

## 本周完成
- [x] FEAT-001: 用户登录功能
- [x] FEAT-002: 用户注册功能
- [ ] FEAT-003: 个人资料页 (进行中)

## 下周计划
- [ ] FEAT-004: 密码重置
- [ ] FEAT-005: 邮箱验证
```

### □ 任务 2：规划下阶段任务

**检查位置**：
- `confluence/projects/{project}/requirements/prd.md` — 产品需求文档
- `jira/sprints/` — 当前和下一 Sprint
- `jira/tickets/backlog/` — 待拆解需求

**行动清单**：
- [ ] 识别下一个 Sprint 的主题和目标
- [ ] 从 PRD 中提取未实现的功能
- [ ] 创建下一 Sprint 的草案文档
- [ ] 预估下阶段需要的 Slaver 角色和数量

**下阶段规划模板**：
```markdown
## Sprint {N+1} 规划草案

**主题**: {Sprint 主题}
**日期**: YYYY-MM-DD ~ YYYY-MM-DD
**目标**:
1. 目标 1
2. 目标 2

**预估任务**:
| 功能 | 优先级 | 预估工时 | 适配角色 |
|------|--------|----------|----------|
| 功能 A | P1 | 8h | frontend_dev |
| 功能 B | P1 | 12h | backend_dev |
| 功能 C | P2 | 4h | fullstack |

**需要的 Slaver 角色**:
- frontend_dev × 1
- backend_dev × 1
- tester × 1
```

### □ 任务 3：拆解新需求到 Ticket 级别

**检查位置**：
- `inbox/human_input.md` — 新需求
- `confluence/projects/{project}/requirements/user_stories.md` — 用户故事
- `jira/epics/` — Epic 列表

**拆解流程**：
```
1. 阅读需求/用户故事
   ↓
2. 识别功能模块
   ↓
3. 创建 Epic（如需要）
   ↓
4. 拆解为 Ticket（每个 Ticket 4-16 小时）
   ↓
5. 定义验收标准
   ↓
6. 标记优先级和依赖关系
   ↓
7. 状态设为 ready（等待 Slaver 领取）
```

**Ticket 创建检查清单**：
- [ ] Ticket 标题清晰描述任务
- [ ] 优先级正确（P0/P1/P2/P3）
- [ ] 适配角色明确（frontend_dev/backend_dev 等）
- [ ] 预估工时合理（4-16 小时）
- [ ] 验收标准可测试
- [ ] 依赖关系标记正确
- [ ] 关联到正确的 Epic/Sprint/Milestone

### □ 任务 4：标记 Ticket 优先级和依赖

**检查位置**：
- `jira/tickets/` — 所有 Ticket
- `jira/state/ticket-index.yml` — 索引文件

**优先级判定标准**：
| 优先级 | 判定标准 | 响应时间 |
|--------|----------|----------|
| P0 | 生产事故、阻塞关键路径 | 立即 |
| P1 | 高优先级功能、影响核心体验 | 24 小时 |
| P2 | 正常功能、按顺序开发 | 3 天 |
| P3 | 优化类、技术债务 | 1 周 |

**依赖关系标记**：
```markdown
## 依赖关系

**blocks**: [本任务阻塞哪些任务]
- TASK-002

**blocked_by**: [本任务被哪些任务阻塞]
- TASK-001

**related**: [相关任务，可并行开发]
- TASK-003, TASK-004
```

**行动清单**：
- [ ] 扫描所有 `ready` 状态的 Ticket
- [ ] 确认优先级是否合理
- [ ] 标记依赖关系
- [ ] 识别关键路径任务
- [ ] 调整优先级确保关键路径优先

### □ 任务 5：预初始化 Slaver 团队

**检查位置**：
- `jira/state/ticket-index.yml` - `ready` 状态任务列表
- `.eket/state/profiles/` — Slaver 角色配置

**预初始化流程**：
```
1. 分析 ready 任务的技能需求
   ↓
   扫描所有 ready tickets 的技能标签
   例：[react, typescript] × 3 + [nodejs, postgresql] × 2

2. 确定需要的 Slaver 角色组合
   ↓
   frontend_dev × 2 (处理 3 个前端任务)
   backend_dev × 1 (处理 2 个后端任务)

3. 检查现有 Slaver 工作负载
   ↓
   - 有空闲 Slaver → 通知领取任务
   - 无空闲 Slaver → 预配置新 Slaver 角色

4. 预初始化 Slaver 配置
   ↓
   创建 .eket/state/profiles/{new_slaver}.yml
   写入角色配置和技能要求
```

**行动清单**：
- [ ] 统计 `ready` 状态任务数量
- [ ] 按角色分类汇总工时
- [ ] 对比现有 Slaver 工作负载
- [ ] 识别人力缺口
- [ ] 预配置新 Slaver 角色（如需要）

---

## 等待期间的工作优先级决策树

```
等待 PR Review 反馈
    │
    ▼
是否有新的 human_input？
    ├── 是 → 启动需求分析流程（最高优先级）
    └── 否 → 继续往下
            │
            ▼
Roadmap 是否需要更新？
    ├── 是（> 10 分钟未更新） → 同步 roadmap 进度
    └── 否 → 继续往下
            │
            ▼
下阶段规划是否清晰？
    ├── 否 → 创建下一 Sprint 规划草案
    └── 否 → 继续往下
            │
            ▼
是否有未拆解的需求？
    ├── 是 → 拆解需求到 Ticket 级别
    └── 否 → 继续往下
            │
            ▼
ready 任务是否充足？
    ├── 否（< 2 个任务/Slaver） → 创建更多 ready 任务
    └── 是 → 检查 Slaver 工作负载，预初始化团队
```

---

## 定期任务：项目状态更新（每 10 分钟）（v2.1.2）

**无论 Master 处于什么状态，每 10 分钟必须执行一次项目状态更新。**

### 步骤 1: 更新 ticket 索引

**文件**: `jira/state/ticket-index.yml`

**行动**：
1. 扫描所有 tickets，更新状态
2. 更新 `last_updated` 时间戳
3. 更新 `by_id` 快速查找表

### 步骤 2: 检查 Slaver 空闲状态

**检查位置**：
- `jira/state/ticket-index.yml` - `slaver_workload` 部分
- `.eket/state/slavers/` - Slaver 标记文件

**判定标准**：
| 条件 | 状态 |
|------|------|
| 无 `in_progress` 任务 | idle |
| 有 `in_progress` 任务 | busy |
| 有任务等待 review 反馈 | waiting_review |

**行动**：
- [ ] 识别空闲 Slaver（超过 10 分钟无任务）
- [ ] 检查是否有 `ready` 状态的任务可分配
- [ ] 如有需要，通知空闲 Slaver 领取任务

### 步骤 3: 生成项目状态报告

**文件**: `jira/state/project-status.yml`

**内容**：
1. Slaver 状态列表（空闲/工作中）
2. 所有 Cards 状态（按状态分组 + 详细信息）
3. 项目进度（Sprint 完成情况）
4. 风险与卡点
5. 待办事项

---

### □ 问题 3：项目进度是什么？有没有卡点？

**检查位置**：
- `confluence/projects/{project}/roadmap.md` — Milestone 计划
- `jira/state/sprint_progress.json` — 当前 Sprint 进度

**进度计算**：
```
本 Sprint 目标：{{目标描述}}
截止日期：{{YYYY-MM-DD}}
剩余天数：{{X}} 天

完成任务：{{N}} / {{M}}
完成率：{{XX}}%
预测完成：{{能/不能}} 按时交付
```

**卡点识别**：
| 卡点类型 | 症状 | 行动 |
|----------|------|------|
| 技术卡点 | 同一任务多次 review 不通过 | 组织技术评审 |
| 人力卡点 | 关键角色缺失或过载 | 调整资源或请求支援 |
| 需求卡点 | 任务反复变更 | 拉齐人类确认需求 |

---

### □ 问题 4：是否有 block 的问题需要决策？

**Block 问题清单**（任一为真即触发升级）：
- [ ] 需求不明确，无法拆解任务
- [ ] 技术方案有争议，Slaver 无法执行
- [ ] Scope 变更影响 Milestone 交付
- [ ] 资源不足（人力/时间/技术）
- [ ] 人类有特殊偏好需要确认

**决策树**：

```
发现 Block 问题
    │
    ▼
是否影响当前关键路径？
    ├── 是 → **立刻停下所有工作** → 写入 inbox/human_feedback/ → 等待
    └── 否 → 记录到风险清单，继续执行
    
等待人类回复期间：
    ├── 人类确认 → 执行决策 → 更新任务状态
    ├── 人类要求更多信息 → 补充信息 → 继续等待
    └── 人类无回复（> 4 小时）→ 发送提醒 → 调整计划
```

---

## 人类反馈写入模板

当发现问题 4 需要人类决策时，写入 `inbox/human_feedback/block-{{YYYYMMDD-HHMM}}.md`：

```markdown
# Block 问题报告

**时间**: {{ISO8601 时间}}
**严重级别**: P0(阻塞交付) / P1(影响进度) / P2(可绕行)

## 问题描述
{{清晰描述需要决策的问题}}

## 背景信息
- 受影响的任务：{{TICKET-ID}}
- 当前状态：{{status}}
- 影响范围：{{描述}}

## 可选方案
| 选项 | 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| A | {{方案 A}} | ... | ... | ⭐⭐⭐ |
| B | {{方案 B}} | ... | ... | ⭐⭐ |

**Master 推荐**: 选项 {{A/B}}，理由：{{理由}}

## 需要人类决策
{{具体说明需要人类回答什么问题}}

## 等待期间计划
在等待人类回复期间，我将：
- [ ] 继续执行 {{其他任务}}
- [ ] 暂停 {{受影响任务}}
- [ ] 预计 {{X}} 小时后如无回复将发送提醒

---
**状态**: pending_human_decision
```

---

## Milestone 总结汇报模板

当到达 Milestone 节点时，写入 `inbox/human_feedback/milestone-{{YYYYMMDD}}.md`：

```markdown
# Milestone 总结报告

**时间**: {{ISO8601 时间}}
**Milestone**: {{Milestone 名称}}
**计划完成**: {{计划日期}}
**实际完成**: {{实际日期}}

## 完成情况
| 指标 | 计划 | 实际 | 偏差 |
|------|------|------|------|
| 完成任务数 | {{N}} | {{M}} | {{±X}} |
| 完成率 | 100% | {{XX}}% | {{±XX}}% |
| 延期天数 | 0 | {{X}} | +{{X}} |

## 主要成果
- {{成果 1}}
- {{成果 2}}

## 遇到的问题
- {{问题 1}} → {{解决方案}}
- {{问题 2}} → {{解决方案}}

## 经验教训
- {{教训 1}}
- {{教训 2}}

## 下一 Milestone 计划
- 目标：{{目标}}
- 预计开始：{{日期}}
- 预计完成：{{日期}}

---
**状态**: pending_confirmation
**请人类确认**: [ ] 同意本报告 [ ] 需要修改：{{说明}}
```

---

## 检查频率建议

| 检查类型 | 频率 | 执行时机 |
|----------|------|----------|
| 问题 1（任务优先级） | 每 30 分钟 | 完成任何任务后 |
| 问题 2（Slaver 状态） | 每 15 分钟 | 收到消息队列通知时 |
| 问题 3（项目进度） | 每天 1 次 | 每日站会时间（如 9:00） |
| 问题 4（Block 决策） | **实时** | 任何阻塞发生时 |

---

## 相关文档

- [MASTER-WORKFLOW.md](./MASTER-WORKFLOW.md) — Master 完整工作流程
- [TICKET-RESPONSIBILITIES.md](./TICKET-RESPONSIBILITIES.md) — Ticket 职责边界
- [SLAVER-AUTO-EXEC-GUIDE.md](./SLAVER-AUTO-EXEC-GUIDE.md) — Slaver 自动执行指南

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-10
