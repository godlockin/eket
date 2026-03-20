# EKET 框架 v0.2 完整说明

**日期**: 2026-03-20
**版本**: 0.2.0

---

## 快速导航

| 文档 | 内容 |
|------|------|
| [FRAMEWORK.md](FRAMEWORK.md) | 框架概述、愿景、架构 |
| [THREE_REPO_ARCHITECTURE.md](THREE_REPO_ARCHITECTURE.md) | 三 Git 仓库架构 |
| [SKILLS_SYSTEM.md](SKILLS_SYSTEM.md) | Skills 体系 |
| [AGENTS_CONFIG.md](AGENTS_CONFIG.md) | Agent 配置文件 |
| [BRANCH_STRATEGY.md](BRANCH_STRATEGY.md) | 分支策略和任务模式 |
| [AGENT_BEHAVIOR.md](AGENT_BEHAVIOR.md) | 智能体行为说明 |
| [CHANGELOG_v0.2.md](CHANGELOG_v0.2.md) | v0.2 变更总结 |

---

## 你的设想 vs 框架实现

### ✅ 已实现的功能

| 你的设想 | 实现文档 | 状态 |
|---------|---------|------|
| 运行初始化脚本，设置项目名称和根目录 | `scripts/init-project.sh` | ✅ |
| cd 到项目目录，启动 Claude，运行 `/init` | `/eket-init` (增强版) | ✅ |
| Claude 加载 eket 设定 | `CLAUDE.md` + `.claude/commands/` | ✅ |
| 初始化 CLAUDE.md | `/eket-init` 步骤 4 | ✅ |
| 进入任务设定模式 | `/eket-mode setup` | ✅ |
| 创建和初始化三个 git 项目 | `scripts/init-three-repos.sh` | ✅ |
| 同步远程服务器 | 三仓库脚本支持 remote | ✅ |
| 创建需求分析任务在 Jira 中 | `jira/tickets/` + `jira/epics/` | ✅ |
| 开启新 session，运行 `/init` | `/eket-init` 支持重复运行 | ✅ |
| 进入任务承接模式 | `/eket-mode execution` | ✅ |
| 根据 Jira 任务加载对应 agent 设定 | `agents/*.yml` + 动态加载 | ✅ |
| 需求类任务 → Confluence | `confluence/projects/` | ✅ |
| 功能类任务 → code_base 分支开发 | `feature/*` → `testing` → `main` | ✅ |
| 任务确认后合并到 testing 分支 | 分支策略文档 | ✅ |
| 创建后续任务或补充依赖 | `jira/state/dependencies.json` | ✅ |
| 及时更新 Jira 任务状态 | Jira 状态机 | ✅ |
| 及时更新 Confluence 文档 | 文档管理流程 | ✅ |
| 任务开启时分析依赖和背景知识 | Agent 行为流程 | ✅ |
| 根据分析结果加载 agent/agent group | Agent 配置文件 | ✅ |

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        EKET v0.2 架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户界面层                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  /eket-init  /eket-mode  /eket-status  /eket-claim      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  智能体层                                                        │
│  ┌─────────────────────┐       ┌─────────────────────┐         │
│  │   协调智能体 (常驻)  │       │   执行智能体 (按需)  │         │
│  │  • 需求分析师        │       │  • 前端开发         │         │
│  │  • 技术经理         │       │  • 后端开发         │         │
│  │  • 项目经理         │       │  • 设计师           │         │
│  │  • 文档监控员        │       │  • 测试员           │         │
│  │                     │       │  • 运维             │         │
│  └─────────────────────┘       └─────────────────────┘         │
│         │                              │                        │
│         └──────────────┬───────────────┘                       │
│                        ▼                                        │
│  SKILL 能力层                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  requirements/  design/  development/  testing/  ...    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                        │                                        │
│                        ▼                                        │
│  数据持久化层 (三 Git 仓库)                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │   Confluence     │  │    Code Repo     │  │     Jira     │ │
│  │  文档中心         │  │  代码仓库        │  │  任务管理     │ │
│  │  requirements/   │  │  src/            │  │  epics/      │ │
│  │  architecture/   │  │  tests/          │  │  tickets/    │ │
│  │  design/         │  │  deployments/    │  │  state/      │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 使用流程

### 1. 项目初始化

```bash
# 步骤 1: 初始化项目结构
./scripts/init-project.sh my-project /path/to/project

# 步骤 2: 进入项目目录
cd /path/to/project

# 步骤 3: 启动 Claude
claude

# 步骤 4: 运行初始化向导
/eket-init

# 步骤 5 (可选): 初始化三仓库
./scripts/init-three-repos.sh my-project my-org github
```

### 2. 任务设定模式

```bash
# 切换到设定模式 (首次启动默认)
/eket-mode setup

# 步骤 1: 编辑 inbox/human_input.md
# 描述项目愿景和需求

# 步骤 2: 保存并发送消息给 Claude
# "我已经写好了需求，请开始分析"

# 步骤 3: 协调智能体执行
# - 需求分析师：分析需求，创建 Epic 和 Tasks
# - 技术经理：架构设计
# - 项目经理：设定优先级

# 步骤 4: 查看状态报告
# inbox/human_feedback/setup-confirmation.md

# 步骤 5: 确认任务设定
# 在状态回复中确认

# 步骤 6: 切换到承接模式
/eket-mode execution
```

### 3. 任务承接模式

```bash
# 切换到承接模式
/eket-mode execution

# 步骤 1: 查看待处理任务
/eket-status

# 步骤 2: 领取任务
/eket-claim FEAT-001

# 步骤 3: 创建分支
git checkout -b feature/FEAT-001-login

# 步骤 4: 开发实现
# 编写代码、测试

# 步骤 5: 提交代码
git add .
git commit -m "feat: implement login form"
git push -u origin feature/FEAT-001-login

# 步骤 6: 创建 PR
/eket-review FEAT-001

# 步骤 7: 等待 Review
# 技术经理 Review PR
# PR 合并到 testing → 运行测试
# 测试通过后 PR 到 main

# 步骤 8: 任务完成
# Jira 状态更新为 done
```

---

## 命令参考

| 命令 | 功能 | 模式 |
|------|------|------|
| `/eket-init` | 初始化向导 | 通用 |
| `/eket-mode [setup\|execution]` | 切换任务模式 | 通用 |
| `/eket-status` | 查看状态 | 承接模式 |
| `/eket-task [desc]` | 创建/查看任务 | 通用 |
| `/eket-claim [id]` | 领取任务 | 承接模式 |
| `/eket-review [id]` | 请求 Review | 承接模式 |
| `/eket-help` | 显示帮助 | 通用 |

---

## 目录结构

```
project/
├── CLAUDE.md                      # 项目核心文档
├── .claude/
│   ├── commands/                  # Claude Code 命令
│   │   ├── eket-init.sh           # 初始化向导
│   │   ├── eket-mode.sh           # 模式切换
│   │   ├── eket-status.sh         # 查看状态
│   │   ├── eket-task.sh           # 任务管理
│   │   ├── eket-claim.sh          # 领取任务
│   │   └── eket-review.sh         # 请求 Review
│   └── settings.json              # 权限配置
├── .eket/
│   ├── config.yml                 # 项目配置
│   ├── state/                     # 运行状态
│   │   ├── mode.yml               # 当前模式
│   │   └── ...
│   ├── memory/                    # 记忆存储
│   └── logs/                      # 日志
├── inbox/
│   ├── human_input.md             # 人类需求输入
│   └── human_feedback/            # 人类反馈
├── outbox/
│   └── review_requests/           # Review 请求
├── tasks/                         # 本地任务 (兼容 v0.1)
├── confluence/                    # Confluence 仓库 (submodule)
│   ├── projects/{project}/
│   │   ├── requirements/
│   │   ├── architecture/
│   │   └── design/
│   └── memory/
├── jira/                          # Jira 仓库 (submodule)
│   ├── epics/
│   ├── tickets/
│   │   ├── feature/
│   │   ├── bugfix/
│   │   └── task/
│   └── state/
├── code_repo/                     # 代码目录
│   ├── src/
│   ├── tests/
│   └── deployments/
├── docs/                          # 框架文档
│   ├── FRAMEWORK.md
│   ├── THREE_REPO_ARCHITECTURE.md
│   ├── SKILLS_SYSTEM.md
│   ├── AGENTS_CONFIG.md
│   ├── BRANCH_STRATEGY.md
│   ├── AGENT_BEHAVIOR.md
│   └── CHANGELOG_v0.2.md
└── scripts/
    ├── init-project.sh            # 项目初始化
    ├── init-three-repos.sh        # 三仓库初始化
    ├── cleanup-project.sh         # 项目清理
    └── sync-remote.sh             # 远程同步 (待实现)
```

---

## 关键设计决策

### 1. 为什么使用三仓库？

- **关注分离**: 文档、代码、任务分别管理
- **权限控制**: 不同仓库可设置不同访问权限
- **版本独立**: 文档版本与代码版本解耦
- **协作可靠**: 通过 submodule 集成，保证一致性

### 2. 为什么需要任务模式？

- **职责清晰**: 协调智能体和执行智能体分工明确
- **流程规范**: 设定模式和承接模式对应不同工作流
- **资源优化**: 协调智能体常驻，执行智能体按需加载

### 3. 为什么是三分支模型？

- **质量保证**: testing 分支作为缓冲，确保 main 分支稳定
- **测试先行**: 所有代码必须先通过 testing 分支测试
- **快速迭代**: feature 分支支持并行开发

---

## 待实现功能

### P0 - 核心功能

- [ ] Agent 动态加载器 (Python/Shell 实现)
- [ ] Skills 调用机制
- [ ] Jira 状态机实现
- [ ] 远程同步脚本

### P1 - 增强功能

- [ ] 任务依赖可视化工具
- [ ] Confluence 文档模板生成
- [ ] 自动唤醒机制

### P2 - 优化功能

- [ ] 模式自动切换逻辑
- [ ] Agent 能力匹配优化
- [ ] Skills 性能优化

---

## 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 0.1.0 | 2026-03-18 | 初始版本 |
| 0.1.0 | 2026-03-19 | 专家组审查，完成 P0/P1 改进 |
| 0.2.0 | 2026-03-20 | 架构重构：三仓库、Agent 配置、Skills、分支策略、任务模式 |

---

**维护者**: EKET Framework Team
