# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# EKET - AI 智能体协作框架

## 快速开始

```bash
# 初始化新项目
./scripts/init-project.sh <project-name> /path/to/project

# 进入项目目录
cd /path/to/project

# 启动实例（自动检测模式）
/eket-start

# 或启用自动模式（自动领取任务）
/eket-start -a
```

## 核心命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导（首次启动） |
| `/eket-start` | 启动实例 |
| `/eket-start -a` | 自动模式启动 |
| `/eket-mode setup` | 切换到任务设定模式 |
| `/eket-mode execution` | 切换到任务承接模式 |
| `/eket-status` | 查看状态和任务列表 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-review <id>` | 请求 Review |
| `/eket-help` | 显示帮助 |

## 常用脚本

```bash
# 项目初始化
./scripts/init-project.sh <project-name> /path/to/project

# 三仓库初始化
./scripts/init-three-repos.sh <project-name> <org> <platform>

# 清理项目
./scripts/cleanup-project.sh [--full] /path/to/project

# 运行测试
./tests/run-unit-tests.sh

# 任务优先级排序（自动模式）
./scripts/prioritize-tasks.sh -a

# 任务推荐（手动模式）
./scripts/recommend-tasks.sh

# 加载 Agent Profile
./scripts/load-agent-profile.sh
```

---

## 核心架构

### 三大 Git 仓库

EKET 框架使用三个独立的 Git 仓库实现关注分离：

| 仓库 | 用途 | 内容 |
|------|------|------|
| `confluence/` | 文档中心 | 需求文档、架构设计、技术规范、会议记录 |
| `code_repo/` | 代码仓库 | 源代码、测试、部署配置、CI/CD |
| `jira/` | 任务管理 | Epic、功能票、缺陷票、状态追踪 |

**关系图**:
```
code_repo/                    # 主代码仓库
├── .gitmodules               # 指向 confluence 和 jira
├── confluence/               # submodule → confluence 仓库
├── jira/                     # submodule → jira 仓库
└── src/                      # 源代码
```

### 智能体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    顶层协调智能体小组                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ 需求分析师   │  技术经理    │  项目经理    │  文档监控员  │  │
│  │ (Requirement│ (Tech       │ (Project    │ (Doc        │  │
│  │  Analyst)   │  Manager)   │  Manager)   │  Monitor)   │  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  执行层智能体（去中心化网络）                   │
│  ┌─────────┬─────────┬──────────┬──────────┬────────┬──────┐ │
│  │ 设计师   │ 测试员   │ 前端开发  │ 后端开发   │ 运维    │ 存储 │ │
│  │Designer │ Tester  │Frontend  │ Backend  │DevOps  │Storage│ │
│  └─────────┴─────────┴──────────┴──────────┴────────┴──────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 智能体分类

| 类型 | 生命周期 | 职责 | 示例 |
|------|---------|------|------|
| **协调智能体** | 常驻 | 人类交互、任务分析、架构定义、PR review | 需求分析师、技术经理、项目经理 |
| **执行智能体** | 按需 | 任务领取、分支开发、PR 提交 | 设计师、开发、测试、运维 |

## 实例初始化流程

实例启动时自动检测项目状态并进入对应模式：

```
1. 检查三仓库目录
   │
   ├─ 任一缺失 → 任务设定模式 (Task Setup)
   │             - 协调智能体负责
   │             - 创建 Epic/Tasks
   │             - 创建 Confluence 文档
   │
   └─ 都存在 → 任务承接模式 (Task Execution)
                 - 执行智能体负责
                 - 自动/手动领取任务
                 - 开发 → PR → 合并
```

## 工作流程

### 任务设定模式 (Task Setup Mode)

**触发条件**: 三仓库目录不存在或不完整

**负责智能体**: 协调智能体小组（需求分析师、技术经理、项目经理）

**工作流程**:
```
1. 读取 `inbox/human_input.md` 中的需求
       ↓
2. 分析需求并拆解为 Epic 和功能任务
       ↓
3. 创建 Confluence 文档（需求/架构/设计）
       ↓
4. 创建 Jira 任务票
       ↓
5. 设定任务优先级和依赖关系
```

**输出位置**:
- `confluence/projects/{project}/requirements/` - 需求文档
- `confluence/projects/{project}/architecture/` - 架构文档
- `jira/epics/` - Epic 定义
- `jira/tickets/feature/` - 功能任务

---

### 任务承接模式 (Task Execution Mode)

**触发条件**: 三仓库目录都存在

**负责智能体**: 执行智能体（前端开发、后端开发、设计师、测试员、运维）

**两种运行方式**:

| 方式 | 行为 | 命令 |
|------|------|------|
| 自动模式 | 自动领取最高优先级任务 | `/eket-start -a` |
| 手动模式 | 显示 Top 3 推荐任务 | `/eket-start` |

**工作流程**:
```
1. 阅读 Confluence 了解项目背景
       ↓
2. 检查 Jira 任务列表
       ↓
3. 领取任务（自动/手动）
       ↓
4. 加载对应 Agent Profile 和 Skills
       ↓
5. 创建 Git 分支 → 开发 → 提交
       ↓
6. 创建 PR 到 testing 分支
       ↓
7. 测试通过 → PR 到 main
       ↓
8. 合并完成 → 更新 Jira 状态
```

---

## Ticket 状态机

```
backlog → analysis → approved → design → ready → dev → test → review → done
```

**状态说明**:

| 状态 | 说明 | 负责智能体 |
|------|------|----------|
| backlog | 新建任务，等待分析 | - |
| analysis | 需求分析中 | 需求分析师 |
| approved | 需求已批准，等待设计 | - |
| design | 技术设计中 | 技术经理 |
| ready | 准备就绪，等待承接 | - |
| dev | 开发中 | 执行智能体 |
| test | 测试中 | 测试员 |
| review | Review 中 | 技术经理 |
| done | 任务完成 | - |

---

## 分支策略

### 分支命名规范

```bash
feature/{ticket-id}-{short-desc}    # 功能开发
bugfix/{ticket-id}-{short-desc}     # 缺陷修复
hotfix/{ticket-id}-{short-desc}     # 紧急修复
docs/{ticket-id}-{short-desc}       # 文档更新
```

### 分支流转

```
feature/* ──→ PR ──→ testing ──→ 测试通过 ──→ PR ──→ main
```

| 分支 | 用途 | 保护级别 |
|------|------|---------|
| `main` | 生产环境 | 严格保护，仅 PR 合并 |
| `testing` | 测试环境 | 保护，PR 合并需测试通过 |
| `feature/*` | 功能开发 | 开放 |

## Agent Profile 匹配

执行智能体领取任务时，根据任务标签自动匹配对应的 Agent Profile：

| 任务标签 | 匹配 Agent |
|---------|----------|
| `frontend`, `ui`, `react`, `vue` | frontend_dev |
| `backend`, `api`, `database` | backend_dev |
| `design`, `ux` | designer |
| `test`, `qa` | tester |
| `devops`, `deploy`, `docker` | devops |
| `docs`, `documentation` | doc_monitor |

---

## Skills 体系

SKILL 是独立、可配置、可复用的能力单元。主要分类：

| 分类 | 路径 | 示例 Skills |
|------|------|------------|
| 需求分析 | `requirements/` | user_interview, requirement_decomposition |
| 技术设计 | `design/` | architecture_design, api_design, database_design |
| 开发实现 | `development/` | frontend_development, backend_development |
| 测试验证 | `testing/` | unit_test, e2e_test, integration_test |
| 运维部署 | `devops/` | docker_build, kubernetes_deploy, ci_cd_setup |
| 文档 | `documentation/` | api_documentation, user_guide, technical_doc |

---

## 文件结构

```
eket/
├── CLAUDE.md                 # 本文件
├── docs/                     # 框架文档
│   ├── 01-getting-started/   # 入门文档
│   ├── 02-architecture/      # 架构设计
│   ├── 03-implementation/    # 实现细节
│   ├── 04-testing/           # 测试验证
│   └── 05-reference/         # 参考资料
├── template/                 # 项目模板
│   ├── CLAUDE.md             # 项目 CLAUDE.md 模板
│   ├── .claude/commands/     # Claude Code 命令
│   └── .eket/                # EKET 配置
├── scripts/                  # 工具脚本
│   ├── init-project.sh       # 项目初始化
│   ├── init-three-repos.sh   # 三仓库初始化
│   ├── start.sh              # 启动实例
│   ├── manage.sh             # 管理命令
│   ├── prioritize-tasks.sh   # 任务优先级排序
│   └── recommend-tasks.sh    # 任务推荐
└── tests/                    # 测试
```

---

## 通信协议

### 三种通信方式

| 方式 | 位置 | 用途 |
|------|------|------|
| 消息队列 | `shared/message_queue/` | 实时通信、任务通知 |
| Git Commit | 三大 Git 仓库 | 状态持久化、代码变更 |
| 共享状态文件 | `shared/.state/` | 跨实例同步、锁信息 |

### 消息格式

```json
{
  "id": "msg_20240115_001",
  "timestamp": "2024-01-15T10:30:00Z",
  "from": "agent_frontend_dev_001",
  "to": "agent_tech_manager",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-123",
    "pr_number": 42,
    "branch": "feature/feat-123-user-auth",
    "summary": "实现用户登录功能"
  }
}
```

---

## 决策机制

| 决策类型 | 决策者 | 流程 |
|---------|-------|------|
| 常规任务 | 执行智能体自主 | 领取 → 执行 → 提交 PR |
| 技术方案 | 技术经理 | 提议 → 审批 |
| 需求变更 | 需求分析师 + 项目经理 | 分析影响 → 评估优先级 → 决策 |
| 架构变更 | 技术经理 + 人类确认 | 提案 → Review → 人类批准 |

### 上报规则

执行智能体在以下情况需上报协调智能体：
- 任务复杂度超出预估（>4 小时工作量）
- 技术选型存在争议
- 需要跨模块协调
- 发现需求不明确或矛盾
- 遇到阻塞性问题超过 30 分钟

---

## 给 AI 智能体的说明

当你（AI 智能体）被加载到本系统中时：

1. **首先读取本文件**，理解系统架构和协作规则
2. **读取 `docs/` 目录**，了解详细实现细节
3. **检查 `.eket/state/`**，查看当前实例状态
4. **运行 `/eket-start`**，启动实例并进入对应模式
5. **按照工作流程**执行任务并提交结果

---

**版本**: 0.2.0
**最后更新**: 2026-03-20
**维护者**: EKET Framework Team
