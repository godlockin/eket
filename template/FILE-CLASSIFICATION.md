# EKET 框架文件分类与初始化策略

**版本**: v2.1.3  
**创建日期**: 2026-04-10  
**目的**: 定义 template 目录中各类文件的存储策略和初始化行为

---

## 文件分类总览

EKET framework 将文件分为四大类：

| 分类 | 用途 | 初始化行为 | 运行时行为 |
|------|------|-----------|-----------|
| **A. 运行时可变文件** | 状态、数据、索引 | 创建空目录/初始文件 | 频繁更新 |
| **B. 框架契约/规范** | 文档、协议、流程定义 | 复制到项目 | 只读参考 |
| **C. 模板文件** | Ticket 模板、配置模板 | 复制到项目 | 按需实例化 |
| **D. 记忆加载文件** | 框架哲学、愿景 | 不复制，仅加载到上下文 | 不复制 |

---

## A. 运行时可变文件（Runtime-Updatable Files）

这类文件在运行时被智能体频繁读写，存储项目状态和数据。

### A1. 状态文件（State Files）

**位置**: `jira/state/`, `.eket/state/`, `shared/.state/`

| 文件 | 用途 | 更新频率 | 负责人 |
|------|------|----------|--------|
| `jira/state/ticket-index.yml` | 所有 tickets 的索引（single source of truth） | 每次 ticket 状态变更 | Master/Slaver |
| `jira/state/project-status.yml` | 项目整体状态报告 | 每 10 分钟 | Master |
| `.eket/state/instance_config.yml` | 当前实例配置 | 启动时写入 | 实例自身 |
| `.eket/state/slavers/{instance_id}.yml` | Slaver 注册信息 | Slaver 启动时 | Slaver |
| `.eket/state/master_marker.yml` | Master 标记文件 | Master 启动时 | Master |
| `shared/.state/.gitkeep` | 共享状态目录 | 按需 | 所有实例 |

**初始化策略**:
- 创建目录
- 创建空索引文件或初始占位文件
- 这些文件**必须**在 `.gitignore` 中排除（或只提交骨架）

### A2. 消息队列文件（Message Queue Files）

**位置**: `shared/message_queue/`

| 目录 | 用途 | 清理策略 |
|------|------|----------|
| `inbox/` | 接收消息 | 消费后归档/删除 |
| `outbox/` | 发送消息 | 发送后归档 |
| `broadcast/` | 广播消息 | 24 小时后清理 |
| `dead_letter/` | 死信队列 | 7 天后清理 |

**初始化策略**:
- 创建目录结构
- 不复制任何消息文件
- 完全在 `.gitignore` 中排除

### A3. 输入/输出文件（I/O Files）

**位置**: `inbox/`, `outbox/`, `tasks/`

| 文件/目录 | 用途 | 更新者 |
|----------|------|--------|
| `inbox/human_input.md` | 人类需求输入 | 人类 |
| `inbox/human_feedback/*.md` | 人类反馈/决策 | 人类/Master |
| `inbox/dependency-clarification.md` | 依赖追问 | Slaver → 人类 |
| `inbox/blocker_reports/*.md` | Blocker 报告 | Slaver → Master |
| `outbox/review_requests/*.md` | PR 审查请求 | Slaver |
| `tasks/*.md` | 任务定义 | Master |

**初始化策略**:
- 创建目录
- 复制模板文件（如 `human_input.md` 模板）
- 运行时内容不提交到 Git（或按需提交）

---

## B. 框架契约/规范（Framework Contracts & Specifications）

这类文件定义框架的行为规范、协议和流程，是**只读参考文档**。

### B1. 核心愿景与哲学

| 文件 | 用途 | 加载方式 |
|------|------|----------|
| `docs/EKET-VISION.md` | 框架协作愿景和核心原则 | 启动时加载到记忆 |
| `CLAUDE.md` (template) | Claude Code 项目指南 | 复制到项目根目录 |
| `AGENTS.md` (template) | 通用 AI Agent 引导文件 | 复制到项目根目录 |

**初始化策略**:
- `EKET-VISION.md` 不复制到项目，由实例在启动时读取
- `CLAUDE.md` 和 `AGENTS.md` 复制到项目根目录

### B2. 角色行为规范

| 文件 | 用途 | 复制策略 |
|------|------|----------|
| `docs/MASTER-HEARTBEAT-CHECKLIST.md` | Master 自检清单 | ✓ 复制到 `docs/` |
| `docs/SLAVER-HEARTBEAT-CHECKLIST.md` | Slaver 自检清单 | ✓ 复制到 `docs/` |
| `docs/MASTER-WORKFLOW.md` | Master 完整工作流 | ✓ 复制到 `docs/` |
| `docs/SLAVER-AUTO-EXEC-GUIDE.md` | Slaver 自动执行指南 | ✓ 复制到 `docs/` |
| `docs/TICKET-RESPONSIBILITIES.md` | Ticket 职责边界 | ✓ 复制到 `docs/` |

**初始化策略**:
- 全部复制到项目 `docs/` 目录
- 作为项目文档的一部分，可被实例引用

### B3. 协作流程规范

| 文件 | 用途 | 复制策略 |
|------|------|----------|
| `docs/SLAVER-PR-WAIT-FLOW.md` | Slaver PR 等待流程 | ✓ 复制到 `docs/` |
| `docs/COMMUNICATION-PROTOCOL.md` | 消息队列通信协议 | ✓ 复制到 `docs/` |
| `docs/MASTER-PR-REVIEW-FLOW.md` | Master PR 审查流程 | ✓ 复制到 `docs/` |

**初始化策略**:
- 全部复制到项目 `docs/` 目录
- 实例在执行相关流程时参考

### B4. 索引与数据结构

| 文件 | 用途 | 复制策略 |
|------|------|----------|
| `jira/INDEX-STRUCTURE.md` | 索引文件结构定义 | ✓ 复制到 `jira/` |
| `jira/TICKET-NUMBERING.md` | Ticket 编号规则 | ✓ 复制到 `jira/` |
| `COMMUNICATION-PROTOCOL.md` | 通信协议（消息格式） | ✓ 复制到项目根目录 |

---

## C. 模板文件（Template Files）

这类文件是**实例化模板**，在创建新资源时被复制和填充。

### C1. Ticket 模板

**位置**: `jira/templates/`

| 文件 | 用途 | 使用场景 |
|------|------|----------|
| `milestone-template.md` | Milestone 卡片模板 | Master 创建 Milestone |
| `sprint-template.md` | Sprint 卡片模板 | Master 创建 Sprint |
| `epic-template.md` | Epic 卡片模板 | Master 创建 Epic |
| `feature-ticket.md` | 功能开发 Ticket | Master 创建 FEAT 任务 |
| `bugfix-ticket.md` | Bug 修复 Ticket | Master 创建 FIX 任务 |
| `task-ticket.md` | 一般任务 Ticket | Master 创建 TASK 任务 |
| `test-ticket.md` | 测试任务 Ticket | Master 创建 TEST 任务 |
| `doc-ticket.md` | 文档任务 Ticket | Master 创建 DOC 任务 |
| `prd-ticket.md` | 产品需求 Ticket | Master 创建 PRD 任务 |
| `ui-design-ticket.md` | UI 设计 Ticket | Master 创建 U-DESIGN 任务 |
| `tech-design-ticket.md` | 技术设计 Ticket | Master 创建 T-DESIGN 任务 |
| `deployment-ticket.md` | 部署任务 Ticket | Master 创建 DEPL 任务 |
| `data-analysis-ticket.md` | 数据分析 Ticket | Master 创建 DATA-ANALYSIS 任务 |
| `user-research-ticket.md` | 用户调研 Ticket | Master 创建 USER-RES 任务 |
| `compliance-review-ticket.md` | 合规审查 Ticket | Master 创建 COMPLIANCE 任务 |
| `pr-review-checklist.md` | PR 审查清单 | Master/Slaver 参考 |
| `index/by-status-template.md` | 状态索引模板 | Master 维护 |
| `index/by-role-template.md` | 角色索引模板 | Master 维护 |

**初始化策略**:
- 复制到项目 `jira/templates/`
- Master 在创建对应类型 Ticket 时复制模板并填充

### C2. Confluence 模板

**位置**: `confluence/templates/`

| 文件 | 用途 | 使用场景 |
|------|------|----------|
| `task-analysis-template.md` | 任务分析报告模板 | Slaver 撰写分析报告 |
| `stage_definition_template.md` | 阶段定义模板 | Master 定义阶段 |
| `meta_function_template.md` | 元功能定义模板 | 架构设计 |
| `dependencies_template.md` | 依赖关系模板 | 架构设计 |

**初始化策略**:
- 复制到项目 `confluence/templates/`
- 按需实例化到 `confluence/projects/{project}/`

### C3. Agent 模板

**位置**: `agents/`

| 文件 | 用途 | 复制策略 |
|------|------|----------|
| `agent_base_template.yml` | Agent 基础模板 | ✓ 复制 |
| `executor/frontend_dev/agent.yml` | 前端开发 Agent | ✓ 复制 |
| `coordinator/requirement_analyst/agent.yml` | 需求分析师 Agent | ✓ 复制 |
| `reviewer/phase_reviewer/agent.yml` | 阶段审查 Agent | ✓ 复制 |
| `dynamic/ml_engineer_template.yml` | ML 工程师模板 | ✓ 复制 |
| `dynamic/operation_expert_template.yml` | 运营专家模板 | ✓ 复制 |

**初始化策略**:
- 复制到项目 `agents/`
- 用于动态创建 Slaver 实例时的角色定义

### C4. Skills 模板

**位置**: `skills/`

| 分类 | 文件 | 复制策略 |
|------|------|----------|
| **设计** | `design/*.yml` (5 个) | ✓ 复制到 `skills/design/` |
| **开发** | `development/*.yml` (2 个) | ✓ 复制到 `skills/development/` |
| **DevOps** | `devops/*.yml` (4 个) | ✓ 复制到 `skills/devops/` |
| **文档** | `documentation/*.yml` (4 个) | ✓ 复制到 `skills/documentation/` |
| **测试** | `testing/*.yml` (4 个) | ✓ 复制到 `skills/testing/` |
| **需求** | `requirements/*.yml` (4 个) | ✓ 复制到 `skills/requirements/` |
| **核心** | `registry.yml` | ✓ 复制到 `skills/` |

**初始化策略**:
- 整个 `skills/` 目录复制到项目
- Slaver 在执行任务时加载对应 Skills

### C5. 配置文件模板

**位置**: `.eket/config/`

| 文件 | 用途 | 复制策略 |
|------|------|----------|
| `config.yml` | 主配置文件 | ✓ 复制并替换占位符 |
| `config-human-involvement.example.yml` | 人类参与配置示例 | ✓ 复制 |
| `advanced.yml` | 高级功能配置 | ✓ 复制 |
| `git.yml` | Git 配置 | ✓ 复制 |
| `memory_log.yml` | 记忆日志配置 | ✓ 复制 |
| `monitoring.yml` | 监控配置 | ✓ 复制 |
| `permissions.yml` | 权限配置 | ✓ 复制 |
| `process.yml` | 流程配置 | ✓ 复制 |
| `project.yml` | 项目配置 | ✓ 复制并替换占位符 |
| `review_merge.yml` | Review/Merge 配置 | ✓ 复制 |
| `tasks.yml` | 任务配置 | ✓ 复制 |
| `testing.yml` | 测试配置 | ✓ 复制 |

**初始化策略**:
- 复制到项目 `.eket/config/`
- `config.yml` 和 `project.yml` 需替换 `{{PROJECT_NAME}}` 等占位符

### C6. 工具脚本

**位置**: `.claude/commands/`, `scripts/`

| 目录 | 用途 | 复制策略 |
|------|------|----------|
| `.claude/commands/*.sh` | Claude Code 命令 (20+ 个) | ✓ 全部复制 |
| `scripts/*.sh` | 工具脚本 (50+ 个) | ✓ 全部复制 |
| `.eket/health_check.sh` | 健康检查脚本 | ✓ 复制 |

**初始化策略**:
- 全部复制到项目
- 保留执行权限 `chmod +x`

### C7. CI/CD 配置

**位置**: `.github/workflows/`

| 文件 | 用途 | 复制策略 |
|------|------|----------|
| `agent-runner.yml` | Agent Runner 工作流 | ✓ 复制 |
| `health-check.yml` | 健康检查工作流 | ✓ 复制 |
| `pr-review.yml` | PR 自动审查工作流 | ✓ 复制 |

**初始化策略**:
- 复制到项目 `.github/workflows/`
- 按需启用/禁用

---

## D. 记忆加载文件（Memory-Only Files）

这类文件**不复制到项目**，仅在实例启动时加载到上下文中。

| 文件 | 用途 | 加载时机 |
|------|------|----------|
| `docs/EKET-VISION.md` | 框架协作愿景 | Master/Slaver 启动时 |
| `examples/quickstart.md` | 快速开始示例 | 按需参考 |
| `skills/README.md` | Skills 系统说明 | Skills 加载时 |
| `agents/dynamic/README.md` | 动态 Agent 说明 | 动态创建 Agent 时 |

**特点**:
- 这些文件是框架的"知识库"
- 项目实例不需要重复存储
- 实例通过读取 template 目录或框架文档获取

---

## 初始化脚本行为指南

### `init-project.sh` 应该复制的内容

```bash
# 1. 核心文档
cp template/CLAUDE.md
cp template/AGENTS.md
cp template/README.md
cp template/SYSTEM-SETTINGS.md
cp template/SECURITY.md

# 2. 配置目录
cp -r template/.eket/config/ → .eket/config/
cp template/.eket/config.yml
cp template/.eket/version.yml
cp template/.eket/health_check.sh

# 3. 命令脚本
cp template/.claude/commands/*.sh → .claude/commands/
cp template/.claude/settings.json

# 4. 文档目录
cp -r template/docs/ → docs/

# 5. Jira 相关
cp -r template/jira/templates/ → jira/templates/
cp template/jira/INDEX-STRUCTURE.md
cp template/jira/TICKET-NUMBERING.md

# 6. Confluence 模板
cp -r template/confluence/templates/ → confluence/templates/

# 7. Agents 定义
cp -r template/agents/ → agents/

# 8. Skills 定义
cp -r template/skills/ → skills/

# 9. 工具脚本
cp scripts/*.sh → scripts/

# 10. CI/CD 配置
cp template/.github/workflows/*.yml → .github/workflows/

# 11. 示例（可选）
cp -r template/examples/ → examples/
```

### `init-project.sh` 应该创建的空目录

```bash
# 运行时目录（不复制内容）
mkdir -p inbox/human_feedback
mkdir -p outbox/review_requests
mkdir -p outbox/tasks
mkdir -p tasks
mkdir -p .eket/state
mkdir -p .eket/logs
mkdir -p .eket/memory
mkdir -p shared/message_queue/{inbox,outbox,broadcast,dead_letter}
mkdir -p jira/tickets/{feature,bugfix,task}/
mkdir -p jira/state/
mkdir -p jira/index/
mkdir -p confluence/projects/{PROJECT_NAME}/{requirements,architecture,design,specifications,meetings,releases}
mkdir -p confluence/memory/{best-practices,decisions,lessons-learned}
```

### `init-project.sh` 应该创建的初始文件

```bash
# inbox/human_input.md - 人类需求输入模板
# inbox/dependency-clarification.md - 依赖追问模板
# jira/state/ticket-index.yml - 空索引骨架
# jira/state/project-status.yml - 空状态骨架
```

---

## .gitignore 策略

### 必须排除的运行时文件

```gitignore
# 运行时状态文件
.eket/state/*.yml
.eket/state/slavers/*.yml
.eket/state/master_marker.yml
.eket/logs/*.log
.eket/memory/*.md

# 消息队列文件
shared/message_queue/inbox/*.json
shared/message_queue/outbox/*.json
shared/message_queue/broadcast/*.json
shared/message_queue/dead_letter/*.json

# 输入/输出文件（可选：保留骨架）
inbox/human_feedback/*.md
outbox/review_requests/*.md
outbox/tasks/*.md

# Jira 运行时状态
jira/state/ticket-index.yml
jira/state/project-status.yml
jira/tickets/*/*.md

# 临时文件
*.tmp
*.bak
.ecket/data/
```

### 应该提交的文件

```gitignore
# 保留目录结构
inbox/human_feedback/.gitkeep
outbox/review_requests/.gitkeep
shared/message_queue/inbox/.gitkeep
jira/tickets/feature/.gitkeep
jira/tickets/bugfix/.gitkeep
```

---

## 文件分类决策树

```
这个文件是什么类型？
├── 运行时状态/数据 → A 类（创建空目录/初始文件，.gitignore 排除）
├── 框架规范/流程文档 → B 类（复制到项目 docs/，只读参考）
├── 实例化模板 → C 类（复制到项目，按需实例化）
└── 框架知识库 → D 类（不复制，启动时加载到记忆）

这个文件需要被实例修改吗？
├── 是 → A 类
├── 否，但是需要参考 → B 类
├── 否，用于创建其他文件 → C 类
└── 否，仅框架自身理解 → D 类
```

---

## 版本兼容性

| 框架版本 | 文件分类版本 | 变更说明 |
|----------|-------------|----------|
| v2.1.3 | v1.0 | 初始版本，定义四大类文件 |

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-10
