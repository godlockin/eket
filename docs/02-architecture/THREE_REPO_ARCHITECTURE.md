# EKET 三 Git 仓库架构

**版本**: 0.2.0
**日期**: 2026-03-20

---

## 架构概述

EKET 框架使用三个独立的 Git 仓库来实现关注分离和协作可靠：

```
┌─────────────────────────────────────────────────────────────────┐
│                        EKET 三仓库架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│   │   Confluence     │  │    Code Repo     │  │     Jira     │ │
│   ├──────────────────┤  ├──────────────────┤  ├──────────────┤ │
│   │  文档中心         │  │  代码仓库        │  │  任务管理     │ │
│   │                  │  │                  │  │              │ │
│   │ • 需求文档       │  │ • 源代码         │  │ • 需求票     │ │
│   │ • 架构设计       │  │ • 测试代码       │  │ • 缺陷票     │ │
│   │ • 技术规范       │  │ • 部署配置       │  │ • 任务票     │ │
│   │ • 会议记录       │  │ • CI/CD          │  │ • 状态追踪   │ │
│   │ • 最佳实践       │  │ • Docker/K8s     │  │ • 依赖关系   │ │
│   └──────────────────┘  └──────────────────┘  └──────────────┘ │
│            │                    │                    │          │
│            └────────────────────┼────────────────────┘          │
│                                 │                               │
│                                 ▼                               │
│                    ┌─────────────────────────┐                  │
│                    │   主项目 (Code Repo)    │                  │
│                    │   通过 submodule 集成    │                  │
│                    └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 仓库结构

### 1. Confluence 仓库 (`shared/confluence/`)

```
confluence/
├── README.md                      # 文档中心说明
├── projects/                      # 项目文档
│   └── {project-name}/
│       ├── background.md          # 项目背景
│       ├── requirements/          # 需求文档
│       │   ├── epic-001.md
│       │   ├── epic-002.md
│       │   └── changelog.md       # 需求变更记录
│       ├── architecture/          # 架构设计
│       │   ├── system-design.md   # 系统设计
│       │   ├── component-design.md # 组件设计
│       │   └── data-flow.md       # 数据流
│       ├── design/                # 详细设计
│       │   ├── database/          # 数据库设计
│       │   ├── api/               # API 设计
│       │   └── frontend/          # 前端设计
│       ├── specifications/        # 技术规范
│       │   ├── coding-style.md    # 代码规范
│       │   ├── test-guide.md      # 测试规范
│       │   └── security-guide.md  # 安全指南
│       ├── meetings/              # 会议记录
│       │   ├── 2026-03-20-kickoff.md
│       │   └── 2026-03-21-review.md
│       └── releases/              # 发布信息
│           ├── v0.1.0.md
│           └── changelog.md
├── memory/                        # 组织记忆
│   ├── best-practices/            # 最佳实践
│   ├── decisions/                 # 技术决策记录
│   └── lessons-learned/           # 经验教训
└── templates/                     # 文档模板
    ├── requirement-template.md
    ├── design-template.md
    └── meeting-notes-template.md
```

### 2. Code Repo 仓库 (`shared/code_repo/`)

```
code_repo/
├── README.md                      # 项目说明
├── .gitmodules                    # Submodule 配置
├── confluence/                    # → Confluence 仓库 (submodule)
├── jira/                          # → Jira 仓库 (submodule)
├── src/                           # 源代码
│   ├── frontend/                  # 前端代码
│   ├── backend/                   # 后端代码
│   └── shared/                    # 共享代码
├── tests/                         # 测试代码
│   ├── unit/                      # 单元测试
│   ├── integration/               # 集成测试
│   └── e2e/                       # E2E 测试
├── configs/                       # 配置文件
│   ├── development/               # 开发环境
│   ├── staging/                   # 预发布环境
│   └── production/                # 生产环境
├── deployments/                   # 部署配置
│   ├── docker/                    # Docker 配置
│   ├── kubernetes/                # K8s 配置
│   └── scripts/                   # 部署脚本
├── docs/                          # 项目文档（代码相关）
│   ├── api/                       # API 文档
│   └── guides/                    # 开发指南
└── scripts/                       # 工具脚本
    ├── build.sh
    ├── test.sh
    └── deploy.sh
```

### 3. Jira 仓库 (`shared/jira/`)

```
jira/
├── README.md                      # 任务管理说明
├── epics/                         # Epic 管理
│   ├── EPIC-001-user-auth/
│   │   ├── epic.md                # Epic 描述
│   │   ├── requirements.md        # 需求说明
│   │   └── acceptance.md          # 验收标准
│   └── EPIC-002-data-management/
├── tickets/                       # 任务票
│   ├── feature/                   # 功能票
│   │   ├── FEAT-001-login-form.md
│   │   ├── FEAT-002-login-api.md
│   │   └── FEAT-003-user-registration.md
│   ├── bugfix/                    # 缺陷票
│   │   └── BUG-001-login-error.md
│   └── task/                      # 任务票
│       ├── TASK-001-setup-ci.md
│       └── TASK-002-doc-update.md
├── index/                         # 索引
│   ├── by-feature/                # 按功能索引
│   ├── by-status/                 # 按状态索引
│   └── by-assignee/               # 按负责人索引
├── state/                         # 状态追踪
│   ├── active-tickets.json        # 活跃任务
│   ├── dependencies.json          # 依赖关系
│   └── progress.json              # 进度追踪
└── templates/                     # 票证模板
    ├── feature-template.md
    ├── bugfix-template.md
    └── task-template.md
```

---

## Submodule 集成

### 主项目 `.gitmodules` 配置

```ini
# code_repo/.gitmodules
[submodule "confluence"]
    path = confluence
    url = https://github.com/{org}/{project}-confluence.git
    branch = main

[submodule "jira"]
    path = jira
    url = https://github.com/{org}/{project}-jira.git
    branch = main
```

### 初始化脚本

```bash
# 初始化 submodule
git submodule init
git submodule update

# 添加 submodule
git submodule add https://github.com/{org}/{project}-confluence.git confluence
git submodule add https://github.com/{org}/{project}-jira.git jira
```

---

## 远程同步机制

### 远程仓库配置

```bash
# 配置远程仓库
git remote add origin https://github.com/{org}/{project}.git
git remote add confluence https://github.com/{org}/{project}-confluence.git
git remote add jira https://github.com/{org}/{project}-jira.git

# 同步脚本
./scripts/sync-remote.sh
```

### 同步脚本 (`scripts/sync-remote.sh`)

```bash
#!/bin/bash
# 三仓库同步脚本

set -e

echo "同步主仓库..."
git push origin main

echo "同步 Confluence 仓库..."
cd confluence
git push origin main

echo "同步 Jira 仓库..."
cd ../jira
git push origin main

echo "所有仓库同步完成!"
```

---

## 分支策略

### 三分支模型

```
main                    # 主分支，生产环境
  │
  ├── testing           # 测试分支，预发布环境
  │     │
  │     └── feature/*   # 功能分支
  │
  └── hotfix/*          # 紧急修复分支
```

### 分支用途

| 分支 | 用途 | 保护级别 | 合并规则 |
|------|------|---------|---------|
| `main` | 生产环境代码 | 严格保护 | 仅允许 PR 合并 |
| `testing` | 测试环境代码 | 保护 | PR 合并，需测试通过 |
| `feature/*` | 功能开发 | 开放 | 个人开发分支 |
| `hotfix/*` | 紧急修复 | 保护 | 快速通道 PR |

### 分支流转

```
feature/login-form ──→ testing ──→ main
       │                    │
       │                    └──→ 生产部署
       │
       └──→ 测试通过后合并
```

---

## 任务状态与仓库交互

### 任务状态转换

```
┌─────────────────────────────────────────────────────────────────┐
│                    任务状态与仓库交互图                          │
└─────────────────────────────────────────────────────────────────┘

    backlog
       │
       ▼
    analysis ──────────────→ Confluence: 更新需求文档
       │
       ▼
    approved ──────────────→ Confluence: 记录技术决策
       │
       ▼
    ready
       │
       ▼
    dev ───────────────────→ Code Repo: 创建 feature 分支
       │                        Code Repo: 提交代码
       │
       ▼
    test ──────────────────→ Code Repo: 合并到 testing
       │                        Code Repo: 运行测试
       │
       ▼
    review ────────────────→ Code Repo: 创建 PR
       │                        Jira: 更新任务状态
       │
       ▼
    done ──────────────────→ Jira: 完成任务
                             Confluence: 更新文档
                             Code Repo: 合并到 main
```

---

## 快速开始

### 初始化三仓库

```bash
# 1. 创建远程仓库（在 GitHub/GitLab）
# - {project}
# - {project}-confluence
# - {project}-jira

# 2. 初始化主项目
./scripts/init-project.sh my-project /path/to/project
cd /path/to/project

# 3. 配置远程
git remote add origin https://github.com/{org}/my-project.git
git submodule add https://github.com/{org}/my-project-confluence.git confluence
git submodule add https://github.com/{org}/my-project-jira.git jira

# 4. 同步远程
./scripts/sync-remote.sh
```

### 日常操作

```bash
# 拉取最新代码（包括 submodule）
git pull --recurse-submodules

# 推送所有变更
./scripts/sync-remote.sh

# 查看 submodule 状态
git submodule status
```

---

**维护者**: EKET Framework Team
