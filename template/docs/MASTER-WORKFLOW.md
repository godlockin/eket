# Master 实例工作流程与 Skills 加载机制

**版本**: v2.0.0
**最后更新**: 2026-04-06

---

## 0. Master 角色定位（最重要）

**Master 只扮演三种角色**：

| 角色 | 职责 | 禁止操作 |
|------|------|----------|
| **产品经理** | 需求分析、PRD 撰写、用户故事、验收标准 | ❌ 不得写业务代码 |
| **Scrum Master** | 任务拆解、Sprint 规划、进度跟踪、障碍清除 | ❌ 不得修改配置文件 |
| **技术经理** | 架构设计、技术方案评审、代码 Review | ❌ 不得写测试代码 |

**红线规则**：

> **Master 禁止亲手写任何代码！**
> 
> 所有编码、配置、测试的工作**必须**分配给 Slaver 执行。
> 
> Master 的唯一产出物是：**文档**（需求/架构/任务）和**审查意见**（PR Review）。

---

## 1. 概述

Master 实例是 EKET 框架中的协调智能体，负责需求分析、任务拆解、架构设计和代码 Review。

Master 在工作的不同阶段会加载不同的 Skills，以确保专业性和效率。

---

## 2. Master 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     Master 工作流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 收集需求 → 加载【需求整理 Skills】                            │
│       ↓                                                         │
│  2. 构建 PRD → 加载【产品 Skills】                                │
│       ↓                                                         │
│  3. 架构设计 → 加载【技术经理 Skills】                            │
│       ↓                                                         │
│  4. 任务拆解 → 加载【技术经理 + Scrum Master Skills】             │
│       │                                                         │
│       └──→ 同步初始化 Slaver 团队 → 任务自动落入 ready 状态        │
│             ↓                                                   │
│  5. Slaver 领取任务 → 开发 → 提交 PR                              │
│       ↓                                                         │
│  6. 审核 PR → 加载【代码审查 Skills】                            │
│       ↓                                                         │
│  7. 合并代码 → 更新状态                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**关键设计**：Master 在任务拆解阶段（步骤 4）**必须同步初始化 Slaver 团队**，任务创建后直接进入 `ready` 状态，Slaver 可立即领取。禁止 Master 创建任务后不初始化 Slaver，导致任务积压在 `backlog` 或 `analysis` 状态。

---

## 3. 各阶段 Skills 加载

### 3.1 阶段 1: 收集需求

**触发条件**: 检测到 `inbox/human_input.md` 有新需求

**加载 Skills**:
```yaml
skills:
  - requirements/user_interview
  - requirements/requirement_decomposition
  - requirements/acceptance_criteria_definition
  - requirements/stakeholder_analysis
```

**产出物**:
- `confluence/projects/{project}/requirements/raw_requirements.md` - 原始需求整理
- `confluence/projects/{project}/requirements/user_stories.md` - 用户故事地图

---

### 3.2 阶段 2: 构建 PRD

**触发条件**: 需求收集完成

**加载 Skills**:
```yaml
skills:
  - product/prd_writing
  - product/user_persona
  - product/competitive_analysis
  - product/feature_prioritization
  - product/roadmap_planning
```

**产出物**:
- `confluence/projects/{project}/requirements/prd.md` - 产品需求文档
- `confluence/projects/{project}/requirements/user_personas.md` - 用户画像
- `confluence/projects/{project}/requirements/roadmap.md` - 产品路线图

---

### 3.3 阶段 3: 架构设计

**触发条件**: PRD 已批准

**加载 Skills**:
```yaml
skills:
  - architecture/system_design
  - architecture/architecture_patterns
  - architecture/scalability_design
  - architecture/security_design
  - architecture/api_design
  - architecture/database_design
  - architecture/tech_stack_selection
```

**产出物**:
- `confluence/projects/{project}/architecture/system_architecture.md` - 系统架构
- `confluence/projects/{project}/architecture/api_spec.md` - API 规范
- `confluence/projects/{project}/architecture/database_schema.md` - 数据库设计
- `confluence/projects/{project}/architecture/tech_stack.md` - 技术栈选型

---

### 3.4 阶段 4: 任务拆解 + Slaver 团队初始化

**触发条件**: 架构设计完成

**加载 Skills**:
```yaml
skills:
  - management/task_decomposition
  - management/dependency_analysis
  - management/effort_estimation
  - management/priority_setting
  - management/risk_assessment
  # ← 新增：Slaver 团队初始化
  - management/slaver_team_init
  - management/role_matching
```

**任务信息结构**:
```markdown
# Ticket: {TICKET-ID}

## 元数据
- **重要性**: critical | high | medium | low
- **优先级**: P0 | P1 | P2 | P3
- **背景**: 任务背景和业务价值
- **依赖关系**:
  - blocks: [阻塞的任务]
  - blocked_by: [被阻塞的依赖]
  - related: [相关任务]
- **标签**: [frontend], [backend], [api], [database], etc.
- **Epic**: 所属 Epic
- **预估工时**: 2h | 4h | 8h | 1d | etc.
- **技能要求**: [react], [nodejs], [typescript], etc.
```

**产出物**:
- `jira/epics/{EPIC-ID}.md` - Epic 文档
- `jira/tickets/feature/{TICKET-ID}.md` - 功能票
- `jira/tickets/task/{TICKET-ID}.md` - 任务票
- `jira/tickets/bugfix/{TICKET-ID}.md` - 缺陷票
- `jira/index/by-feature/` - 按功能索引
- `jira/index/by-status/` - 按状态索引
- `jira/index/by-assignee/` - 按负责人索引

---

### 阶段 4.5: Slaver 团队初始化（必须与任务拆解同步执行）

**触发条件**: 任务拆解完成，第一批 Ticket 已创建

**目的**: Master 创建任务后，**必须立即初始化 Slaver 团队**，让任务可被立即领取执行。禁止创建任务后不初始化执行团队。

**初始化流程**:

```
1. 分析任务技能需求
   ↓
   扫描所有 ready 状态的 ticket，汇总需要的技能标签
   例：[react, typescript] + [nodejs, postgresql] + [docker, ci/cd]
   
2. 确定 Slaver 角色组合
   ↓
   根据技能需求确定需要的 Slaver 角色
   例：frontend_dev × 1 + backend_dev × 1 + devops × 1
   
3. 初始化 Slaver 实例
   ↓
   为每个 Slaver 角色创建：
   - .eket/state/profiles/{slaver_id}.yml
   - .eket/state/instance_config.yml（Slaver 配置）
   - inbox/human_input.md（任务通知）
   
4. 发送任务就绪通知
   ↓
   将新创建的 ticket 状态设为 ready
   发送 message_queue 通知到各 Slaver inbox
```

**Master 职责**:
- ✅ 分析任务技能需求，确定需要的 Slaver 角色类型和数量
- ✅ 创建 Slaver 实例配置文件
- ✅ 将所有新任务状态设置为 `ready`（可领取状态）
- ✅ 发送任务就绪通知到消息队列

**禁止操作**:
- ❌ 创建任务后不初始化 Slaver 团队
- ❌ 任务状态停留在 `analysis` 或 `backlog` 不释放
- ❌ 等待人类确认后才初始化 Slaver（可先初始化，人类可调整）

**产出物**:
- `.eket/state/profiles/frontend_dev.yml` - Slaver 角色配置
- `.eket/state/profiles/backend_dev.yml` - Slaver 角色配置
- `jira/tickets/*/status: ready` - 任务就绪
- `shared/message_queue/inbox/task_ready_*.json` - 任务就绪通知

---

### 3.6 阶段 6: Slaver 领取任务（自动模式）

**触发条件**: 任务状态为 `ready`，Slaver 实例已初始化

**说明**: 在自动模式下，Slaver 主动领取任务，Master 无需手动分配。Master 的职责是确保任务清晰、优先级正确、依赖关系明确。

**Slaver 领取策略**:
| 任务标签 | 匹配 Slaver 角色 |
|----------|-----------------|
| `frontend`, `ui`, `react` | frontend_dev |
| `backend`, `api`, `database` | backend_dev |
| `fullstack`, `integration` | fullstack |
| `test`, `qa` | tester |
| `devops`, `deploy`, `docker` | devops |

**产出物**:
- `jira/state/active_tasks.json` - 活跃任务列表
- `jira/tickets/{TICKET-ID}.md` 状态更新为 `in_progress`

---

### 3.7 阶段 7: 审核 PR

**触发条件**: 收到 `pr_review_request` 消息

**加载 Skills**:
```yaml
skills:
  # 核心 Review 技能
  - review/code_quality_review      # 代码质量审查
  - review/security_review          # 安全审查
  - review/performance_review       # 性能审查
  - review/test_coverage_review     # 测试覆盖审查
  - review/documentation_review     # 文档审查
  - review/architecture_compliance  # 架构合规审查

  # 辅助技能
  - review/git_best_practices       # Git 最佳实践
  - review/domain_knowledge         # 领域知识检查
```

**审核维度**:
1. **代码质量**: 代码规范、可读性、可维护性
2. **安全性**: 漏洞检查、输入验证、认证授权
3. **性能**: 时间复杂度、空间复杂度、缓存策略
4. **测试**: 单元测试覆盖率、集成测试完整性
5. **文档**: API 文档、注释完整性
6. **架构**: 是否符合架构设计、模块边界清晰

**审查流程**: 详见 [MASTER-PR-REVIEW-FLOW.md](MASTER-PR-REVIEW-FLOW.md)

**六维度评分卡**:

| 维度 | 评分标准 | 权重 | 通过线 |
|------|----------|------|--------|
| 代码质量 | 1-10 分 | 20% | ≥ 7 |
| 功能正确性 | 1-10 分 | 20% | ≥ 8 |
| 安全性 | 1-10 分 | 25% | ≥ 8 (一票否决) |
| 性能 | 1-10 分 | 15% | ≥ 6 |
| 测试覆盖 | 1-10 分 | 15% | ≥ 7 |
| 文档 | 1-10 分 | 5% | ≥ 6 |

**决策矩阵**:

| 总分 | 安全性 | 最低维度分 | 决策 |
|------|--------|------------|------|
| ≥ 50/60 | ≥ 8 | ≥ 6 | **Approved** |
| 40-49/60 | ≥ 6 | ≥ 5 | **Changes Requested** |
| < 40/60 | < 6 | < 5 | **Rejected** |
| 任何分 | < 6 | - | **Rejected** (安全一票否决) |

**产出物**:
- `outbox/review_requests/pr_${TICKET-ID}_review.md` - PR 审核报告
- `outbox/review_checklist/pr_${TICKET-ID}_checklist.md` - 审查清单
- `shared/message_queue/outbox/pr_approved_*.json` 或 `pr_rejected_*.json`

**Review 决定**:
- **Approved**: 代码质量良好，可以合并到 `testing` 分支
- **Changes Requested**: 需要修改后重新提交
- **Commented**: 有建议但不阻塞合并

---

### 3.8 阶段 8: 合并代码

**触发条件**: PR 审核通过

**加载 Skills**:
```yaml
skills:
  - git/merge_management
  - git/conflict_resolution
  - git/release_management
```

**产出物**:
- 代码合并到 `main` 分支
- `jira/tickets/{TICKET-ID}.md` 状态更新为 `done`
- `confluence/projects/{project}/releases/release_{version}.md` - 发布说明

---

## 4. 任务元数据详解

### 4.1 重要性 (Importance)

| 级别 | 说明 | 处理策略 |
|------|------|----------|
| `critical` | 关键业务功能，阻塞其他任务 | 立即处理，分配给最合适的 Slaver |
| `high` | 重要功能，影响核心体验 | 优先处理，当前 sprint 完成 |
| `medium` | 一般功能，提升用户体验 | 按顺序处理 |
| `low` | 优化类功能，可选 | 有时间时处理 |

### 4.2 优先级 (Priority)

| 级别 | 说明 | 建议响应时间 |
|------|------|-------------|
| `P0` | 紧急缺陷，生产事故 | 立即响应，2 小时内 |
| `P1` | 高优先级功能 | 24 小时内 |
| `P2` | 正常优先级 | 3 天内 |
| `P3` | 低优先级 | 1 周内 |

### 4.3 依赖关系 (Dependencies)

```markdown
## 依赖关系

### 阻塞关系
- **blocks**:
  - FEAT-002 (FEAT-002 依赖本任务完成)
- **blocked_by**:
  - FEAT-001 (本任务依赖 FEAT-001 完成)

### 相关任务
- **related**:
  - FEAT-003 (功能相关，可并行开发)

### 外部依赖
- **external**:
  - 等待 API 接口文档
  - 等待第三方服务接入
```

### 4.4 背景信息 (Context)

```markdown
## 背景

### 业务价值
- 解决什么问题
- 为谁解决问题
- 带来的价值是什么

### 技术背景
- 当前系统的限制
- 为什么需要这个功能
- 技术选型的考量

### 历史参考
- 类似功能的参考
- 过往的经验教训
```

---

## 5. Master 配置文件

### 5.1 实例配置

`.eket/state/instance_config.yml`:

```yaml
role: "master"
status: "ready"

# Master 配置
master:
  # 启用的工作流程
  workflows:
    - requirements_analysis
    - prd_creation
    - architecture_design
    - task_decomposition
    - pr_review

  # 自动加载 Skills
  auto_load_skills: true

  # 技能配置
  skills:
    requirements:
      - user_interview
      - requirement_decomposition
      - acceptance_criteria_definition
    product:
      - prd_writing
      - user_persona
      - roadmap_planning
    architecture:
      - system_design
      - api_design
      - database_design
    management:
      - task_decomposition
      - dependency_analysis
      - priority_setting
    review:
      - code_quality_review
      - security_review
      - performance_review
```

### 5.2 Agent Profile

`.eket/state/profiles/master.yml`:

```yaml
role: "master"
type: "coordinator"

# 核心能力
core_capabilities:
  - requirements_analysis
  - system_design
  - task_planning
  - code_review

# 技能矩阵
skills_matrix:
  requirements: 5  # 1-5 分
  product: 5
  architecture: 5
  management: 4
  review: 5
  development: 3  # 作为 Master，开发技能要求较低

# 工作流程
workflows:
  - name: "需求分析流程"
    trigger: "new_human_input"
    skills:
      - requirements/user_interview
      - requirements/requirement_decomposition

  - name: "PRD 创建流程"
    trigger: "requirements_approved"
    skills:
      - product/prd_writing
      - product/user_persona

  - name: "架构设计流程"
    trigger: "prd_approved"
    skills:
      - architecture/system_design
      - architecture/api_design

  - name: "任务拆解流程"
    trigger: "architecture_approved"
    skills:
      - management/task_decomposition
      - management/dependency_analysis

  - name: "PR 审核流程"
    trigger: "pr_review_request"
    skills:
      - review/code_quality_review
      - review/security_review
```

---

## 6. 命令参考

### Master 专用命令

| 命令 | 功能 | 加载的 Skills |
|------|------|-------------|
| `/eket-analyze` | 分析需求并拆解任务 | requirements/*, product/* |
| `/eket-review-pr` | 审核 Slaver 提交的 PR | review/* |
| `/eket-merge` | 合并 PR 到 main 分支 | git/* |
| `/eket-check-progress` | 检查 Slaver 任务进度 | management/* |

---

**维护者**: EKET Framework Team
**版本**: v2.0.0
