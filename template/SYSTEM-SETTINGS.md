# ${PROJECT_NAME} 系统设定文档

> **说明**: 本文档是 EKET 框架新项目的系统设定模板。请根据实际项目情况替换所有 `${VARIABLE}` 占位符，并删改不适用的章节。

**版本**: 0.6.2
**创建时间**: ${CREATE_DATE}
**项目**: ${PROJECT_NAME}
**维护者**: ${MAINTAINER}

---

## 1. 项目概述

### 1.1 项目简介

${PROJECT_NAME} 是一个基于 EKET Agent Framework 的 AI 驱动项目。

**项目愿景**:
> ${填写项目愿景，例如：通过 AI 技术解决 XX 问题，为用户提供 XX 价值}

**核心功能**:
- ${功能 1}
- ${功能 2}
- ${功能 3}

### 1.2 EKET 框架集成

本项目采用 EKET Agent Framework 进行 AI 驱动的协作开发：

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

---

## 2. 项目结构

### 2.1 三仓库架构

本项目采用 EKET "三合一"项目结构：

```
${PROJECT_NAME}/                      # 统一项目目录
├── .git/                         # 主仓库 Git 元数据
├── .gitmodules                   # Submodule 配置（如使用）
│
├── confluence/                   # 文档仓库
│   ├── .git/                     # 独立 Git 仓库
│   ├── memory/                   # 共享记忆
│   │   ├── best-practices/       # 最佳实践
│   │   └── lessons-learned/      # 经验总结
│   ├── projects/                 # 项目文档
│   │   └── ${PROJECT_NAME}/      # 当前项目
│   │       ├── requirements/     # 需求文档
│   │       ├── design/           # 设计文档（含分析报告）
│   │       └── meetings/         # 会议记录
│   └── templates/                # 文档模板
│
├── jira/                         # 任务仓库
│   ├── .git/                     # 独立 Git 仓库
│   ├── epics/                    # Epic 文档
│   ├── tickets/                  # 任务票
│   │   ├── feature/              # 功能票
│   │   ├── task/                 # 任务票
│   │   └── bugfix/               # 缺陷票
│   └── state/                    # 任务状态
│
├── code_repo/                    # 代码仓库
│   ├── .git/                     # 独立 Git 仓库
│   ├── src/                      # 源代码
│   │   ├── ${MODULE1}/          # 模块 1
│   │   ├── ${MODULE2}/          # 模块 2
│   │   └── utils/               # 工具函数
│   ├── tests/                    # 测试代码
│   │   ├── unit/                 # 单元测试
│   │   ├── integration/          # 集成测试
│   │   └── e2e/                  # E2E 测试
│   ├── configs/                  # 配置文件
│   └── deployments/              # 部署配置
│
├── .claude/                      # Claude Code 配置
│   └── commands/                 # 自定义命令
│       ├── eket-start.sh         # 启动实例
│       ├── eket-claim.sh         # 领取任务
│       ├── eket-submit-pr.sh     # 提交 PR
│       ├── eket-review-pr.sh     # 审核 PR
│       ├── eket-merge-pr.sh      # 合并 PR
│       └── eket-help.sh          # 帮助
│
├── .eket/                        # EKET 运行时数据
│   ├── state/                    # 状态文件
│   │   ├── instance_config.yml   # 实例配置
│   │   ├── current_worktree.yml  # 当前 Worktree
│   │   └── slavers/              # Slaver 注册信息
│   ├── memory/                   # 长期记忆
│   │   ├── long_term/            # 长期记忆文件
│   │   └── docs/                 # 文档记忆
│   ├── logs/                     # 日志文件
│   └── worktrees/                # Worktree 存储
│
├── shared/                       # 共享数据
│   ├── message_queue/            # 消息队列
│   │   ├── inbox/                # 接收消息
│   │   └── outbox/               # 发送消息
│   └── .state/                   # 共享状态
│
├── scripts/                      # 工具脚本
│   ├── init-project.sh           # 项目初始化
│   ├── start.sh                  # 启动实例
│   ├── slaver-worktree.sh        # Worktree 管理
│   ├── master-monitor.sh         # Master 监控
│   ├── slaver-heartbeat.sh       # 心跳上报
│   └── task-time-tracker.sh      # 任务计时
│
└── skills/                       # Skills 库
    ├── requirements/             # 需求分析 Skills
    ├── design/                   # 技术设计 Skills
    ├── development/              # 开发实现 Skills
    ├── testing/                  # 测试验证 Skills
    ├── devops/                   # 运维部署 Skills
    └── documentation/            # 文档 Skills
```

### 2.2 三仓库 Git 结构

| 仓库 | 主分支 | 功能分支 | 用途 |
|------|--------|----------|------|
| confluence | main | docs/* | 文档协作和版本管理 |
| jira | main | task/* | 任务状态追踪 |
| code_repo | main | feature/*, bugfix/*, analysis/* | 代码开发、分析报告 |

---

## 3. 环境和依赖

### 3.1 系统要求

> **说明**: 本节列出项目所需的技术栈和工具，请根据项目实际情况定制。

#### 基础环境

| 组件 | 版本要求 | 用途 |
|------|----------|------|
| ${RUNTIME_NAME} | >= ${RUNTIME_VERSION} | 运行时环境（如：Python 3.11+, Node.js 20+, Java 17+） |
| Git | >= 2.30 | 版本控制 |
| ${PACKAGE_MANAGER} | >= ${PM_VERSION} | 包管理（如：pip, npm, maven） |
| Docker | >= 24.0 (可选) | 容器化部署 |

#### 技术栈

**核心依赖** (`code_repo/${DEPENDENCY_FILE}`):

```${DEPENDENCY_FORMAT}
# ${DEPENDENCY_SECTION_1}
${DEPENDENCY_1}>=${VERSION_1}
${DEPENDENCY_2}>=${VERSION_2}

# ${DEPENDENCY_SECTION_2}
${DEPENDENCY_3}>=${VERSION_3}
```

> **提示**: 请根据项目实际使用的技术栈替换以上内容。例如：
> - Python 项目：使用 `pyproject.toml` 或 `requirements.txt`
> - Node.js 项目：使用 `package.json`
> - Java 项目：使用 `pom.xml` 或 `build.gradle`
> - Go 项目：使用 `go.mod`

#### 安装命令

```bash
# 安装依赖
cd code_repo
${INSTALL_COMMAND}

# 验证安装
${VERIFY_COMMAND}
```

### 3.2 环境变量

```bash
# LLM/AI 配置
LLM_PROVIDER=${LLM_PROVIDER}
LLM_API_KEY=${YOUR_API_KEY}
LLM_MODEL=${YOUR_MODEL}

# 项目配置
EKET_PROJECT_ROOT=${PROJECT_ROOT_PATH}
EKET_LOG_LEVEL=INFO

# ${PROJECT_NAME} 特定配置
${CUSTOM_ENV_1}=${VALUE_1}
${CUSTOM_ENV_2}=${VALUE_2}
```

> **提示**: 请根据项目实际需要配置的环境变量替换以上内容。

---

## 4. Master 节点配置

- **长期存活**: Master 进程持续运行，监控系统状态
- **自动监控**: 定期检查 Slaver 心跳和任务状态
- **PR 审核**: 响应 Slaver 的 PR 审核请求（包括代码 PR 和分析报告 PR）
- **任务调度**: 维护和更新任务优先级
- **专家协调**: 协调不同领域专家 Agent 的协作

### 4.1 Master 职责

Master 节点是系统的核心协调者，负责：
- 项目初始化和 Master 标记创建
- Slaver 注册和心跳监控
- 分析报告审查和决策
- PR 审核和合并
- 任务优先级维护
- 超时 Slaver 和 Worktree 清理

### 4.2 Master 启动命令

```bash
# 在项目根目录启动
/eket-start
```

### 4.3 Master 监控服务

| 参数 | 值 | 说明 |
|------|-----|------|
| `HEARTBEAT_INTERVAL` | 30s | 心跳检查间隔 |
| `HEARTBEAT_TIMEOUT` | 300s | 心跳超时阈值 |
| 清理策略 | 自动 | 超时 Slaver 自动清理 |

### 4.4 Master 标记

Master 节点在以下位置创建标记文件：

```bash
confluence/.eket_master_marker
jira/.eket_master_marker
code_repo/.eket_master_marker
```

---

## 5. Slaver 节点配置

### 5.1 专家 Agent 角色

> **说明**: Slaver 是项目所需的专业 Agent，不一定是技术研发类 Agent。请根据项目需要定义团队角色。

#### 角色定义模板

| 角色 | 职责 | 处理任务标签 | 专业领域 |
|------|------|-------------|----------|
| `${ROLE_1}` | ${职责描述 1} | `${TAGS_1}` | ${EXPERTISE_1} |
| `${ROLE_2}` | ${职责描述 2} | `${TAGS_2}` | ${EXPERTISE_2} |
| `${ROLE_3}` | ${职责描述 3} | `${TAGS_3}` | ${EXPERTISE_3} |

#### 示例角色（仅供参考）

**研发团队示例**:
| 角色 | 职责 | 处理任务标签 |
|------|------|-------------|
| `frontend_dev` | 前端开发 | `frontend`, `ui`, `react`, `vue` |
| `backend_dev` | 后端开发 | `backend`, `api`, `database` |
| `qa_engineer` | 测试工程师 | `test`, `qa` |

**业务团队示例**:
| 角色 | 职责 | 处理任务标签 |
|------|------|-------------|
| `business_analyst` | 业务分析 | `requirement`, `analysis`, `process` |
| `compliance_expert` | 合规审查 | `compliance`, `legal`, `gdpr` |
| `ux_designer` | 用户体验设计 | `ux`, `design`, `accessibility` |

**运维团队示例**:
| 角色 | 职责 | 处理任务标签 |
|------|------|-------------|
| `devops_engineer` | 运维部署 | `devops`, `deploy`, `docker`, `k8s` |
| `security_expert` | 安全审查 | `security`, `vulnerability`, `pentest` |
| `sre` | 站点可靠性 | `reliability`, `monitoring`, `incident` |

**其他领域示例**:
| 角色 | 职责 | 处理任务标签 |
|------|------|-------------|
| `data_scientist` | 数据分析 | `data`, `ml`, `analytics` |
| `content_creator` | 内容创作 | `content`, `copywriting`, `translation` |
| `product_owner` | 产品负责人 | `product`, `priority`, `roadmap` |

### 5.2 Agent 配置

在 `.eket/state/instance_config.yml` 中配置 Agent 角色：

```yaml
role: "slaver"
agent_type: "${YOUR_ROLE}"  # 根据项目需要定义
status: "ready"
auto_mode: false

# 专家 Agent 特定配置
expert_config:
  domain: "${EXPERTISE_DOMAIN}"
  skills:
    - ${SKILL_1}
    - ${SKILL_2}
  tools:
    - ${TOOL_1}
    - ${TOOL_2}
```

### 5.3 Slaver 启动命令

```bash
# 手动模式启动
/eket-start

# 自动模式启动（自动领取任务）
/eket-start -a

# 指定角色启动
/eket-start --agent-type ${ROLE_NAME}
```

### 5.4 Slaver 工作流程 (v0.6.1)

#### 通用流程

```
1. 实例启动 → 检查 Master 标记 → 同步三仓库状态
   │
   ▼
2. 领取任务 → 更新任务状态为 in_progress
   │
   ▼
3. 创建 Worktree → 独立工作环境
   │
   ▼
4. 分析与任务拆解 → 需求分析、方案设计、任务拆解、风险评估
   │
   ▼
5. 提交分析报告 PR → analysis/{task-id} 分支
   │
   ▼
6. Master 审查分析报告 → 通过/驳回/需升级
   │
   ▼
7. 执行任务 → ${EXECUTION_STEP_1} → ${EXECUTION_STEP_2} → 迭代优化
   │
   ▼
8. 提交成果 PR → feature/{task-id} 分支
   │
   ▼
9. Master 审核 → 批准并合并
   │
   ▼
10. 清理 Worktree → 领取新任务
```

#### 不同任务类型的工作流程

**软件研发任务**:
```
分析报告通过 → dev (编写代码) → test (编写测试) → review (代码审查) → 合并
```

**部署运维任务**:
```
分析报告通过 → dry_run (预演) → verification (验证) → production (部署) → 合并
```

**安全审查任务**:
```
分析报告通过 → security_setting (配置检查) → attack_simulation (攻击模拟) → remediation (修复验证) → 合并
```

**数据分析任务**:
```
分析报告通过 → data_collection (数据收集) → model_training (模型训练) → model_validation (模型验证) → 合并
```

**内容创作任务**:
```
分析报告通过 → drafting (草稿) → editing (编辑) → publishing (发布) → 合并
```

> **提示**: 请根据项目需要定义不同类型任务的工作流程。

### 5.5 分析报告 Review 机制 (v0.6.1 新增)

Slaver 在领取任务后，需要先进行分析并提交**分析报告**，等待 Master 审查通过后方可继续执行。

#### 分析报告内容模板

```markdown
# 任务分析报告：{TASK_ID}

**Slaver**: {slaver_id}
**分析时间**: {timestamp}
**预计工时**: {hours} 小时

## 1. 需求理解
{简述任务的核心目标和验收标准}

## 2. 技术方案
{描述实现方案}

## 3. 影响面分析
| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| {module_a} | 高/中/低 | {具体影响} |

## 4. 影响范围
- 新增文件：{文件列表}
- 修改文件：{文件列表}

## 5. 任务拆解
| 子任务 | 预估工时 | 优先级 | 验收标准 |
|--------|----------|--------|----------|
| {子任务 1} | 2h | P0 | {标准} |

## 6. 风险评估
| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| {风险描述} | 高/中/低 | 高/中/低 | {缓解方案} |
```

#### 审查维度

| 维度 | 评估要点 | 审查标准 |
|------|----------|----------|
| **复杂程度** | 技术难度、实现复杂度 | 低 (<4h) / 中 (4-16h) / 高 (>16h) |
| **影响面** | 涉及的模块数量 | 单模块 / 跨模块 / 系统级 |
| **影响范围** | 变更规模 | 小 (<5 文件) / 中 (5-20 文件) / 大 (>20 文件) |
| **风险等级** | 潜在风险和不确定性 | 低 / 中 / 高 |
| **任务拆解** | 子任务划分是否合理 | 粒度是否适合执行 |

#### 审查决策

| 决策 | 条件 | 后续行动 |
|------|------|----------|
| **通过** | 复杂度适中、影响可控、风险可接受 | Slaver 继续执行 |
| **驳回** | 分析不充分、方案有缺陷 | Slaver 重新分析 |
| **需升级** | 高复杂度、系统级影响、高风险 | Slaver 升级方案或拆分为多个任务 |

---

## 6. 任务状态机

### 6.1 状态流转图

```
backlog ──→ analysis ──→ approved ──→ design ──→ ready
                                                      │
                                                      ▼
done ←── review ←── [执行状态] ←─────────────────────┘
                     ↑
                     │
              analysis_review (分析报告审查)
```

**注意**: `[执行状态]` 根据任务类型配置而定，例如：
- 软件研发：`dev → test → review`
- 部署运维：`dry_run → verification → production`
- 安全审查：`security_setting → attack_simulation → remediation`
- 数据分析：`data_collection → model_training → model_validation`
- 内容创作：`drafting → editing → publishing`

详见 6.3 节任务类型配置。

### 6.2 状态说明

#### 核心状态（必需）

以下状态是所有任务的标准状态机：

| 状态 | 说明 | 负责人 | 前置条件 |
|------|------|--------|----------|
| `backlog` | 新建任务，等待分析 | - | - |
| `analysis` | 需求分析中 | 产品经理/分析专家 | - |
| `approved` | 需求已批准 | 项目经理 | analysis 完成 |
| `design` | 技术设计中 | 架构师/设计专家 | approved |
| `ready` | 准备就绪，等待承接 | - | design 完成 |
| `in_progress` | 任务执行中 | Slaver | 任务已领取 |
| `analysis_review` | 分析报告审查中 | Master | Slaver 提交分析报告 |
| `review` | Review 中 | 技术经理/审核专家 | 执行完成 |
| `done` | 任务完成 | - | review 通过 |

#### 任务元数据字段

每个任务 ticket 包含以下元数据字段：

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| **重要性** | enum | 业务重要性级别 | `critical`, `high`, `medium`, `low` |
| **优先级** | enum | 处理优先级 | `P0`, `P1`, `P2`, `P3` |
| **背景** | text | 任务背景和业务价值 | 描述文字 |
| **依赖关系** | object | 任务依赖配置 | 见下方 YAML 示例 |
| **标签** | array | 任务分类标签 | `frontend`, `backend`, `api` |
| **Epic** | string | 所属 Epic ID | `EPIC-20260327` |
| **技能要求** | array | 完成需要的技能 | `react`, `typescript`, `nodejs` |
| **预估工时** | string | 预计完成时间 | `2h`, `4h`, `1d` |

#### 依赖关系 YAML 格式

```yaml
# 依赖关系配置
dependencies:
  blocks: []        # 本任务阻塞的任务列表
  blocked_by: []    # 本任务依赖的任务列表
  related: []       # 相关任务，可并行开发
  external: []      # 外部依赖（如：等待 API 文档）
```

#### 依赖关系说明

| 类型 | 说明 | 示例 |
|------|------|------|
| `blocks` | 本任务完成后，其他任务才能开始 | FEAT-001 完成后 FEAT-002 才能开始 |
| `blocked_by` | 本任务需要等待其他任务完成 | FEAT-002 需要等待 FEAT-001 完成 |
| `related` | 相关任务，可以并行开发 | FEAT-003 和 FEAT-004 可以同时进行 |
| `external` | 外部依赖，非本项目的任务 | 等待第三方 API 文档、等待设计稿 |

#### 执行状态（根据任务类型定制）

`analysis_review` 通过后，任务进入执行阶段。根据任务类型不同，执行状态也不同：

**软件研发任务**:
| 状态 | 说明 | 负责人 | 前置条件 |
|------|------|--------|----------|
| `dev` | 开发中 | 开发工程师 | 分析报告审查通过 |
| `test` | 测试中 | 测试工程师 | dev 完成 |
| `review` | 代码审查中 | 技术经理 | test 完成 |

**部署/运维任务**:
| 状态 | 说明 | 负责人 | 前置条件 |
|------|------|--------|----------|
| `dry_run` | 预演/模拟执行中 | 运维工程师 | 分析报告审查通过 |
| `verification` | 验证中 | 运维工程师 | dry_run 完成 |
| `production` | 生产环境部署中 | 运维工程师 | verification 通过 |

**安全审查任务**:
| 状态 | 说明 | 负责人 | 前置条件 |
|------|------|--------|----------|
| `security_setting` | 安全配置检查中 | 安全专家 | 分析报告审查通过 |
| `attack_simulation` | 攻击模拟中 | 安全专家 | security_setting 完成 |
| `remediation` | 修复验证中 | 安全专家 | attack_simulation 完成 |

**数据分析任务**:
| 状态 | 说明 | 负责人 | 前置条件 |
|------|------|--------|----------|
| `data_collection` | 数据收集中 | 数据分析师 | 分析报告审查通过 |
| `model_training` | 模型训练中 | 数据科学家 | data_collection 完成 |
| `model_validation` | 模型验证中 | 数据科学家 | model_training 完成 |

**内容创作任务**:
| 状态 | 说明 | 负责人 | 前置条件 |
|------|------|--------|----------|
| `drafting` | 草稿撰写中 | 内容创作者 | 分析报告审查通过 |
| `editing` | 编辑审核中 | 内容创作者 | drafting 完成 |
| `publishing` | 发布准备中 | 内容创作者 | editing 完成 |

> **提示**: 请根据项目实际需要定义执行状态。在 `.eket/config.yml` 中配置任务类型与执行状态的映射关系。

### 6.3 任务类型配置

在 `.eket/config.yml` 中配置任务类型和执行状态：

```yaml
# 任务类型定义
task_types:
  - name: "development"
    display_name: "软件研发"
    execution_states: ["dev", "test", "review"]
    assigned_roles: ["frontend_dev", "backend_dev", "qa_engineer"]

  - name: "deployment"
    display_name: "部署运维"
    execution_states: ["dry_run", "verification", "production"]
    assigned_roles: ["devops_engineer", "sre"]

  - name: "security"
    display_name: "安全审查"
    execution_states: ["security_setting", "attack_simulation", "remediation"]
    assigned_roles: ["security_expert"]

  - name: "analysis"
    display_name: "数据分析"
    execution_states: ["data_collection", "model_training", "model_validation"]
    assigned_roles: ["data_scientist", "data_analyst"]

  - name: "content"
    display_name: "内容创作"
    execution_states: ["drafting", "editing", "publishing"]
    assigned_roles: ["content_creator", "copywriter"]
```

---

## 7. 工作流配置

### 7.1 分支策略

#### 分支命名规范

| 类型 | 命名格式 | 示例 |
|------|----------|------|
| 分析报告 | `analysis/{task-id}` | `analysis/FEAT-001` |
| 功能开发 | `feature/{task-id}-{short-desc}` | `feature/FEAT-001-user-auth` |
| 缺陷修复 | `bugfix/{task-id}-{short-desc}` | `bugfix/BUG-001-login-error` |
| 紧急修复 | `hotfix/{task-id}-{short-desc}` | `hotfix/HOTFIX-001-security` |
| 文档更新 | `docs/{task-id}-{short-desc}` | `docs/DOC-001-api-guide` |
| ${CUSTOM_BRANCH_TYPE} | `${CUSTOM_BRANCH_FORMAT}` | `${CUSTOM_BRANCH_EXAMPLE}` |

> **提示**: 请根据项目需要添加自定义分支类型。

#### 分支流转

```
┌─────────────────────────────────────────────────────────┐
│                    main (生产)                           │
│    ↑                                                    │
│    │ PR + Merge                                         │
│    │                                                    │
│ ┌──┴────────┐                                           │
│ │  testing  │ (测试环境)                                 │
│ │    ↑                                                  │
│ │    │ PR + 测试通过                                     │
│ │    │                                                  │
│ ┌──┴────────┐                                           │
│ │ feature/* │ (开发分支)                                 │
│ │ analysis/*│ (分析报告分支)                             │
│ └───────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

### 7.2 通信协议

#### 消息队列

**目录结构**: `shared/message_queue/`

| 目录 | 用途 | 清理策略 |
|------|------|----------|
| `inbox/` | 接收消息 | 已读后删除 |
| `outbox/` | 发送消息 | 发送后删除 |

#### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `pr_review_request` | Slaver → Master | 请求 PR 审核（代码） |
| `analysis_review_request` | Slaver → Master | 请求分析报告审核 |
| `pr_approved` | Master → Slaver | PR 审核通过 |
| `pr_rejected` | Master → Slaver | PR 审核驳回 |
| `task_assigned` | Master → Slaver | 任务分配 |
| `task_completed` | Slaver → Master | 任务完成通知 |
| `${CUSTOM_MSG_TYPE}` | ${FROM} → ${TO} | ${CUSTOM_MSG_DESC} |

> **提示**: 请根据项目需要添加自定义消息类型。

---

## 7.5 PR 提交和 Master 通知流程

### 7.5.1 Slaver 提交 PR

当 Slaver 完成开发任务后，运行 `/eket-submit-pr` 命令提交 PR：

```bash
/eket-submit-pr -t <ticket-id> -b <branch-name>
```

**脚本自动执行以下步骤**：

1. **检查分支状态** - 验证工作区干净、分支存在
2. **提交代码变更** - 使用 Conventional Commits 格式提交
3. **推送到远程仓库** - 将 feature 分支推送到 origin
4. **创建 PR 描述文件** - 生成详细的 PR 描述文档
5. **发送 Review 请求消息** - 通知 Master 审核
6. **更新 Ticket 状态** - 将任务状态改为 `review`

### 7.5.2 PR 描述文件格式

PR 描述文件创建在 `outbox/review_requests/` 目录：

```markdown
# PR 请求：FEAT-001

**提交者**: slaver_frontend_dev
**分支**: feature/FEAT-001-user-login
**目标分支**: testing
**创建时间**: 2026-03-27T10:30:00+08:00

---

## 关联 Ticket

- FEAT-001

## 变更摘要

 src/components/Login.tsx       | 150 +++++++++++
 src/hooks/useAuth.ts           |  80 ++++++
 tests/Login.test.tsx           | 120 +++++++++

## 变更详情

<!-- 详细描述变更内容 -->

## 验收标准

- [ ] 代码符合项目规范
- [ ] 测试覆盖关键逻辑
- [ ] 文档已更新（如需要）

## 测试情况

- [ ] 单元测试通过
- [ ] 手动测试完成（如需要）

## 注意事项

<!-- 列出需要 Reviewer 特别注意的内容 -->

---

## 状态：pending_review

**等待 Master 审核**
```

### 7.5.3 Review 请求消息格式

消息发送到 `shared/message_queue/inbox/`：

```json
{
  "id": "msg_20260327_103000",
  "timestamp": "2026-03-27T10:30:00+08:00",
  "from": "slaver_frontend_dev_103000",
  "to": "master",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "branch": "feature/FEAT-001-user-login",
    "target": "testing",
    "pr_file": "outbox/review_requests/pr_FEAT-001_20260327_103000.md",
    "summary": "请求审核 FEAT-001 的实现"
  }
}
```

### 7.5.4 Master 审核流程

Master 收到 Review 请求后：

1. **读取 PR 描述文件** - 了解变更内容和测试情况
2. **检查代码变更** - Review 代码质量和规范符合性
3. **运行测试验证** - 执行单元测试和集成测试
4. **提供审核意见**：
   - **批准** - 合并到 `testing` 分支，等待进一步验证
   - **需要修改** - 返回 Slaver 进行修改
5. **更新 Ticket 状态** - 标记为 `approved` 或 `rejected`

### 7.5.5 状态流转

```
Slaver 提交 PR:
  dev/test → review → (Master 审核) → approved | rejected

Master 审核:
  review → approved  (合并到 testing)
  review → rejected  (返回 Slaver 修改)
```

---

## 8. 心跳机制

### 8.1 心跳配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 上报间隔 | 30s | Slaver 每 30 秒上报心跳 |
| 超时阈值 | 300s | 5 分钟无心跳视为离线 |
| 重试次数 | 3 | 上报失败重试 3 次 |

> **提示**: 可根据项目需要调整心跳参数。

---

## 9. 命令参考

### 9.1 核心命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导 |
| `/eket-start` | 启动实例 |
| `/eket-start -a` | 自动模式启动 |
| `/eket-status` | 查看状态 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-submit-pr` | 提交 PR |
| `/eket-review-pr <id>` | 审核 PR |
| `/eket-merge-pr <id>` | 合并 PR |
| `/eket-help` | 显示帮助 |
| `${CUSTOM_COMMAND}` | ${CUSTOM_COMMAND_DESC} |

> **提示**: 可在 `.claude/commands/` 目录中添加自定义命令。

---

## 10. Skills 体系

### 10.1 Skill 分类

| 分类 | 路径 | 示例 Skills |
|------|------|------------|
| 需求分析 | `skills/requirements/` | `user_interview`, `requirement_decomposition` |
| 技术设计 | `skills/design/` | `architecture_design`, `api_design` |
| 开发实现 | `skills/development/` | `frontend_development`, `backend_development` |
| 测试验证 | `skills/testing/` | `unit_test`, `e2e_test` |
| 运维部署 | `skills/devops/` | `docker_build`, `kubernetes_deploy` |
| 文档 | `skills/documentation/` | `api_documentation`, `user_guide` |
| ${CUSTOM_SKILL_CATEGORY} | `skills/${CUSTOM_SKILL_PATH}/` | `${CUSTOM_SKILL_1}`, `${CUSTOM_SKILL_2}` |

> **提示**: 请根据项目需要添加自定义 Skill 分类。Skills 是 EKET 框架的核心能力单元，可在 `skills/` 目录中创建新的 Skill。

### 10.2 Skill 调用

```bash
# 在 Claude Code 中使用
/skill <skill-name> [args]

# 示例
/skill test-driven-development
/skill systematic-debugging
/skill frontend-design
```

---

## 11. 配置参考

### 11.1 实例配置文件

`.eket/state/instance_config.yml`:

```yaml
role: "slaver"              # master | slaver
agent_type: "${YOUR_ROLE}"  # 根据项目需要定义
status: "ready"             # ready | busy | offline
auto_mode: false            # 自动领取任务

workspace:
  confluence_initialized: true
  jira_initialized: true
  code_repo_initialized: true

# 专家 Agent 特定配置（可选）
expert_config:
  domain: "${EXPERTISE_DOMAIN}"
  skills:
    - ${SKILL_1}
    - ${SKILL_2}
```

### 11.2 Worktree 状态文件

`.eket/state/current_worktree.yml`:

```yaml
task_id: ${TASK_ID}
slaver_id: ${SLAVER_ID}
worktree_path: .eket/worktrees/${WORKTREE_NAME}
claimed_at: ${CLAIMED_AT}
status: active
```

### 11.3 环境变量

详见 **3.2 环境变量** 节。

---

## 12. 故障排查

### 12.1 常见问题

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| Master 检测失败 | 标记文件丢失 | 重新运行 `/eket-start` 创建标记 |
| Slaver 心跳超时 | 进程卡死 | 检查日志，重启 Slaver |
| Worktree 创建失败 | 分支冲突 | 清理旧 worktree，重试 |
| PR 合并冲突 | 代码冲突 | 手动解决冲突后重新提交 |
| 分析报告被驳回 | 分析不充分 | 重新分析并提交 |
| ${CUSTOM_ISSUE} | ${CUSTOM_CAUSE} | ${CUSTOM_SOLUTION} |

### 12.2 日志位置

| 类型 | 位置 |
|------|------|
| Master 日志 | `.eket/logs/master.log` |
| Slaver 日志 | `.eket/logs/slaver_*.log` |
| 心跳日志 | `.eket/logs/heartbeat.log` |
| ${CUSTOM_LOG} | `${CUSTOM_LOG_PATH}` |

---

## 13. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 0.1.0 | ${CREATE_DATE} | 初始版本，基于 EKET Framework ${EKET_VERSION} |
| ${CUSTOM_VERSION} | ${CUSTOM_DATE} | ${CUSTOM_CHANGE} |

---

**文档维护**: 请在每次系统升级后更新本文档
**最后更新**: ${UPDATE_DATE}
**文档生成**: 本文档基于 EKET Framework template/SYSTEM-SETTINGS.md 模板生成
