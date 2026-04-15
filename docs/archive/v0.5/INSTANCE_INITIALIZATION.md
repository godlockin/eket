# EKET 实例初始化流程

**版本**: 0.2.0
**日期**: 2026-03-20

---

## 概述

EKET 实例在启动时会自动检测项目状态，并根据目录结构决定进入**任务设定模式**或**任务承接模式**。

---

## 初始化流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    EKET 实例启动流程                              │
└─────────────────────────────────────────────────────────────────┘

1. 启动实例 (/eket-start)
       │
       ▼
2. 检查三仓库目录
   - confluence/?
   - jira/?
   - code_repo/或 src/
       │
       ├───────┬───────────────┐
       │       │               │
       ▼       ▼               ▼
   不存在   部分存在        都存在
       │       │               │
       └───────┴───────────────┘
               │
               ▼
       进入任务设定模式    进入任务承接模式
       (Task Setup)       (Task Execution)
               │               │
               ▼               ▼
       协调智能体负责    检查运行模式
               │          ┌────┴────┐
               ▼          │         │
       创建 Epic/    自动模式   手动模式
       Tasks           │         │
               │       ▼         ▼
               ▼   自动领取   推荐任务
       创建文档    最高优先级  + 分析理由
                       │         │
                       ▼         ▼
                   加载 Profile  用户选择
                   + Skills      │
                       │         ▼
                       ▼     领取任务
                   开始处理
```

---

## 命令使用

### /eket-start [-a]

启动 EKET 实例，自动检测项目状态并进入对应模式。

**选项**:
- `-a`: 启用自动模式（仅任务承接模式有效）

**示例**:
```bash
# 手动模式（默认）
/eket-start

# 自动模式
/eket-start -a
```

---

## 模式详解

### 任务设定模式 (Task Setup Mode)

**触发条件**: 三仓库目录不存在或不完整

**负责智能体**: 协调智能体小组
- 需求分析师
- 技术经理
- 项目经理

**工作流程**:
1. 读取 `inbox/human_input.md` 中的需求
2. 分析需求并拆解为 Epic 和功能任务
3. 创建 Confluence 文档（需求/架构/设计）
4. 创建 Jira 任务票
5. 设定任务优先级和依赖关系

**输出位置**:
- `confluence/projects/{project}/requirements/`
- `confluence/projects/{project}/architecture/`
- `jira/epics/`
- `jira/tickets/feature/`

---

### 任务承接模式 (Task Execution Mode)

**触发条件**: 三仓库目录都存在

**负责智能体**: 执行智能体
- 前端开发
- 后端开发
- 设计师
- 测试员
- 运维

#### 自动模式

**工作流程**:
1. 读取 Confluence 了解项目背景
2. 检查 Jira 任务列表
3. 分析任务优先级（重要性 + 紧急性 + 依赖关系）
4. 自动领取优先级最高的任务
5. 更新任务状态为 `in_progress`
6. 加载对应的 Agent Profile 和 Skills
7. 开始处理任务

**优先级计算**:
```
优先级分数 = 基础分数 + 类型加成 + 依赖惩罚

基础分数:
- urgent: 100
- high: 75
- normal: 50
- low: 25

类型加成:
- Bugfix: +10

依赖惩罚:
- 有依赖: -20
```

#### 手动模式

**工作流程**:
1. 读取 Confluence 了解项目背景
2. 检查 Jira 任务列表
3. 分析任务并生成推荐列表
4. 显示前 3 个推荐任务及理由
5. 用户选择并领取任务

**推荐理由分析因素**:
- 任务类型（Bugfix 优先）
- 优先级（urgent/high 优先）
- 依赖关系（无依赖优先）
- 业务价值

---

## 输出示例

### 任务设定模式输出

```
┌──────────────────────────────────────────────────────────────┐
│                    任务设定模式                               │
├──────────────────────────────────────────────────────────────┤
│  协调智能体将执行：                                          │
│  1. 读取 inbox/human_input.md 中的需求                        │
│  2. 分析需求并拆解为 Epic 和功能任务                           │
│  3. 创建 Confluence 文档 (需求/架构/设计)                      │
│  4. 创建 Jira 任务票                                           │
│  5. 设定任务优先级和依赖关系                                  │
│                                                              │
│  输出位置：                                                  │
│  • confluence/projects/{project}/requirements/              │
│  • confluence/projects/{project}/architecture/              │
│  • jira/epics/                                              │
│  • jira/tickets/feature/                                    │
└──────────────────────────────────────────────────────────────┘
```

### 自动模式输出

```
┌──────────────────────────────────────────────────────────────┐
│  自动模式：领取任务                                          │
├──────────────────────────────────────────────────────────────┤
│  已选择：FEAT-001-user-login                                │
│  优先级分数：85                                              │
│                                                              │
│  正在更新任务状态...                                         │
│  ✓ 任务状态已更新为 in_progress                             │
│                                                              │
│  正在加载对应 profile 和 skills...                             │
│  - 分析任务类型...                                           │
│  - 匹配 Agent profile...                                     │
│  - 加载所需 skills...                                        │
│                                                              │
│  准备开始处理任务                                            │
└──────────────────────────────────────────────────────────────┘
```

### 手动模式输出

```
┌──────────────────────────────────────────────────────────────┐
│              推荐优先处理的任务                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  【推荐 1】FEAT-001-user-login                          │
│  标题：实现用户登录功能                                      │
│  优先级：high                                                │
│  当前状态：ready                                             │
│  依赖：无                                                    │
│                                                              │
│  推荐理由：                                                  │
│  高优先级任务，对业务影响较大                                │
│                                                              │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  【推荐 2】BUG-001-fix-login-error                      │
│  标题：修复登录错误                                          │
│  优先级：normal                                              │
│  当前状态：ready                                             │
│  依赖：无                                                    │
│                                                              │
│  推荐理由：                                                  │
│  缺陷修复类任务，影响用户体验，应优先处理                    │
│                                                              │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  【推荐 3】TASK-001-setup-ci                            │
│  标题：配置 CI 流水线                                         │
│  优先级：normal                                              │
│  当前状态：backlog                                           │
│  依赖：无                                                    │
│                                                              │
│  推荐理由：                                                  │
│  任务已就绪，按优先级排序推荐                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Agent Profile 加载

当任务被领取后，系统自动加载对应的 Agent Profile 和 Skills：

### Profile 匹配规则

| 标签 | 匹配 Agent | Skills |
|------|----------|-------|
| `frontend`, `ui`, `react`, `vue` | frontend_dev | frontend_development, test_development, unit_test |
| `backend`, `api`, `database` | backend_dev | backend_development, api_design, database_design |
| `design`, `ux` | designer | ui_ux_design, icon_design |
| `test`, `qa` | tester | unit_test, e2e_test, integration_test |
| `devops`, `deploy`, `docker` | devops | docker_build, kubernetes_deploy, ci_cd_setup |
| `docs`, `documentation` | doc_monitor | api_documentation, user_guide, technical_doc |

### 输出示例

```
加载 Agent Profile 和 Skills...

任务信息:
  ID: FEAT-001
  类型：feature
  标题：实现用户登录功能
  优先级：high
  标签：frontend,react

匹配 Agent Profile...
  ✓ 匹配到：前端开发 Agent

加载 Skills...
  ✓ development/frontend_development
  ✓ development/test_development
  ✓ testing/unit_test

保存 Agent 上下文...
  ✓ Agent 上下文已保存到 .eket/state/agents/FEAT-001.yml

========================================
Agent Profile 加载完成
========================================

配置:
  Agent Profile: frontend_dev
  Skills: development/frontend_development development/test_development testing/unit_test
```

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `/eket-start` | 实例启动和初始化 |
| `/eket-claim [id]` | 领取任务 |
| `scripts/prioritize-tasks.sh` | 任务优先级排序（自动模式） |
| `scripts/recommend-tasks.sh` | 任务推荐（手动模式） |
| `scripts/load-agent-profile.sh` | 加载 Agent Profile 和 Skills |

---

**维护者**: EKET Framework Team
