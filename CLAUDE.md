# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# EKET - AI 智能体协作框架

**版本**: 0.8.0
**最后更新**: 2026-03-26

## 变更说明 (v0.8.0) - Phase 5/6 完成

### Phase 5 高级功能增强

#### Phase 5.1 - Web UI 监控面板 ✅
- **新增文件**: `web/index.html`, `web/styles.css`, `web/app.js`, `node/src/api/web-server.ts`
- **功能**: 实时系统状态监控、Instance 状态列表、任务优先级展示、统计面板
- **启动命令**: `eket-cli web:dashboard --port 3000`

#### Phase 5.2 - 智能任务推荐 ✅
- **新增文件**: `node/src/commands/recommend.ts`, `node/src/core/recommender.ts`
- **功能**: 基于技能/负载/历史表现的三维度推荐
- **命令**: `eket-cli recommend --type task` / `eket-cli recommend --type instance`

#### Phase 5.3 - 任务依赖分析 ✅
- **新增文件**: `node/src/commands/dependency-analyze.ts`, `node/src/core/dependency-analyzer.ts`
- **功能**: 依赖图构建、循环依赖检测、关键路径分析、Mermaid 可视化
- **命令**:
  - `eket-cli dependency:analyze` - 基础分析
  - `eket-cli dependency:analyze --mermaid` - Mermaid 图表
  - `eket-cli dependency:analyze --check-cycles` - 循环检测
  - `eket-cli dependency:analyze --critical-path` - 关键路径

### Phase 6 多实例协同机制

#### Phase 6.1 - 多 Instance 协同 ✅
- **新增文件**:
  - `node/src/core/communication-protocol.ts` - Instance 间通信协议
  - `node/src/core/workflow-engine.ts` - 工作流引擎
  - `node/src/core/conflict-resolver.ts` - 冲突解决机制
  - `node/src/core/knowledge-base.ts` - 知识库系统

- **功能**:
  - 通信协议：支持 dependency_notify、knowledge_share、handover_request 等消息类型
  - 工作流引擎：预定义 Dependency Collaboration 和 Task Handover 工作流
  - 冲突解决：支持任务/资源/优先级三种冲突，提供 First Claim Wins/Role Priority 等策略
  - 知识库：支持 artifact/pattern/decision/lesson/api/config 六种知识类型

#### Phase 6.2 - 异常告警和通知 ✅
- **新增文件**: `node/src/core/alerting.ts`, `node/src/commands/alerts.ts`
- **功能**:
  - 四级告警：info/warning/error/critical
  - 多渠道通知：Slack、钉钉、Email、Webhook
  - 预定义规则：Instance 离线、任务阻塞、关键路径延误、系统降级
- **命令**:
  - `eket-cli alerts:status` - 查看告警状态
  - `eket-cli alerts:acknowledge <alertId>` - 确认告警
  - `eket-cli alerts:resolve <alertId>` - 解决告警

### 新增 CLI 命令

| 命令 | 功能 | 文件 |
|------|------|------|
| `web:dashboard` | 启动 Web 监控面板 | `api/web-server.ts` |
| `recommend` | 智能任务推荐 | `commands/recommend.ts` |
| `dependency:analyze` | 依赖分析 | `commands/dependency-analyze.ts` |
| `alerts:status` | 告警状态 | `commands/alerts.ts` |
| `alerts:acknowledge` | 确认告警 | `commands/alerts.ts` |
| `alerts:resolve` | 解决告警 | `commands/alerts.ts` |

### 类型增强

- **新增错误码** (`EketErrorCode`): 40+ 错误码，覆盖所有模块
- **统一错误处理**: 使用 `EketErrorClass` 替代对象字面量
- **类型安全**: 修复 ESM 兼容性，统一使用 `.js` 扩展名

### 文件清单

**核心模块** (12 个):
- `communication-protocol.ts` - 通信协议
- `workflow-engine.ts` - 工作流引擎
- `conflict-resolver.ts` - 冲突解决
- `knowledge-base.ts` - 知识库
- `recommender.ts` - 推荐系统
- `dependency-analyzer.ts` - 依赖分析
- `alerting.ts` - 告警系统
- `lock-manager.ts` - 资源锁管理
- `history-tracker.ts` - 历史追踪
- `instance-registry.ts` - Instance 注册
- `message-queue.ts` - 消息队列
- `redis-client.ts` / `sqlite-client.ts` - 数据持久化

**命令模块** (7 个):
- `recommend.ts` - 推荐命令
- `dependency-analyze.ts` - 依赖分析命令
- `alerts.ts` - 告警命令
- `claim.ts` / `claim-helpers.ts` - 任务领取
- `submit-pr.ts` - PR 提交
- `start-instance.ts` - Instance 启动
- `team-status.ts` / `set-role.ts` - 状态管理

**Web 前端** (3 个):
- `web/index.html` - Dashboard HTML
- `web/styles.css` - 样式
- `web/app.js` - 前端逻辑

---

## 变更说明 (v0.7.3)

### Phase 5.1 - Web UI 监控面板

- **新增 Web Dashboard**: 实时监控系统状态、Instance 状态、任务进度
  - 原生 HTML/CSS/JavaScript 实现，零构建依赖
  - 自动刷新（每 5 秒轮询）
  - 响应式设计，支持移动端

- **新增文件**:
  - `web/index.html` - 主页面
  - `web/styles.css` - 样式表
  - `web/app.js` - 前端逻辑
  - `node/src/api/web-server.ts` - Web 服务器和 API 端点
  - `scripts/start-web-dashboard.sh` - 启动脚本

- **API 端点**:
  - `GET /api/dashboard` - 获取完整仪表盘数据
  - `GET /api/status` - 获取系统状态
  - `GET /api/instances` - 获取所有 Instance
  - `GET /api/tasks` - 获取任务列表
  - `GET /api/stats` - 获取统计数据

- **新增类型** (`node/src/types/index.ts`):
  - `DashboardSystemStatus` - 系统状态
  - `DashboardInstance` - Instance 信息
  - `DashboardTask` - 任务信息
  - `DashboardStats` - 统计数据
  - `DashboardData` - 完整仪表盘数据

### 使用方法

```bash
# 启动 Web Dashboard
./scripts/start-web-dashboard.sh

# 或使用 CLI 命令
node dist/index.js web:dashboard --port 3000 --host localhost

# 访问地址
http://localhost:3000
```

### 功能特性

- **Instance 状态面板**: 显示所有 Instance 列表、状态指示器、控制器类型、角色和技能
- **任务进度面板**: 进行中的任务、任务分配情况
- **系统状态面板**: 降级模式指示（Level 1-5）、Redis/DB 连接状态、消息队列状态
- **统计数据面板**: 总 Instances、活跃/空闲/离线数量、任务统计、成功率

---

## 变更说明 (v0.7.2)

### 代码质量提升

- **类型安全**: 修复 ESM 兼容性，统一使用 `.js` 扩展名
- **错误处理**: 使用 `EketError` 统一错误类型，添加错误码
- **DRY 原则**: 创建 `yaml-parser.ts` 共享工具，消除重复代码
- **防御式编程**: 添加 null 检查，配置对象防御性拷贝
- **不可变性**: `EketError` 属性改为 `readonly`

### 新增工具

- `node/src/utils/yaml-parser.ts` - YAML 解析共享工具
- `node/src/utils/execFileNoThrow.ts` - 类型守卫函数

### 改进模块

- `core/redis-client.ts` - ESM 兼容，防御性配置拷贝
- `core/file-queue-manager.ts` - 改进错误处理和时间戳处理
- `commands/submit-pr.ts` - 移除重复函数，使用共享工具

---

## 变更说明 (v0.7.1)

### Phase 3 完整实现

- **PR 提交命令**: 支持 GitHub/GitLab/Gitee 平台
  - 自动分支检测和目标分支推断
  - API Token 认证和错误处理
  - Reviewers 添加和自动合并支持

- **三仓库克隆增强**: 从 `.eket/config/config.yml` 读取配置
  - 自动 YAML 解析和平台检测
  - 改进的错误提示和输出

- **文件队列持久化**:
  - 消息去重机制（`processed.json`）
  - 过期清理（`maxAge: 24h`）
  - 自动归档（`archiveAfter: 1h`）
  - 定期清理和统计功能

---

# 系统诊断
./lib/adapters/hybrid-adapter.sh doctor
```

### 升级指南

详见 [docs/v0.7-upgrade-guide.md](docs/v0.7-upgrade-guide.md)

---

## 变更说明 (v0.6.2)

### PR 审查机制增强

- **领域专家评审**: 架构/安全/性能/代码质量 4 个维度
- **Roadmap 对齐检查**: 确保实现与项目规划一致
- **综合审查报告**: 自动生成结构化评审报告
- **智能决策推荐**: 基于审查结果推荐批准/修改/拒绝

### 新增脚本

- `scripts/expert-review.sh`: 专家评审脚本
- `scripts/roadmap-alignment-check.sh`: Roadmap 对齐检查

---

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
./scripts/enable-advanced.sh        # 启用 Node.js 高级功能
```

### Node.js 命令 (通过混合适配器)
```bash
./lib/adapters/hybrid-adapter.sh redis:check          # 检查 Redis 连接
./lib/adapters/hybrid-adapter.sh redis:list-slavers   # 列出活跃 Slaver
./lib/adapters/hybrid-adapter.sh sqlite:check         # 检查 SQLite 数据库
./lib/adapters/hybrid-adapter.sh sqlite:list-retros   # 列出 Retrospective
./lib/adapters/hybrid-adapter.sh sqlite:search "<kw>" # 搜索 Retrospective
./lib/adapters/hybrid-adapter.sh sqlite:report        # 生成统计报告
./lib/adapters/hybrid-adapter.sh doctor               # 系统诊断
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
│   ├── 05-reference/         # 参考资料
│   ├── plans/                # 设计文档
│   └── v0.7-upgrade-guide.md # v0.7 升级指南
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
│   ├── recommend-tasks.sh    # 任务推荐
│   └── enable-advanced.sh    # 启用 Node.js 高级功能
├── lib/
│   └── adapters/
│       └── hybrid-adapter.sh # 混合适配器
├── node/                     # Node.js 项目
│   ├── src/                  # TypeScript 源码
│   ├── core/                 # 核心模块
│   ├── types/                # 类型定义
│   └── dist/                 # 编译产物
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

**版本**: 0.7.0
**最后更新**: 2026-03-24
**维护者**: EKET Framework Team
