# EKET 框架变更总结

**版本**: 0.2.0
**日期**: 2026-03-20
**类型**: 架构变更文档

---

## 变更背景

根据用户设想的实际使用流程，对 EKET 框架进行了全面重构，主要变更包括：

1. **三 Git 仓库架构** - confluence/code_repo/jira 独立仓库 + submodule 集成
2. **Agent 配置文件系统** - YAML 定义的智能体配置
3. **Skills 体系** - 可复用、可组合的能力单元
4. **分支策略** - main/testing/feature 三分支模型
5. **任务模式** - 任务设定模式 / 任务承接模式

---

## 变更前对比

### 任务初始化流程

| 步骤 | 变更前 | 变更后 |
|------|-------|-------|
| 1 | 运行 `init-project.sh` | 运行 `init-project.sh` |
| 2 | 运行 `/eket-init` | 运行 `/eket-init` (增强版) |
| 3 | 检查本地项目结构 | 检查三仓库配置 |
| 4 | 显示快速开始指南 | 选择任务模式 (setup/execution) |
| 5 | ❌ 无三仓库初始化 | ✅ 运行 `init-three-repos.sh` |
| 6 | ❌ 无远程同步 | ✅ 配置 remote + submodule |

### 任务承接和处理流程

| 步骤 | 变更前 | 变更后 |
|------|-------|-------|
| 1 | 检查 `inbox/human_input.md` | 检查任务模式 |
| 2 | 需求分析师创建任务到 `tasks/` | **设定模式**: 协调智能体创建 Epic/Tasks 到 `jira/` |
| 3 | 执行智能体领取任务 | **承接模式**: 执行智能体从 `jira/tickets/` 领取任务 |
| 4 | 创建分支开发 | 创建分支开发 (feature/* → testing → main) |
| 5 | 创建 PR | 创建 PR + 更新 Jira 状态 |
| 6 | ❌ 无后续任务创建 | ✅ 在 `jira/` 中创建后续任务 |

### 任务管理

| 功能 | 变更前 | 变更后 |
|------|-------|-------|
| 任务状态追踪 | 本地 `tasks/*.md` | `jira/tickets/` + `jira/state/` |
| 依赖关系 | ❌ 无 | ✅ `jira/state/dependencies.json` |
| 文档管理 | ❌ 无 | ✅ `confluence/projects/` |
| 背景知识 | ❌ 无 | ✅ `confluence/memory/` |
| Agent 动态加载 | ❌ 无 | ✅ 根据任务类型加载对应 Agent |

---

## 新增文件

### 文档类

| 文件 | 用途 |
|------|------|
| `docs/THREE_REPO_ARCHITECTURE.md` | 三 Git 仓库架构说明 |
| `docs/SKILLS_SYSTEM.md` | Skills 体系说明 |
| `docs/AGENTS_CONFIG.md` | Agent 配置文件说明 |
| `docs/BRANCH_STRATEGY.md` | 分支策略和任务模式 |
| `docs/CHANGELOG_v0.2.md` | 本变更文档 |

### 脚本类

| 文件 | 用途 |
|------|------|
| `scripts/init-three-repos.sh` | 三仓库初始化脚本 |
| `template/.claude/commands/eket-init.sh` | 增强的初始化向导 |
| `template/.claude/commands/eket-mode.sh` | 模式切换命令 |

### 配置类

| 文件 | 用途 |
|------|------|
| `template/.gitmodules` | Submodule 配置模板 |
| `agents/coordinators/*.yml` | 协调智能体配置 |
| `agents/executors/*.yml` | 执行智能体配置 |
| `agents/executors/executor_registry.yml` | 执行者注册表 |
| `skills/**.yml` | 技能定义 |

---

## 核心概念变更

### 1. 仓库架构

**变更前**:
```
project/
├── tasks/
├── inbox/
├── outbox/
└── .eket/
```

**变更后**:
```
code_repo/ (主仓库)
├── .gitmodules
├── confluence/ → confluence 仓库 (submodule)
├── jira/ → jira 仓库 (submodule)
├── src/
└── tests/

confluence/ (独立仓库)
├── projects/{project}/
│   ├── requirements/
│   ├── architecture/
│   └── design/
└── memory/

jira/ (独立仓库)
├── epics/
├── tickets/
│   ├── feature/
│   ├── bugfix/
│   └── task/
├── index/
└── state/
```

### 2. 任务模式

**新增概念**:

| 模式 | 职责 | 负责智能体 |
|------|------|----------|
| **任务设定模式** | 需求分析、任务拆解、架构设计 | 协调智能体 |
| **任务承接模式** | 任务领取、代码开发、PR 提交 | 执行智能体 |

**模式切换**:
```bash
/eket-mode setup      # 切换到设定模式
/eket-mode execution  # 切换到承接模式
```

### 3. 分支策略

**变更前**:
```
main ← feature/*
```

**变更后**:
```
main ← testing ← feature/*
```

**分支流转**:
```
1. 创建分支：git checkout -b feature/FEAT-001-login
2. 开发完成：git push -u origin feature/FEAT-001-login
3. 创建 PR: feature → testing
4. 测试通过：合并到 testing
5. 创建 PR: testing → main
6. 合并到 main，更新 Jira 状态
```

### 4. Agent 配置

**新增**:
```yaml
# agents/coordinators/requirement_analyst.yml
name: requirement_analyst
type: coordinator
responsibilities: [...]
skills:
  - requirements/user_interview
  - requirements/requirement_decomposition
decision_policy:
  auto_decide: true
  escalation_rules: [...]
lifecycle:
  mode: persistent
  wakeup_triggers: [...]
```

### 5. Skills 体系

**新增技能分类**:
- `requirements/` - 需求分析类
- `design/` - 技术设计类
- `development/` - 开发实现类
- `testing/` - 测试验证类
- `devops/` - 运维部署类
- `documentation/` - 文档类

**技能示例**:
```yaml
# skills/requirements/requirement_decomposition.yml
name: requirement_decomposition
inputs:
  - raw_requirement: string
outputs:
  - feature_list: array
steps:
  - analyze_requirement
  - identify_features
  - define_dependencies
```

---

## 使用流程变更

### 首次启动流程

**变更前**:
```bash
1. init-project.sh my-project /path/to/project
2. cd /path/to/project
3. claude
4. /eket-init
5. 编辑 inbox/human_input.md
```

**变更后**:
```bash
1. init-project.sh my-project /path/to/project
2. cd /path/to/project
3. claude
4. /eket-init
5. 运行 init-three-repos.sh (可选：配置三仓库)
6. 编辑 inbox/human_input.md
7. 选择任务模式 (setup/execution)
```

### 需求分析流程

**变更前**:
```
1. 人类编辑 inbox/human_input.md
2. 需求分析师创建 tasks/task-XXX.md
3. 创建状态报告等待确认
```

**变更后**:
```
1. 人类编辑 inbox/human_input.md
2. 需求分析师 (设定模式):
   - 创建 jira/epics/EPIC-XXX/
   - 创建 jira/tickets/feature/FEAT-XXX.md
   - 创建 confluence/projects/requirements/
3. 技术经理:
   - 创建 confluence/projects/architecture/
4. 创建状态报告等待确认
5. 人类确认后，切换到承接模式
```

### 任务执行流程

**变更前**:
```
1. 执行智能体领取 tasks/task-XXX.md
2. 创建分支 feature/task-XXX
3. 开发、提交
4. 创建 PR
```

**变更后**:
```
1. 执行智能体轮询 jira/tickets/feature/FEAT-XXX.md
2. 分析任务、依赖、Confluence 背景知识
3. 领取任务 (更新 Jira 状态)
4. 创建分支 feature/FEAT-XXX-desc
5. 开发、提交
6. 创建 PR → testing
7. 测试通过后 PR → main
8. 合并到 main，更新 Jira 状态为 done
```

---

## 命令参考变更

### 新增命令

| 命令 | 功能 |
|------|------|
| `/eket-mode [setup\|execution]` | 切换任务模式 |
| `/path/to/scripts/init-three-repos.sh` | 初始化三仓库 |

### 增强命令

| 命令 | 变更内容 |
|------|---------|
| `/eket-init` | 增加三仓库检查、模式选择、模式状态保存 |

---

## 配置变更

### .gitmodules (新增)

```ini
[submodule "confluence"]
    path = confluence
    url = https://github.com/{org}/{project}-confluence.git
    branch = main

[submodule "jira"]
    path = jira
    url = https://github.com/{org}/{project}-jira.git
    branch = main
```

### .eket/config.yml (更新)

```yaml
# 新增
project:
  name: "{{PROJECT_NAME}}"
  root: "{{PROJECT_ROOT}}"

# 新增
git:
  main_branch: "main"
  testing_branch: "testing"
  branch_prefix: "feature/"

# 新增
mode:
  default: "setup"  # setup 或 execution
```

---

## 迁移指南

### 从 v0.1 迁移到 v0.2

1. **备份现有数据**:
   ```bash
   cp -r tasks/ tasks.backup/
   cp -r inbox/ inbox.backup/
   ```

2. **更新文档结构**:
   ```bash
   # 复制新文档
   cp eket/docs/*.md docs/
   ```

3. **初始化三仓库** (可选):
   ```bash
   ./scripts/init-three-repos.sh my-project my-org github
   ```

4. **更新 CLAUDE.md**:
   ```bash
   cp eket/template/CLAUDE.md CLAUDE.md
   ```

5. **运行新的初始化**:
   ```bash
   /eket-init
   ```

---

## 后续计划

### P0 - 核心功能

- [ ] 实现 Agent 动态加载器
- [ ] 实现 Skills 调用机制
- [ ] 实现 Jira 状态机

### P1 - 增强功能

- [ ] 远程同步脚本 (`scripts/sync-remote.sh`)
- [ ] 任务依赖可视化工具
- [ ] Confluence 文档模板生成

### P2 - 优化功能

- [ ] 模式自动切换逻辑
- [ ] Agent 能力匹配优化
- [ ] Skills 性能优化

---

**维护者**: EKET Framework Team
