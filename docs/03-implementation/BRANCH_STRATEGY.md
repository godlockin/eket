# EKET 分支策略和任务模式

**版本**: 0.2.0
**日期**: 2026-03-20

---

## 分支策略

### 三分支模型

```
┌─────────────────────────────────────────────────────────────────┐
│                        分支策略图                                │
└─────────────────────────────────────────────────────────────────┘

main (生产分支)
  │
  ├─── merge from testing (通过 PR)
  │
  ▼
testing (测试分支)
  │
  ├─── merge from feature (通过 PR，测试通过后)
  │
  ▼
feature/* (功能分支)
  │
  ├── feature/user-login
  ├── feature/user-registration
  ├── feature/data-export
  └── ...

hotfix/* (紧急修复分支，从 main 分出)
  │
  ├── hotfix/login-bug-fix
  └── ...
```

### 分支用途

| 分支 | 用途 | 保护级别 | 合并规则 | 部署目标 |
|------|------|---------|---------|---------|
| `main` | 生产环境代码 | 严格保护 | 仅允许 PR 合并，需 2 人批准 | 生产环境 |
| `testing` | 测试环境代码 | 保护 | PR 合并，需测试通过 | 测试环境 |
| `feature/*` | 功能开发 | 开放 | 个人开发分支 | - |
| `hotfix/*` | 紧急修复 | 保护 | 快速通道 PR，需 1 人批准 | 生产环境 |

### 分支命名规范

```bash
# 功能开发
feature/{ticket-id}-{short-desc}
feature/feat-001-user-login
feature/jira-123-auth-system

# 缺陷修复
bugfix/{ticket-id}-{short-desc}
bugfix/bug-001-login-error

# 紧急修复
hotfix/{ticket-id}-{short-desc}
hotfix/critical-security-patch

# 文档更新
docs/{ticket-id}-{short-desc}
docs/readme-update

# 实验性功能（不合并到主分支）
experiment/{feature-name}
experiment/new-auth-flow
```

### 分支流转

```
# 标准流程
feature/login ──→ PR ──→ testing ──→ 测试通过 ──→ PR ──→ main
     │                         │                      │
     │                         │                      ▼
     │                         │                生产部署
     │                         ▼
     │                   测试环境部署
     ▼
 开发提交

# 紧急修复流程
hotfix/security-patch ──→ 快速 PR ──→ main ──→ 生产部署
                                │
                                └──→ 同步到 testing
```

---

## 任务模式

EKET 框架定义两种核心任务模式：

```
┌─────────────────────────────────────────────────────────────────┐
│                          任务模式                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────┐         │
│  │   任务设定模式       │       │   任务承接模式       │         │
│  │  (Task Setup Mode)  │       │ (Task Execution Mode)│         │
│  ├─────────────────────┤       ├─────────────────────┤         │
│  │                     │       │                     │         │
│  │ • 项目初始化        │       │ • 任务领取          │         │
│  │ • 需求分析          │       │ • 任务执行          │         │
│  │ • 任务拆解          │       │ • 代码开发          │         │
│  │ • 架构设计          │       │ • 测试编写          │         │
│  │ • 创建初始任务      │       │ • PR 提交            │         │
│  │                     │       │ • 问题修复          │         │
│  │                     │       │                     │         │
│  │ 负责：协调智能体     │       │ 负责：执行智能体     │         │
│  │                     │       │                     │         │
│  └─────────────────────┘       └─────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 任务设定模式 (Task Setup Mode)

**进入条件**:
- 新项目初始化
- 新 Epic 创建
- 重大需求变更

**负责智能体**: 协调智能体小组
- 需求分析师 (Requirement Analyst)
- 技术经理 (Tech Manager)
- 项目经理 (Project Manager)

**工作流程**:
```
1. 读取人类输入 (inbox/human_input.md)
       ↓
2. 需求分析 → 调用 user_interview, requirement_decomposition SKILL
       ↓
3. 创建 Epic → Jira: EPIC-XXX
       ↓
4. 拆解任务 → 创建 FEATURE/TASK tickets
       ↓
5. 架构设计 → Confluence: architecture/
       ↓
6. 设定优先级 → Jira: 更新优先级字段
       ↓
7. 等待人类确认 → inbox/human_feedback/setup-confirmation.md
```

**输出物**:
- `jira/epics/EPIC-XXX/` - Epic 定义
- `jira/tickets/feature/FEAT-XXX.md` - 功能任务
- `confluence/projects/{project}/requirements/` - 需求文档
- `confluence/projects/{project}/architecture/` - 架构文档

**人类确认内容**:
- Epic 范围是否正确
- 任务拆解是否合理
- 优先级设定是否合适
- 架构设计是否认可

---

### 任务承接模式 (Task Execution Mode)

**进入条件**:
- 任务状态为 `ready`
- 执行智能体可用

**负责智能体**: 执行智能体
- 前端开发 (Frontend Dev)
- 后端开发 (Backend Dev)
- 设计师 (Designer)
- 测试员 (Tester)
- 运维 (DevOps)

**工作流程**:
```
1. 轮询 Jira tickets → 查找状态为 ready 的任务
       ↓
2. 分析任务 → 读取任务详情、依赖、Confluence 背景知识
       ↓
3. 领取任务 → 更新 Jira: status = in_progress, assignee = agent_id
       ↓
4. 创建分支 → git checkout -b feature/FEAT-XXX-description
       ↓
5. 执行任务 → 调用对应 SKILL
       ↓
6. 提交代码 → git commit & push
       ↓
7. 创建 PR → GitHub/GitLab PR → testing 分支
       ↓
8. 等待 Review → 唤醒协调智能体
       ↓
9. Review 通过 → 合并到 testing → 运行测试
       ↓
10. 测试通过 → 创建 PR 到 main
       ↓
11. 合并到 main → 更新 Jira: status = done
```

**输出物**:
- `code_repo/src/` - 源代码
- `code_repo/tests/` - 测试代码
- PR - Pull Request
- `jira/tickets/feature/FEAT-XXX.md` - 更新任务状态

---

## 模式切换

### 从设定模式切换到承接模式

```yaml
# 切换条件
mode_switch:
  from: task_setup
  to: task_execution
  triggers:
    - all_epics_created: true
    - all_tasks_created: true
    - human_confirmed: true

# 切换动作
actions:
  - update_jira_state: ready
  - notify_executors: true
  - wake_coordinator: false
```

### 从承接模式切换到设定模式

```yaml
# 切换条件
mode_switch:
  from: task_execution
  to: task_setup
  triggers:
    - new_epic_requested: true
    - major_requirement_change: true
    - human_requested: true

# 切换动作
actions:
  - pause_active_tasks: true
  - wake_coordinators: true
  - notify_human: true
```

---

## 任务状态机

```
┌─────────────────────────────────────────────────────────────────┐
│                     任务状态机 (增强版)                           │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────┐
    │ backlog │ ◀── 新建任务，等待分析
    └────┬────┘
         │
         │ 需求分析师领取
         ▼
    ┌─────────┐
    │ analysis│ ◀── 需求分析中 (设定模式)
    └────┬────┘
         │
         ├────→ ┌─────────────┐
         │      │ needs_info  │ ◀── 需要更多信息
         │      └──────┬──────┘
         │             │
         │             │ 人类提供信息
         │             ▼
         │      ┌─────────────┐
         │      │   analyzing │
         │      └──────┬──────┘
         │             │
         │             ▼
         │      (返回 analysis)
         │
         │ 分析完成
         ▼
    ┌─────────┐
    │ approved│ ◀── 需求已批准，等待设计
    └────┬────┘
         │
         │ 技术经理设计
         ▼
    ┌─────────┐
    │ design  │ ◀── 技术设计中 (设定模式)
    └────┬────┘
         │
         │ 设计批准
         ▼
    ┌─────────┐
    │  ready  │ ◀── 准备就绪，等待承接 (承接模式开始)
    └────┬────┘
         │
         │ 执行智能体领取
         ▼
    ┌─────────┐
    │   dev   │ ◀── 开发中 (承接模式)
    └────┬────┘
         │
         │ 开发完成
         ▼
    ┌─────────┐
    │  test   │ ◀── 测试中
    └────┬────┘
         │
         ├────→ ┌─────────────┐
         │      │ test_failed │ ◀── 测试失败
         │      └──────┬──────┘
         │             │
         │             │ 修复问题
         │             ▼
         │      (返回 dev)
         │
         │ 测试通过
         ▼
    ┌─────────┐
    │ review  │ ◀── Review 中
    └────┬────┘
         │
         ├────→ ┌─────────────────┐
         │      │changes_requested│ ◀── 需要修改
         │      └────────┬────────┘
         │               │
         │               │ 修改完成
         │               ▼
         │      (返回 dev 或 review)
         │
         │ Review 通过
         ▼
    ┌─────────┐
    │  done   │ ◀── 任务完成
    └─────────┘
```

### 状态转换规则

| 当前状态 | 下一状态 | 触发条件 | 负责智能体 |
|---------|---------|---------|----------|
| backlog | analysis | 需求分析师领取 | 需求分析师 |
| analysis | needs_info | 需要更多信息 | 需求分析师 |
| needs_info | analysis | 人类提供信息 | - |
| analysis | approved | 分析完成 | 需求分析师 |
| approved | design | 技术经理领取 | 技术经理 |
| design | ready | 设计完成 | 技术经理 |
| ready | dev | 执行智能体领取 | 执行智能体 |
| dev | test | 开发完成，提交 PR | 执行智能体 |
| test | dev | 测试失败 | 测试员 |
| test | review | 测试通过 | 测试员 |
| review | changes_requested | Review 不通过 | 技术经理 |
| review | done | Review 通过 | 技术经理 |
| changes_requested | dev | 开始修改 | 执行智能体 |

---

## 快速开始

### 创建新分支

```bash
# 功能开发
git checkout -b feature/feat-001-login main
git push -u origin feature/feat-001-login

# 紧急修复
git checkout -b hotfix/security-patch main
git push -u origin hotfix/security-patch
```

### 合并到 testing

```bash
# 本地测试通过后
git checkout testing
git merge --no-ff feature/feat-001-login
git push origin testing
```

### 合并到 main

```bash
# testing 分支测试通过后
git checkout main
git merge --no-ff testing
git push origin main
```

---

**维护者**: EKET Framework Team
