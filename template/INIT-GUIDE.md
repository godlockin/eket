# EKET 框架初始化指南

**版本**: v2.1.3  
**创建日期**: 2026-04-10  
**目的**: 快速了解 EKET 框架初始化时需要复制/创建/加载的文件

---

## 快速参考表

| 文件类型 | 示例 | 初始化行为 | 运行时行为 | .gitignore |
|---------|------|-----------|-----------|------------|
| **运行时状态** | `jira/state/ticket-index.yml` | 创建空骨架 | 频繁更新 | ✓ 排除 |
| **框架文档** | `docs/*.md` | 复制到项目 | 只读参考 | ✗ 提交 |
| **模板文件** | `jira/templates/*.md` | 复制到项目 | 按需实例化 | ✗ 提交 |
| **记忆文件** | `docs/EKET-VISION.md` | 不复制 | 启动时加载 | - |

---

## 1. 运行时可变文件（A 类）- 创建空骨架

### 1.1 状态文件

```bash
# 创建目录
mkdir -p jira/state
mkdir -p .eket/state
mkdir -p shared/.state

# 创建初始文件（空骨架）
jira/state/ticket-index.yml    # Ticket 索引（single source of truth）
jira/state/project-status.yml  # 项目状态报告
.eket/state/instance_config.yml  # 实例配置（运行时填写）
```

### 1.2 消息队列目录

```bash
# 创建目录（不创建文件）
mkdir -p shared/message_queue/inbox
mkdir -p shared/message_queue/outbox
mkdir -p shared/message_queue/broadcast
mkdir -p shared/message_queue/dead_letter
```

### 1.3 输入/输出目录

```bash
# 创建目录
mkdir -p inbox/human_feedback
mkdir -p outbox/review_requests
mkdir -p outbox/tasks
mkdir -p tasks

# 创建初始文件
inbox/human_input.md              # 人类需求输入模板
inbox/dependency-clarification.md # 依赖追问模板
```

---

## 2. 框架契约/规范（B 类）- 复制到项目

### 2.1 核心文档

```bash
# 根目录文档
cp template/CLAUDE.md → CLAUDE.md
cp template/AGENTS.md → AGENTS.md
cp template/README.md → README.md
cp template/SYSTEM-SETTINGS.md → SYSTEM-SETTINGS.md
cp template/SECURITY.md → SECURITY.md
cp template/FILE-CLASSIFICATION.md → FILE-CLASSIFICATION.md
```

### 2.2 项目文档

```bash
cp -r template/docs/* → docs/
```

包含：
- `MASTER-HEARTBEAT-CHECKLIST.md`
- `SLAVER-HEARTBEAT-CHECKLIST.md`
- `MASTER-WORKFLOW.md`
- `SLAVER-AUTO-EXEC-GUIDE.md`
- `SLAVER-PR-WAIT-FLOW.md`
- `COMMUNICATION-PROTOCOL.md`
- `TICKET-RESPONSIBILITIES.md`
- `EKET-VISION.md` (也在项目 docs 中保留一份)

### 2.3 Jira 规范

```bash
cp template/jira/INDEX-STRUCTURE.md → jira/INDEX-STRUCTURE.md
cp template/jira/TICKET-NUMBERING.md → jira/TICKET-NUMBERING.md
```

---

## 3. 模板文件（C 类）- 复制到项目

### 3.1 Jira Ticket 模板

```bash
cp -r template/jira/templates/* → jira/templates/
```

包含：
- `milestone-template.md`
- `sprint-template.md`
- `epic-template.md`
- `feature-ticket.md`
- `bugfix-ticket.md`
- `task-ticket.md`
- `test-ticket.md`
- `doc-ticket.md`
- `prd-ticket.md`
- `ui-design-ticket.md`
- `tech-design-ticket.md`
- `deployment-ticket.md`
- `data-analysis-ticket.md`
- `user-research-ticket.md`
- `compliance-review-ticket.md`
- `pr-review-checklist.md`
- `index/by-status-template.md`
- `index/by-role-template.md`

### 3.2 Confluence 模板

```bash
cp -r template/confluence/templates/* → confluence/templates/
```

包含：
- `task-analysis-template.md`
- `stage_definition_template.md`
- `meta_function_template.md`
- `dependencies_template.md`

### 3.3 Agent 定义

```bash
cp -r template/agents/* → agents/
```

### 3.4 Skills 定义

```bash
cp -r template/skills/* → skills/
```

包含：
- `design/*.yml` (5 个)
- `development/*.yml` (2 个)
- `devops/*.yml` (4 个)
- `documentation/*.yml` (4 个)
- `testing/*.yml` (4 个)
- `requirements/*.yml` (4 个)
- `registry.yml`

### 3.5 配置文件

```bash
cp template/.eket/config.yml → .eket/config.yml
cp template/.eket/version.yml → .eket/version.yml
cp -r template/.eket/config/* → .eket/config/
```

### 3.6 工具脚本

```bash
cp template/.claude/commands/*.sh → .claude/commands/
cp scripts/*.sh → scripts/
cp template/.eket/health_check.sh → .eket/health_check.sh
```

### 3.7 CI/CD 配置

```bash
cp template/.github/workflows/*.yml → .github/workflows/
```

---

## 4. 记忆加载文件（D 类）- 不复制

这些文件在实例启动时加载到上下文中，不需要复制到项目：

| 文件 | 加载时机 |
|------|----------|
| `template/docs/EKET-VISION.md` | Master/Slaver 启动时 |
| `template/examples/quickstart.md` | 按需参考 |
| `template/skills/README.md` | Skills 加载时 |
| `template/agents/dynamic/README.md` | 动态 Agent 创建时 |

**注意**: 虽然 `EKET-VISION.md` 也会复制到项目 `docs/` 作为参考，但实例启动时优先从框架 template 目录加载。

---

## 5. .gitignore 配置

必须排除的运行时文件：

```gitignore
# 运行时状态文件（A 类）
.eket/state/
.eket/logs/
.eket/memory/
jira/state/ticket-index.yml
jira/state/project-status.yml
jira/tickets/*/*.md

# 输入/输出文件（A 类）
inbox/human_feedback/*.md
outbox/review_requests/*.md
outbox/tasks/*.md
tasks/*.md

# 消息队列（A 类）
shared/message_queue/inbox/
shared/message_queue/outbox/
shared/message_queue/broadcast/
shared/message_queue/dead_letter/
```

---

## 6. 初始化脚本自动处理

`scripts/init-project.sh` 自动处理以下内容：

### 6.1 创建目录结构

```bash
# 基础目录
.eket/, .eket/state/, .eket/logs/, .eket/memory/
inbox/, inbox/human_feedback/
outbox/, outbox/review_requests/
tasks/
shared/message_queue/{inbox,outbox,broadcast,dead_letter}/
```

### 6.2 初始化三仓库（Git 模式）

```bash
confluence/  # Git 仓库
jira/        # Git 仓库
code_repo/   # Git 仓库
```

### 6.3 复制模板文件

- CLAUDE.md, AGENTS.md, README.md, SYSTEM-SETTINGS.md, SECURITY.md
- FILE-CLASSIFICATION.md
- docs/, skills/, agents/
- jira/templates/, confluence/templates/
- .claude/commands/, scripts/
- .github/workflows/
- .eket/config.yml, .eket/version.yml, .eket/config/*

### 6.4 创建初始状态文件

- `jira/state/ticket-index.yml` (空骨架)
- `jira/state/project-status.yml` (空骨架)
- `inbox/human_input.md` (模板)

---

## 7. 文件分类决策树

```
这个文件在运行时需要被修改吗？
├── 是 → A 类（创建空骨架，.gitignore 排除）
└── 否 → 继续往下

这个文件是模板（用于创建其他文件）吗？
├── 是 → C 类（复制到项目）
└── 否 → 继续往下

这个文件是框架规范/流程文档吗？
├── 是 → B 类（复制到项目，只读参考）
└── 否 → 继续往下

这个文件仅用于框架自身理解？
├── 是 → D 类（不复制，启动时加载）
```

---

## 8. 检查清单

### 8.1 初始化后应存在的文件

```
[ ] CLAUDE.md
[ ] AGENTS.md
[ ] README.md
[ ] SYSTEM-SETTINGS.md
[ ] SECURITY.md
[ ] FILE-CLASSIFICATION.md
[ ] .gitignore
[ ] .eket/config.yml
[ ] .eket/version.yml
[ ] .eket/health_check.sh
[ ] .eket/config/*.yml
[ ] docs/*.md
[ ] jira/INDEX-STRUCTURE.md
[ ] jira/TICKET-NUMBERING.md
[ ] jira/templates/*.md
[ ] jira/state/ticket-index.yml (空骨架)
[ ] jira/state/project-status.yml (空骨架)
[ ] inbox/human_input.md
[ ] skills/**
[ ] agents/**
[ ] .claude/commands/*.sh
[ ] scripts/*.sh
```

### 8.2 初始化后应存在的目录

```
[ ] .eket/state/
[ ] .eket/logs/
[ ] .eket/memory/
[ ] inbox/human_feedback/
[ ] outbox/review_requests/
[ ] tasks/
[ ] shared/message_queue/
[ ] confluence/ (Git 仓库)
[ ] jira/ (Git 仓库)
[ ] code_repo/ (Git 仓库)
```

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-10
