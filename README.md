# EKET Agent Framework

**版本**: 0.6.1
**最后更新**: 2026-03-24

> **EKET** 是一个基于 AI 智能体协作的开发框架，通过 Master/Slaver 架构实现自动化软件生产和跨领域任务处理。

---

## 核心理念

> **一切皆 Task** —— 从需求收集、分析、拆解，到研发、迭代、Review、Merge，所有工作都是 Task，只是难度和持续时间不同。

每个 Agent 是独立的 Instance，主动承接符合自己角色的任务。

---

## 快速开始

### 1. 初始化新项目

```bash
# 使用 EKET 框架初始化新项目
./scripts/init-project.sh my-project /path/to/my-project

# 进入新项目目录
cd /path/to/my-project
```

### 2. 启动智能体

```bash
# 启动实例（自动检测 Master/Slaver 模式）
/eket-start

# 或启用自动模式（Slaver 自动领取任务）
/eket-start -a
```

### 3. 查看状态和任务

```bash
# 查看智能体状态和任务列表
/eket-status

# 领取任务
/eket-claim <task-id>

# 获取帮助
/eket-help
```

---

## 核心特性

### Master/Slaver 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Master Node (长期存活)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 监控服务    │  │ PR 审核服务  │  │ 任务调度器  │         │
│  │ (Monitor)   │  │ (Reviewer)  │  │ (Scheduler) │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │  Slaver 1  │  │  Slaver 2  │  │  Slaver N  │
    │ (Frontend) │  │ (Backend)  │  │  (QA)      │
    └────────────┘  └────────────┘  └────────────┘
```

### 专家 Agent 角色

EKET v0.6.1 起，Slaver 角色扩展为**专家 Agent**，可根据项目需要配置为任意领域的专家：

| 领域 | 示例角色 |
|------|----------|
| **研发团队** | frontend_dev, backend_dev, qa_engineer |
| **业务团队** | business_analyst, compliance_expert, ux_designer |
| **运维团队** | devops_engineer, security_expert, sre |
| **其他领域** | data_scientist, content_creator, product_owner |

### 可配置的任务状态机

任务执行状态根据任务类型自动匹配：

| 任务类型 | 执行状态 |
|----------|----------|
| 软件研发 | dev → test → review |
| 部署运维 | dry_run → verification → production |
| 安全审查 | security_setting → attack_simulation → remediation |
| 数据分析 | data_collection → model_training → model_validation |
| 内容创作 | drafting → editing → publishing |

---

## 项目结构

### 框架目录

```
eket/
├── CLAUDE.md                 # 框架使用指南
├── README.md                 # 本文件
├── docs/                     # 框架文档
│   ├── 01-getting-started/   # 入门文档
│   ├── 02-architecture/      # 架构设计
│   ├── 03-implementation/    # 实现细节
│   ├── 04-testing/           # 测试验证
│   ├── 05-reference/         # 参考资料
│   └── 06-sop/               # 标准操作流程
├── template/                 # 项目模板
│   ├── CLAUDE.md             # 项目 CLAUDE.md 模板
│   ├── README.md             # 项目 README 模板
│   ├── SYSTEM-SETTINGS.md    # 系统设定模板
│   ├── SECURITY.md           # 安全指南
│   ├── .claude/commands/     # Claude Code 命令
│   ├── .eket/                # EKET 配置
│   ├── inbox/                # 输入模板
│   ├── skills/               # Skills 定义
│   └── examples/             # 快速开始示例
├── scripts/                  # 工具脚本
│   ├── init-project.sh       # 项目初始化
│   ├── init-three-repos.sh   # 三仓库初始化
│   ├── start.sh              # 启动实例
│   ├── prioritize-tasks.sh   # 任务优先级排序
│   └── recommend-tasks.sh    # 任务推荐
└── tests/                    # 框架测试
```

### 新项目结构（三合一架构）

使用 `init-project.sh` 初始化的新项目包含：

```
my-project/
├── confluence/               # 文档仓库
│   ├── memory/               # 共享记忆
│   ├── projects/             # 项目文档
│   └── templates/            # 文档模板
├── jira/                     # 任务仓库
│   ├── epics/                # Epic 文档
│   ├── tickets/              # 任务票
│   └── state/                # 任务状态
├── code_repo/                # 代码仓库
│   ├── src/                  # 源代码
│   ├── tests/                # 测试代码
│   ├── configs/              # 配置文件
│   └── deployments/          # 部署配置
├── .claude/commands/         # Claude Code 命令
├── .eket/                    # EKET 运行时数据
├── shared/                   # 共享数据
├── scripts/                  # 工具脚本
├── skills/                   # Skills 库
├── CLAUDE.md                 # 项目指南
├── SYSTEM-SETTINGS.md        # 系统设定
└── README.md                 # 项目说明
```

---

## 核心命令

### 通用命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导（首次启动） |
| `/eket-start` | 启动实例（自动检测 Master/Slaver） |
| `/eket-start -a` | 自动模式启动（Slaver 自动领取任务） |
| `/eket-status` | 查看状态和任务列表 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-review <id>` | 请求 Review |
| `/eket-help` | 显示帮助 |
| `/eket-ask` | 依赖追问（缺少配置时） |

### Master 专用命令

| 命令 | 功能 |
|------|------|
| `/eket-analyze` | 分析需求并拆解任务 |
| `/eket-review-pr` | 审核 Slaver 提交的 PR |
| `/eket-merge` | 合并 PR 到 main 分支 |
| `/eket-check-progress` | 检查 Slaver 任务进度 |

---

## 工作流程

```
1. 人类输入需求 → inbox/human_input.md
       ↓
2. Master 分析需求 → 拆解为 Jira tickets
       ↓
3. Slaver 领取任务 → 创建 worktree → 分析报告
       ↓
4. Master 审查分析报告 → 通过/驳回
       ↓
5. Slaver 执行任务 → 开发/测试 → 提交 PR
       ↓
6. Master 审核 PR → 合并或要求修改
       ↓
7. 任务完成 → 更新状态 → 清理 worktree
```

---

## 文档导航

### 框架文档

- [docs/README.md](docs/README.md) - 文档索引
- [docs/01-getting-started/](docs/01-getting-started/) - 入门指南
- [docs/02-architecture/](docs/02-architecture/) - 架构设计
- [docs/03-implementation/](docs/03-implementation/) - 实现细节
- [docs/04-testing/](docs/04-testing/) - 测试验证
- [docs/05-reference/](docs/05-reference/) - 参考资料
- [docs/06-sop/](docs/06-sop/) - 标准操作流程

### 模板文件

- [template/CLAUDE.md](template/CLAUDE.md) - 项目 CLAUDE.md 模板
- [template/SYSTEM-SETTINGS.md](template/SYSTEM-SETTINGS.md) - 系统设定模板
- [template/README.md](template/README.md) - 项目 README 模板
- [template/skills/](template/skills/) - Skills 定义模板

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.6.1 | 2026-03-24 | SYSTEM-SETTINGS.md 模板升级：专家 Agent 可定制、技术栈可配置、任务状态机灵活配置 |
| 0.6.0 | 2026-03-24 | Docker 集成和 Slaver 心跳监控 |
| 0.5.x | 2026-03-23 | Merge 流程升级、路径标准化 |

---

## 许可证

EKET Framework - AI Agent Collaboration Framework

---

**维护者**: EKET Framework Team
**问题反馈**: 请查看 docs/ 目录或运行 `/eket-help`
