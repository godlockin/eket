# Step 3: 任务拆解 SOP

**版本**: 1.0.0
**最后更新**: 2026-03-23
**负责智能体**: 项目经理

---

## 目标

将需求文档和架构文档拆解为可执行的 Jira tickets，设定优先级和依赖关系。

---

## 输入

| 输入项 | 位置 | 说明 |
|--------|------|------|
| 需求文档 | `confluence/projects/{project}/requirements/requirements.md` | 功能需求 |
| 架构文档 | `confluence/projects/{project}/architecture/` | 技术设计 |
| 验收标准 | `confluence/projects/{project}/requirements/acceptance-criteria.md` | 验收条件 |

---

## 输出

| 输出项 | 位置 | 说明 |
|--------|------|------|
| Epics | `jira/epics/` | 大型功能模块 |
| Feature Tickets | `jira/tickets/feature/` | 功能开发任务 |
| Task Tickets | `jira/tickets/task/` | 通用任务 |
| 依赖关系图 | `.eket/state/dependency-graph.yml` | 任务依赖关系 |
| 优先级列表 | `.eket/state/priority-list.yml` | 任务优先级排序 |

---

## 任务类型定义

| 类型 | 目录 | 说明 | 预估工时 |
|------|------|------|---------|
| **Epic** | `jira/epics/` | 大型功能模块，包含多个 tickets | 20+ 小时 |
| **Feature** | `jira/tickets/feature/` | 功能开发任务 | 4-8 小时 |
| **Bugfix** | `jira/tickets/bugfix/` | 缺陷修复任务 | 1-4 小时 |
| **Task** | `jira/tickets/task/` | 通用任务（文档、调研等） | 2-4 小时 |
| **Improvement** | `jira/tickets/improvement/` | 改进任务 | 2-4 小时 |

---

## 详细步骤

### 3.1 创建 Epics

**目的**: 将系统功能按模块组织为 Epics

**步骤**:
1. 分析需求文档中的功能模块
2. 为每个主要功能模块创建 Epic
3. 定义 Epic 的目标和范围

**Epic 模板**:
```markdown
# {EPIC_ID}: {Epic 名称}

**类型**: Epic
**优先级**: {P0/P1/P2/P3}
**状态**: backlog
**标签**: `{tag1}` `{tag2}`

---

## Epic 描述

{Epic 的目标和价值}

---

## 功能范围

### 包含功能
- [ ] {功能 1}
- [ ] {功能 2}

### 不包含功能
- {明确排除的功能}

---

## 成功标准

- {衡量 Epic 完成的标准}

---

## 依赖关系

- **依赖**: [{EPIC_ID}, ...]
- **阻塞**: [{EPIC_ID}, ...]

---

## 关联 Tickets

| Ticket ID | 类型 | 标题 | 状态 |
|-----------|------|------|------|
| FEAT-001 | Feature | {标题} | ready |
| FEAT-002 | Feature | {标题} | ready |

---

**创建时间**: {timestamp}
**创建者**: {agent_name}
```

**检查清单**:
- [ ] 每个 Epic 有明确目标
- [ ] Epic 范围清晰
- [ ] 依赖关系明确
- [ ] Epic 数量合理（通常 3-5 个）

---

### 3.2 拆解 Feature Tickets

**目的**: 将 Epic 拆解为可独立开发的功能任务

**步骤**:
1. 阅读 Epic 文档
2. 将 Epic 拆解为 4-8 小时可完成的任务
3. 为每个任务定义验收标准

**Feature Ticket 模板**:
```markdown
# {TICKET_ID}: {功能名称}

**类型**: Feature
**Epic**: [{EPIC_ID}](../../epics/{EPIC_ID}.md)
**优先级**: {P0/P1/P2/P3}
**状态**: ready
**标签**: `{tag1}` `{tag2}`
**预估工时**: {4-8} 小时

---

## 任务描述

{功能的详细描述}

**用户故事**:
```
作为 {角色}，
我想要 {功能}，
以便于 {价值}
```

---

## 验收标准

- [ ] {验收标准 1}
- [ ] {验收标准 2}
- [ ] {验收标准 3}

---

## 技术实现要点

{技术实现的关键点和注意事项}

---

## 依赖关系

- **依赖**: [{TICKET_ID}, ...]
- **阻塞**: [{TICKET_ID}, ...]

---

## 时间追踪

- **预估时间**: {X} 分钟
- **开始时间**: (待领取后填写)
- **截止时间**: (待领取后填写)
- **最后更新**: (待领取后填写)
- **最后心跳**: (待领取后填写)

---

## 人类参与

- [ ] 依赖确认 (如需要)
- [ ] 仲裁决策 (如需要)
- [ ] 任务完成确认

---

**创建时间**: {timestamp}
**创建者**: {agent_name}
```

**检查清单**:
- [ ] 任务粒度适中（4-8 小时）
- [ ] 验收标准可测试
- [ ] 依赖关系明确
- [ ] 关联到正确的 Epic

---

### 3.3 设定优先级

**目的**: 为任务设定合理的优先级

**优先级定义**:
| 优先级 | 说明 | 处理时限 |
|--------|------|---------|
| **P0** | 阻塞性任务，必须立即处理 | 立即 |
| **P1** | 高优先级，影响核心功能 | 24 小时内 |
| **P2** | 中优先级，重要但不紧急 | 本周内 |
| **P3** | 低优先级，可以延后 | 下周或以后 |

**优先级评估维度**:
| 维度 | 权重 | 说明 |
|------|------|------|
| 业务价值 | 高 | 对核心功能的影响 |
| 依赖关系 | 高 | 是否阻塞其他任务 |
| 风险 | 中 | 实现风险大小 |
| 工作量 | 中 | 是否需要较长时间 |

**优先级评分公式**:
```
基础分 = 100

# 优先级加成
P0: +100 分 (urgent)
P1: +50 分
P2: +25 分
P3: +0 分

# 类型加成
bugfix: +20 分
feature: +10 分
improvement: +0 分

# 依赖加成
有阻塞依赖：+30 分
是其他任务依赖：-15 分

# 最终得分决定排序
```

---

### 3.4 定义依赖关系

**目的**: 明确任务之间的依赖关系

**依赖类型**:
| 类型 | 说明 | 示例 |
|------|------|------|
| **硬依赖** | 必须完成前序任务才能开始 | 数据库设计 → 后端开发 |
| **软依赖** | 前序任务完成后效率更高 | API 设计 → 前后端开发 |
| **阻塞** | 此任务阻塞其他任务 | 架构设计阻塞所有开发 |

**依赖关系图模板** (`.eket/state/dependency-graph.yml`):
```yaml
# 任务依赖图
# 生成时间：{timestamp}

tasks:
  FEAT-001:
    title: "用户注册功能"
    depends_on: []
    blocked_by: []
    blocks: [FEAT-002, FEAT-003]

  FEAT-002:
    title: "用户登录功能"
    depends_on: [FEAT-001]
    blocked_by: [FEAT-001]
    blocks: [FEAT-004]

  FEAT-003:
    title: "个人资料编辑"
    depends_on: [FEAT-001]
    blocked_by: [FEAT-001]
    blocks: []

  FEAT-004:
    title: "仪表盘"
    depends_on: [FEAT-002]
    blocked_by: [FEAT-002]
    blocks: []

# 关键路径
critical_path:
  - FEAT-001
  - FEAT-002
  - FEAT-004
```

**检查清单**:
- [ ] 所有依赖关系已识别
- [ ] 依赖图无循环依赖
- [ ] 关键路径已识别
- [ ] 依赖关系已记录

---

### 3.5 创建 Task/Bugfix Tickets

**目的**: 创建非功能开发类任务

**Task 类型**:
| 类型 | 说明 | 示例 |
|------|------|------|
| **Task** | 通用任务 | 文档编写、环境搭建 |
| **Bugfix** | 缺陷修复 | 修复已发现的 bug |
| **Improvement** | 改进任务 | 性能优化、重构 |

**Task Ticket 模板**:
```markdown
# {TICKET_ID}: {任务名称}

**类型**: {Task/Bugfix/Improvement}
**优先级**: {P0/P1/P2/P3}
**状态**: ready
**标签**: `{tag1}` `{tag2}`
**预估工时**: {X} 小时

---

## 任务描述

{任务详细描述}

---

## 验收标准

- [ ] {验收标准 1}
- [ ] {验收标准 2}

---

## 时间追踪

- **预估时间**: {X} 分钟
- **开始时间**: (待领取后填写)
- **截止时间**: (待领取后填写)

---

**创建时间**: {timestamp}
**创建者**: {agent_name}
```

---

### 3.6 创建 Checkpoint

**Checkpoint 名称**: `phase1_tasks_created`

**Checkpoint 文件**: `.eket/state/checkpoints/{project}-tasks-created.md`

**内容**:
```markdown
# Checkpoint: Phase1 Tasks Created

**项目**: {project}
**时间**: {timestamp}
**负责人**: 项目经理

---

## 检查项

- [ ] Epics 已创建
- [ ] Feature tickets 已创建
- [ ] 优先级已设定
- [ ] 依赖关系已定义

## 交付物

- [ ] jira/epics/*.md (至少 1 个)
- [ ] jira/tickets/feature/*.md (至少 5 个)
- [ ] .eket/state/dependency-graph.yml
- [ ] .eket/state/priority-list.yml

## 任务统计

| 类型 | 数量 |
|------|------|
| Epics | {N} |
| Features | {N} |
| Tasks | {N} |
| Bugfixes | {N} |

---

**状态**: checkpoint_recorded
```

---

## 质量检查

### 任务拆解质量

- [ ] 任务粒度适中（4-8 小时）
- [ ] 任务描述清晰
- [ ] 验收标准可测试
- [ ] 无遗漏功能

### 优先级设定质量

- [ ] 优先级评估一致
- [ ] 关键路径任务优先级高
- [ ] 阻塞任务优先处理

### 依赖关系质量

- [ ] 依赖关系完整
- [ ] 无循环依赖
- [ ] 关键路径已识别

---

## 相关文件

- [Phase 1 SOP](../phase-1-initiation/README.md)
- [Ticket 状态机](../../03-implementation/STATE_MACHINE.md)
- [分支管理策略](../../03-implementation/BRANCH_STRATEGY.md)

---

**SOP 版本**: 1.0.0
**创建日期**: 2026-03-23
**维护者**: EKET Framework Team
