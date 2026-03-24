# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# EKET - AI 智能体协作框架

**版本**: 0.6.1
**最后更新**: 2026-03-24

## 变更说明 (v0.6.1)

### SYSTEM-SETTINGS.md 模板升级

- **专家 Agent 可定制**: Slaver 角色扩展为任意领域专家（研发/业务/运维/数据/内容创作等）
- **技术栈可配置**: 支持任意运行时环境（Python/Node.js/Java/Go 等）和包管理器
- **任务状态机灵活配置**: 执行状态根据任务类型自定义（dev/test, dry_run/verification, security_setting/attack_simulation 等）
- **章节结构优化**: 修复编号问题，添加 4.1 Master 职责，统一节号

### 新增配置示例

```yaml
# 任务类型与执行状态映射
task_types:
  - name: "deployment"
    execution_states: ["dry_run", "verification", "production"]
  - name: "security"
    execution_states: ["security_setting", "attack_simulation", "remediation"]
  - name: "content"
    execution_states: ["drafting", "editing", "publishing"]
```

---

## 核心设计理念

## 系统设定文档模板

EKET 框架提供系统设定文档模板，用于指导新项目创建自己的系统设定文件。

**模板位置**: `template/SYSTEM-SETTINGS.md`

**使用方法**:
1. 运行项目初始化脚本：`./scripts/init-project.sh <project-name> /path/to/project`
2. 脚本会自动复制模板到项目根目录，并替换占位符
3. 编辑生成的 `SYSTEM-SETTINGS.md`，根据项目实际情况定制内容

**模板包含**:
- 完整的项目目录树结构（占位符格式）
- 依赖和语言版本要求
- Master/Slaver 架构详解
- 任务状态机和分支策略
- 心跳机制和通信协议
- 故障排查指南
- 分析报告 Review 机制 (v0.6.1 新增)

**示例**:
```bash
# 在 vibe_search 项目中查看系统设定
cat vibe_search/SYSTEM-SETTINGS.md
```

---

## 核心设计理念

> **一切皆 Task** —— 从需求收集、分析、拆解，到研发、迭代、Review、Merge，所有工作都是 Task，只是难度和持续时间不同。

每个 Agent 是独立的 Instance，主动承接符合自己角色的任务。

## 快速开始

```bash
# 1. 初始化项目
./scripts/init-project.sh <project-name> /path/to/project

# 2. 进入项目目录
cd /path/to/project

# 3. 启动 Agent 实例（自动检测角色）
/eket-start

# 或启用自动模式（自动领取匹配任务）
/eket-start -a
```

## 核心命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导（首次启动） |
| `/eket-start` | 启动实例（自动检测 Master/Slaver 模式） |
| `/eket-start -a` | 自动模式启动（Slaver 自动领取任务） |
| `/eket-status` | 查看状态和任务列表 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-review <id>` | 请求 Review |
| `/eket-help` | 显示帮助 |
| `/eket-ask` | 依赖追问（缺少数据源/API/认证配置时） |
| `/eket-mode setup` | 切换到任务设定模式 |
| `/eket-mode execution` | 切换到任务承接模式 |

## 常用脚本

### 项目初始化
```bash
./scripts/init-project.sh <project-name> /path/to/project
./scripts/init-three-repos.sh <project-name> <org> <platform>
./scripts/cleanup-project.sh [--full] /path/to/project
```

### 任务管理
```bash
./scripts/prioritize-tasks.sh -a    # 任务优先级排序（自动模式）
./scripts/recommend-tasks.sh        # 任务推荐（手动模式）
./scripts/load-agent-profile.sh     # 加载 Agent Profile
```

### 测试
```bash
./tests/run-unit-tests.sh           # 运行单元测试
./tests/run-all-tests.sh            # 运行所有测试
./tests/run-integration-tests.sh    # 运行集成测试
./tests/run-scenario-tests.sh       # 运行场景测试
```

### 运维和监控
```bash
./scripts/check-docker.sh           # Docker 环境检查
./scripts/docker-redis.sh           # Redis Docker 管理
./scripts/docker-sqlite.sh          # SQLite Docker 管理
./scripts/heartbeat-monitor.sh      # 心跳监控
./scripts/slaver-heartbeat.sh       # Slaver 心跳上报
./scripts/log-rotate.sh             # 日志轮转
```

### 验证和检查
```bash
./scripts/validate-all.sh           # 运行所有验证
./scripts/validate-config.sh        # 配置验证
./scripts/dependency-check.sh       # 依赖检查
./scripts/merge-validator.sh        # Merge 验证
./scripts/test-gate-system.sh       # 测试门禁系统
```

---

## Agent 角色和特性

### 专家 Agent 角色（按项目需要配置）

> **说明**: EKET v0.6.1 起，Slaver 角色扩展为**专家 Agent**，可根据项目需要配置为任意领域的专家。

#### 示例角色类型

| 领域 | 角色 | 职责 | 处理 Task 标签 |
|------|------|------|---------------|
| **研发团队** | `frontend_dev` | 前端开发 | `frontend`, `ui`, `react`, `vue` |
| | `backend_dev` | 后端开发 | `backend`, `api`, `database` |
| | `qa_engineer` | 测试工程师 | `test`, `qa` |
| **业务团队** | `business_analyst` | 业务分析 | `requirement`, `analysis`, `process` |
| | `compliance_expert` | 合规审查 | `compliance`, `legal`, `gdpr` |
| | `ux_designer` | 用户体验设计 | `ux`, `design`, `accessibility` |
| **运维团队** | `devops_engineer` | 运维部署 | `devops`, `deploy`, `docker`, `k8s` |
| | `security_expert` | 安全审查 | `security`, `vulnerability`, `pentest` |
| | `sre` | 站点可靠性 | `reliability`, `monitoring`, `incident` |
| **其他领域** | `data_scientist` | 数据分析 | `data`, `ml`, `analytics` |
| | `content_creator` | 内容创作 | `content`, `copywriting`, `translation` |
| | `product_owner` | 产品负责人 | `product`, `priority`, `roadmap` |

> **配置方式**: 在 `.eket/config.yml` 中定义项目所需的角色类型和匹配规则，详见 template/SYSTEM-SETTINGS.md 第 5.1 节。

### Agent 特性

- **独立运行**: 每个 Agent 有自己的进程/会话，互不干扰
- **主动承接**: 根据角色设定，主动领取匹配的任务
- **可插拔**: 可随时启动新的 Agent 实例加入协作
- **状态隔离**: Agent 之间有明确的状态边界
- **领域专家**: 角色可根据项目需要配置为任意领域专家

### Agent Profile 匹配（示例）

执行智能体领取任务时，根据任务标签自动匹配对应的 Agent Profile：

| 任务标签 | 匹配 Agent |
|---------|----------|
| `frontend`, `ui`, `react`, `vue` | frontend_dev |
| `backend`, `api`, `database` | backend_dev |
| `design`, `ux` | designer |
| `test`, `qa` | tester |
| `devops`, `deploy`, `docker` | devops |
| `docs`, `documentation` | doc_monitor |

> **注意**: 上表为示例配置，实际项目中应在 `.eket/config.yml` 中定义项目特定的角色匹配规则。

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

---

## Agent 启动流程

```
1. 实例启动
   │
   ├─ 检查 Master 标记 → 判断项目是否已初始化
   ├─ 检查三仓库状态 → confluence/jira/code_repo
   │
   ▼
2. 决定模式
   │
   ├─ Master 标记不存在 → Master 模式 (项目初始化)
   │                     - 创建三仓库目录
   │                     - 设置 Master 标记
   │                     - 初始化 main 分支
   │
   └─ Master 标记存在 → Slaver 模式 (任务执行)
                       - 创建 worktree 同步状态
                       - 读取项目背景
                       - 领取/执行任务
   │
   ▼
3. 执行任务
   │
   ├─ Master: 需求分析 → 任务拆解 → 创建 tickets
   └─ Slaver: 领取任务 → 开发 → 测试 → 提交 PR
```

### Master 模式 vs Slaver 模式

| 模式 | 触发条件 | 职责 |
|------|---------|------|
| Master | Master 标记不存在 | 需求分析、任务拆解、创建 Jira tickets、代码 Review |
| Slaver | Master 标记存在 | 领取 tickets、自主规划、开发、测试、提交 PR |

### Slaver 模式：自动 vs 手动

| 方式 | 行为 | 命令 |
|------|------|------|
| **自动模式** | 根据 ticket 优先级自动领取并执行 | `/eket-start -a` |
| **手动模式** | 列出任务，由用户选择角色后承接 | `/eket-start` |

**配置说明**:
- 启动时通过 `-a` 参数启用自动模式
- 或在 `.eket/state/instance_config.yml` 中设置 `auto_mode: true/false`
- 启动后可通过 `/eket-role <role>` 命令手动设置角色类型

**自动模式流程**:
```
1. 同步三仓库状态 (通过 worktree)
       ↓
2. 分析 Jira tickets 优先级
       ↓
3. 初始化 Profile (根据任务类型匹配角色)
       ↓
4. 领取最高优先级任务
       ↓
5. 更新任务状态为 in_progress
       ↓
6. 自主规划 → 开发 → 测试 → 迭代
       ↓
7. 提交 PR 到 testing 分支
       ↓
8. 请求 Master 审核
```

**手动模式流程**:
```
1. 同步三仓库状态 (通过 worktree)
       ↓
2. 分析项目背景和当前状态
       ↓
3. 整理 Ticket 列表并显示
       ↓
4. 给出处理建议并等待用户选择任务或指定角色
       ↓
5. 根据用户指示领取任务并执行
```

**角色配置**:
```yaml
# .eket/state/instance_config.yml
role: "slaver"
agent_type: "${YOUR_ROLE}"  # 根据项目需要定义，如 frontend_dev, business_analyst, data_scientist 等
auto_mode: true             # true=自动模式，false=手动模式
```

---

## Ticket 状态机

### 核心状态（所有任务通用）

```
backlog → analysis → approved → design → ready → [执行状态] → review → done
                                                  │
                                                  ▼
                              dev/test/review (软件研发)
                              dry_run/verification/production (部署运维)
                              security_setting/attack_simulation/remediation (安全审查)
                              data_collection/model_training/model_validation (数据分析)
                              drafting/editing/publishing (内容创作)
```

| 状态 | 说明 | 负责智能体 |
|------|------|----------|
| `backlog` | 新建任务，等待分析 | - |
| `analysis` | 需求分析中 | 需求分析师 |
| `approved` | 需求已批准，等待设计 | - |
| `design` | 技术设计中 | 技术经理 |
| `ready` | 准备就绪，等待承接 | - |
| `in_progress` | 任务执行中 | Slaver |
| `analysis_review` | 分析报告审查中 | Master |
| `[执行状态]` | 根据任务类型定制 | 执行智能体 |
| `review` | Review 中 | 技术经理 |
| `done` | 任务完成 | - |

> **注意**: 执行状态在 `.eket/config.yml` 中按任务类型配置，详见 template/SYSTEM-SETTINGS.md 第 6.3 节。

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

---

## Skills 体系

SKILL 是独立、可配置、可复用的能力单元。主要分类：

| 分类 | 路径 | 示例 Skills |
|------|------|------------|
| 需求分析 | `skills/requirements/` | user_interview, requirement_decomposition, acceptance_criteria_definition |
| 技术设计 | `skills/design/` | architecture_design, api_design, database_design |
| 开发实现 | `skills/development/` | frontend_development, backend_development |
| 测试验证 | `skills/testing/` | unit_test, e2e_test, integration_test |
| 运维部署 | `skills/devops/` | docker_build, kubernetes_deploy, ci_cd_setup |
| 文档 | `skills/documentation/` | api_documentation, user_guide, technical_doc |
| ${CUSTOM_CATEGORY} | `skills/${CUSTOM_PATH}/` | ${CUSTOM_SKILL_1}, ${CUSTOM_SKILL_2} |

> **注意**: 项目可在 `skills/` 目录中创建自定义 Skill 分类，详见 template/SYSTEM-SETTINGS.md 第 10 节。

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

**版本**: 0.6.0
**最后更新**: 2026-03-24
**维护者**: EKET Framework Team
