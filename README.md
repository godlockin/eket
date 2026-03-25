# EKET Framework

**AI 智能体协作框架 | Version 0.7.2**
**最后更新**: 2026-03-25

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

> **EKET** 是一个基于 AI 智能体协作的开发框架，通过 Master-Slaver 架构和三仓库（Confluence/Jira/Code Repo）分离实现自动化软件生产和跨领域任务处理。

---

## 核心理念

> **一切皆 Task** —— 从需求收集、分析、拆解，到研发、迭代、Review、Merge，所有工作都是 Task，只是难度和持续时间不同。

每个 Agent 是独立的 Instance，主动承接符合自己角色的任务。

---

## 快速开始

### 1. 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git >= 2.30.0
- （可选）Redis >= 6.0

### 2. 安装

```bash
# 克隆模板
git clone https://github.com/godlockin/eket.git my-project
cd my-project

# 安装 Node.js 依赖
cd node && npm install && cd ..

# 启用高级功能
./scripts/enable-advanced.sh
```

### 3. 初始化项目

```bash
# 运行初始化向导
node node/dist/index.js init

# 初始化三仓库
./scripts/init-three-repos.sh
```

### 4. 启动 Agent

```bash
# 查看帮助
/eket-help

# 启动实例（自动检测 Master/Slaver 模式）
/eket-start

# 或启用自动模式（Slaver 自动领取任务）
/eket-start -a
```

---

## 核心特性

### Node.js 混合架构 (v0.7 新增)

```
┌─────────────────────────────────────────────────────────┐
│                   混合适配器层                            │
├─────────────────────────────────────────────────────────┤
│  Level 1: Node.js + Redis (完整功能)                     │
│  - Redis Pub/Sub 消息队列                                │
│  - Redis Hash 心跳存储                                   │
│  - SQLite 数据持久化                                     │
│                                                         │
│  ↓ (Redis 不可用)                                        │
│                                                         │
│  Level 2: Node.js + 文件队列 (降级模式)                   │
│  - .eket/data/queue/*.json                              │
│  - 去重机制 (processed.json)                            │
│  - 过期清理 + 自动归档                                   │
│                                                         │
│  ↓ (Node.js 不可用)                                      │
│                                                         │
│  Level 3: Shell 脚本 (基础模式)                          │
└─────────────────────────────────────────────────────────┘
```

### Master-Slaver 架构

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

### Node.js CLI 命令 (v0.7 新增)

#### 系统命令

```bash
node node/dist/index.js check          # 检查 Node.js 模块可用性
node node/dist/index.js doctor         # 诊断系统状态
```

#### Redis 命令

```bash
node node/dist/index.js redis:check          # 检查 Redis 连接
node node/dist/index.js redis:list-slavers   # 列出活跃 Slaver
```

#### SQLite 命令

```bash
node node/dist/index.js sqlite:check          # 检查 SQLite 数据库
node node/dist/index.js sqlite:list-retros    # 列出 Retrospective
node node/dist/index.js sqlite:search "<kw>"  # 搜索 Retrospective
node node/dist/index.js sqlite:report         # 生成统计报告
```

#### 任务管理

```bash
node node/dist/index.js init                  # 项目初始化向导
node node/dist/index.js claim [id]            # 领取任务
node node/dist/index.js submit-pr             # 提交 PR
node node/dist/index.js heartbeat:start <id>  # 启动心跳
node node/dist/index.js heartbeat:status      # 查看心跳状态
```

### Claude Code 命令

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

### v0.7 文档

- [RELEASE-v0.7.md](docs/RELEASE-v0.7.md) - v0.7 发布说明
- [IMPLEMENTATION_SUMMARY.md](docs/IMPLEMENTATION_SUMMARY.md) - v0.7 实施总结
- [IMPLEMENTATION-v0.7-phase2.md](docs/IMPLEMENTATION-v0.7-phase2.md) - Phase 2 实施文档
- [IMPLEMENTATION-v0.7-phase3.md](docs/IMPLEMENTATION-v0.7-phase3.md) - Phase 3 实施文档
- [v0.7-upgrade-guide.md](docs/v0.7-upgrade-guide.md) - v0.7 升级指南

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
| **0.7.2** | 2026-03-25 | 代码质量提升：类型安全、错误处理、DRY 优化 |
| **0.7.1** | 2026-03-25 | Phase 3 完整实现：PR 提交、三仓库克隆、文件队列 |
| **0.7.0** | 2026-03-24 | Node.js 混合架构实现 |
| 0.6.2 | 2026-03-24 | PR 审查机制增强、Roadmap 对齐检查 |
| 0.6.1 | 2026-03-24 | SYSTEM-SETTINGS.md 模板升级：专家 Agent 可定制 |
| 0.6.0 | 2026-03-24 | Docker 集成和 Slaver 心跳监控 |
| 0.5.x | 2026-03-23 | Merge 流程升级、路径标准化 |

---

## 技术栈

### 运行时

- **Node.js**: >= 18.0.0
- **TypeScript**: 5.x (Target: ES2022)

### 核心依赖

| 依赖 | 用途 |
|------|------|
| `ioredis` | Redis 客户端（消息队列、心跳） |
| `better-sqlite3` | SQLite 客户端（数据持久化） |
| `commander` | CLI 框架 |

### 开发依赖

| 工具 | 用途 |
|------|------|
| `typescript` | 类型检查 |
| `eslint` | 代码风格 |
| `@types/node` | Node.js 类型定义 |

---

## 许可证

MIT License

---

**维护者**: EKET Framework Team
**问题反馈**: 查看 [docs/](docs/) 目录或运行 `/eket-help`
