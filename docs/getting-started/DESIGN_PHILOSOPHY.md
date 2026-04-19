# EKET Agent 框架设计理念 v0.6

**版本**: 0.6.2
**日期**: 2026-03-23

---

## 核心设计理念

> **一切皆 Task** —— 从需求收集、分析、拆解，到研发、迭代、Review、Merge，所有工作都是 Task，只是难度和持续时间不同。

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task 生命周期                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  需求收集 → 需求分析 → 任务拆解 → 系统设计 → 开发 → 测试 →    │
│     ↑                                                        │
│     └─────────────────── 迭代循环 ────────────────────────────┘
│                              │
│                              ▼
│                         Review → Merge → Done
│                                                                 │
│  每个环节都是一个 Task，由对应角色的 Agent 主动承接                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent 设计原则

### 1. 去中心化网络

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 去中心化网络                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│         ┌───────────────┐                                      │
│         │ Product Mgr   │  需求分析、任务拆解                     │
│         └───────┬───────┘                                      │
│                 │                                               │
│         ┌───────┴───────┐                                      │
│         │   Architect   │  系统设计、技术选型                     │
│         └───────┬───────┘                                      │
│                 │                                               │
│    ┌────────────┼────────────┐                                  │
│    │            │            │                                  │
│    ▼            ▼            ▼                                  │
│ ┌──────┐  ┌──────┐  ┌──────┐                                   │
│ │Front │  │Back  │  │ QA   │  开发、测试                          │
│ └──┬───┘  └──┬───┘  └──┬───┘                                   │
│    │         │         │                                       │
│    └─────────┼─────────┘                                       │
│              │                                                  │
│    ┌─────────┴─────────┐                                       │
│    │                   │                                       │
│    ▼                   ▼                                       │
│ ┌──────┐         ┌──────────┐                                  │
│ │DevOps │         │  Reviewer │  部署、审核、合并                   │
│ └──────┘         └──────────┘                                  │
│                                                                 │
│  每个 Agent 都是独立节点，主动承接符合角色的任务                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 独立实例

每个 Agent 是独立的 Instance/Session：

| 特性 | 说明 |
|------|------|
| **独立运行** | 每个 Agent 有自己的进程/会话，互不干扰 |
| **主动承接** | Agent 根据角色设定，主动领取匹配的任务 |
| **可插拔** | 可随时启动新的 Agent 实例加入协作 |
| **状态隔离** | Agent 之间有明确的状态边界 |

### 3. 角色驱动

```yaml
# Agent 角色定义
roles:
  product_manager:
    description: 产品经理
    tasks: [需求收集，需求分析，任务拆解，优先级设定]
    skills: [requirement_analysis, task_decomposition]

  architect:
    description: 架构师
    tasks: [系统设计，技术选型，架构评审]
    skills: [architecture_design, tech_stack_selection]

  frontend_dev:
    description: 前端开发
    tasks: [前端开发，UI 实现，状态管理]
    skills: [frontend_development, ui_implementation]

  backend_dev:
    description: 后端开发
    tasks: [后端开发，API 设计，数据库设计]
    skills: [backend_development, api_design]

  qa_engineer:
    description: 测试工程师
    tasks: [测试用例，单元测试，E2E 测试]
    skills: [test_development, e2e_testing]

  devops_engineer:
    description: 运维工程师
    tasks: [CI/CD，部署，监控]
    skills: [docker_build, kubernetes_deploy]

  reviewer:
    description: 审核员
    tasks: [代码 Review，合并审核]
    skills: [code_review, quality_assurance]
```

---

## Task 分类

### 按难度分级

| 等级 | 描述 | 示例 | 处理 Agent |
|------|------|------|----------|
| **L1** | 简单任务 (<30min) | 修复 typo、更新配置 | 任意 Agent |
| **L2** | 常规任务 (<2h) | 小功能开发、Bug 修复 | 对应角色 Agent |
| **L3** | 复杂任务 (<1d) | 模块开发、API 设计 | 资深 Agent |
| **L4** | 大型任务 (>1d) | 系统设计、架构重构 | 架构师 + 多 Agent 协作 |

### 按持续时间

| 类型 | 持续时间 | 示例 | 管理方式 |
|------|---------|------|---------|
| **瞬时 Task** | <5min | 文件重命名、格式调整 | Agent 自主完成 |
| **短期 Task** | 5min-2h | 功能开发、测试编写 | 需要状态更新 |
| **中期 Task** | 2h-1d | 模块开发、集成测试 | 需要进度报告 |
| **长期 Task** | >1d | 系统设计、架构变更 | 需要分解为子 Task |

---

## Agent 协作模式

### 模式 1：任务链式传递

```
需求收集 (Product Mgr)
       │
       ▼
需求分析 (Product Mgr)
       │
       ▼
任务拆解 (Product Mgr)
       │
       ├─────────────┬─────────────┐
       ▼             ▼             ▼
  系统设计       前端开发       后端开发
  (Architect)   (Frontend)    (Backend)
       │             │             │
       └─────────────┼─────────────┘
                     │
                     ▼
               测试验证 (QA)
                     │
                     ▼
               代码 Review (Reviewer)
                     │
                     ▼
               合并部署 (DevOps)
```

### 模式 2：并行协作

```
          ┌───────────────┐
          │   Epic: 用户系统  │
          └───────┬───────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
      ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 用户登录  │ │ 用户注册  │ │ 个人中心  │
│ (Agent A)│ │ (Agent B)│ │ (Agent C)│
└──────────┘ └──────────┘ └──────────┘
      │           │           │
      └───────────┼───────────┘
                  │
                  ▼
          ┌───────────────┐
          │  集成测试 (QA)  │
          └───────────────┘
```

---

## Agent 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 生命周期                                │
└─────────────────────────────────────────────────────────────────┘

1. 初始化
   │
   ├─ 设置角色类型 (product_manager/frontend_dev/...)
   ├─ 连接到项目工作区
   ├─ 同步三仓库状态 (confluence/jira/code_repo)
   │
   ▼
2. 任务发现
   │
   ├─ 轮询 Jira tickets
   ├─ 检查消息队列
   ├─ 分析任务匹配度
   │
   ▼
3. 任务承接
   │
   ├─ 领取匹配的任务
   ├─ 更新任务状态为 in_progress
   ├─ 创建 Worktree(如需要)
   │
   ▼
4. 任务执行
   │
   ├─ 制定实现方案
   ├─ 执行具体工作
   ├─ 更新进度状态
   │
   ▼
5. 任务完成
   │
   ├─ 提交工作成果
   ├─ 创建 Review 请求 (如需要)
   ├─ 更新任务状态为 done/review
   │
   ▼
6. 等待下一任务
   │
   └─ 返回步骤 2
```

---

## 实例化方式

### 方式 1：用户主动初始化

```bash
# 用户启动特定角色的 Agent
/eket-start --role product_manager
/eket-start --role frontend_dev
/eket-start --role reviewer

# Agent 启动后：
# 1. 检查项目状态
# 2. 加载对应角色配置
# 3. 开始执行该角色的任务
```

### 方式 2：自动承接

```bash
# 启用自动承接模式
/eket-start --auto-claim

# Agent 行为：
# 1. 分析 Jira 中待处理任务
# 2. 根据自身角色筛选匹配任务
# 3. 自动领取优先级最高的任务
# 4. 开始执行
```

### 方式 3：任务指派

```bash
# Master/Coordinator 指派任务
/eket-assign --agent frontend_dev --ticket FEAT-001

# 被指派的 Agent：
# 1. 接收任务通知
# 2. 确认是否可承接
# 3. 开始执行或转派
```

---

## 状态管理

### Task 状态

```
backlog → analysis → ready → in_progress → review → done
   │          │          │         │         │        │
   │          │          │         │         │        │
   │          │          │         │         │        ▼
   │          │          │         │         │    merged
   │          │          │         │         │
   │          │          │         │         └─ changes_requested ─┐
   │          │          │         │                                │
   │          │          │         └────────────────────────────────┘
   │          │          │
   │          │          └─ timeout (长时间未领取)
   │          │
   │          └─ rejected (需求不通过)
   │
   └─ cancelled (任务取消)
```

### Agent 状态

```yaml
agent_state:
  id: "agent_frontend_dev_001"
  role: "frontend_dev"
  status: "idle"  # idle / busy / blocked / offline
  current_task: "FEAT-001"
  workload: 3/10  # 当前负载
  capabilities: ["react", "typescript", "tailwind"]
  last_active: "2026-03-23T10:30:00Z"
```

---

## 通信机制

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `task_claimed` | Agent → Jira | 任务已被领取 |
| `task_assigned` | Master → Agent | 任务指派 |
| `progress_update` | Agent → Master | 进度更新 |
| `help_request` | Agent → Master | 请求协助 |
| `review_request` | Agent → Reviewer | 请求审核 |
| `review_result` | Reviewer → Agent | 审核结果 |
| `blocker_alert` | Agent → Master | 阻塞告警 |

### 消息队列位置

```
shared/message_queue/
├── inbox/           # 接收消息
│   ├── msg_001.json
│   └── msg_002.json
├── outbox/          # 发送消息
│   ├── msg_003.json
│   └── msg_004.json
└── broadcast/       # 广播消息
    └── announcement_001.json
```

---

## 项目初始化 vs 角色初始化

### 项目初始化 (一次性)

```bash
# 创建项目基础结构
./scripts/init-project.sh my-project /path/to/project

# 此时尚无 Agent 运行，只是目录结构
my-project/
├── confluence/      # 文档仓库 (空)
├── jira/            # 任务仓库 (空)
├── code_repo/       # 代码仓库 (空)
├── inbox/           # 需求输入
└── .eket/           # 配置
```

### 角色初始化 (多次，每个 Agent 独立)

```bash
# 用户启动 Product Manager Agent
cd my-project
/eket-start --role product_manager

# Product Manager:
# 1. 读取 inbox/human_input.md
# 2. 分析需求
# 3. 创建 Epic 和 Tasks 到 Jira
# 4. 创建需求文档到 Confluence

# 用户另开终端启动 Frontend Dev Agent
cd my-project
/eket-start --role frontend_dev

# Frontend Dev:
# 1. 同步三仓库状态
# 2. 查看 Jira 中前端相关任务
# 3. 领取并开始开发
```

---

## 关键特性对比

| 特性 | v0.3 (Master/Slaver) | v0.5 (去中心化 Agent) |
|------|---------------------|----------------------|
| 架构 | 中心协调 | 去中心化网络 |
| 实例 | Master + Slaver | 独立 Agent |
| 任务承接 | 被动分配 | 主动领取 |
| 角色固定 | 是 (Master 永远负责 Review) | 否 (可配置) |
| 扩展性 | 受限 | 高度可扩展 |
| 灵活性 | 一般 | 高 |

---

## 快速开始

### 1. 项目初始化

```bash
./scripts/init-project.sh my-project /path/to/project
cd /path/to/project
```

### 2. 启动 Product Manager Agent

```bash
/eket-start --role product_manager

# 自动执行：
# 1. 读取 inbox/human_input.md
# 2. 分析需求并拆解为 Epic/Tasks
# 3. 创建 Jira tickets
# 4. 创建 Confluence 文档
```

### 3. 启动开发 Agent

```bash
# 新开终端/会话
/eket-start --role frontend_dev

# 自动执行：
# 1. 同步三仓库状态
# 2. 查看匹配的任务
# 3. 领取并开始开发
```

### 4. 启动 Reviewer Agent

```bash
# 任务开发完成后，新开终端/会话
/eket-start --role reviewer

# 自动执行：
# 1. 检查待 Review 的 PR
# 2. 审核代码
# 3. 批准或要求修改
```

---

**维护者**: EKET Framework Team
