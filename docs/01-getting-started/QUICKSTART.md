# EKET 快速开始指南

**版本**: 0.7.2
**最后更新**: 2026-03-25

---

## 5 分钟快速开始

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git >= 2.30.0

### 步骤 1: 克隆项目

```bash
git clone <eket-repo-url> my-project
cd my-project
```

### 步骤 2: 安装依赖

```bash
cd node && npm install && cd ..
./scripts/enable-advanced.sh
```

### 步骤 3: 运行初始化向导

```bash
node node/dist/index.js init
```

### 步骤 4: 初始化三仓库

```bash
./scripts/init-three-repos.sh
```

### 步骤 5: 启动 Agent

```bash
# 查看帮助
/eket-help

# 启动实例
/eket-start

# 或启用自动模式
/eket-start -a
```

---

## 核心命令速查

### Node.js CLI (v0.7 新增)

| 命令 | 功能 |
|------|------|
| `node node/dist/index.js check` | 检查模块可用性 |
| `node node/dist/index.js doctor` | 系统诊断 |
| `node node/dist/index.js redis:check` | 检查 Redis |
| `node node/dist/index.js sqlite:check` | 检查 SQLite |
| `node node/dist/index.js init` | 初始化向导 |
| `node node/dist/index.js claim [id]` | 领取任务 |
| `node node/dist/index.js submit-pr` | 提交 PR |
| `node node/dist/index.js heartbeat:start <id>` | 启动心跳 |

### Claude Code 命令

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/eket-init` | 初始化向导 | 首次启动 |
| `/eket-start` | 启动实例 | 每次会话开始 |
| `/eket-start -a` | 自动模式启动 | 自动领取任务 |
| `/eket-status` | 查看状态 | 查看任务列表 |
| `/eket-claim <id>` | 领取任务 | 开始处理任务 |
| `/eket-review <id>` | 请求 Review | 完成开发后 |
| `/eket-help` | 显示帮助 | 需要帮助时 |

---

## 模式说明

### 任务设定模式 (Task Setup Mode)

**触发条件**: 三仓库目录不存在或不完整

**负责智能体**: 协调智能体小组
- 需求分析师
- 技术经理
- 项目经理

**工作内容**:
1. 读取 `inbox/human_input.md` 中的需求
2. 分析需求并拆解为 Epic 和功能任务
3. 创建 Confluence 文档（需求/架构/设计）
4. 创建 Jira 任务票
5. 设定任务优先级和依赖关系

---

### 任务承接模式 (Task Execution Mode)

**触发条件**: 三仓库目录都存在

**负责智能体**: 执行智能体
- 前端开发、后端开发、设计师、测试员、运维

**两种运行方式**:

| 方式 | 行为 | 命令 |
|------|------|------|
| 自动模式 | 自动领取最高优先级任务 | `/eket-start -a` |
| 手动模式 | 显示 Top 3 推荐任务 | `/eket-start` |

---

## 目录结构速览

```
my-project/
├── .claude/commands/          # Claude Code 命令
├── confluence/                # 文档仓库 (submodule)
├── jira/                      # 任务仓库 (submodule)
├── code_repo/                 # 代码仓库
├── inbox/                     # 输入
│   └── human_input.md         # 人类需求输入
└── .eket/state/               # 运行状态
```

---

## 任务状态机

```
backlog → analysis → approved → ready → in_progress → review → done
```

---

## Agent Profile 匹配

| 任务标签 | 匹配 Agent |
|---------|----------|
| `frontend`, `ui`, `react`, `vue` | frontend_dev |
| `backend`, `api`, `database` | backend_dev |
| `design`, `ux` | designer |
| `test`, `qa` | tester |
| `devops`, `deploy`, `docker` | devops |
| `docs`, `documentation` | doc_monitor |

---

## 常见问题

### Q: 如何切换模式？

```bash
/eket-mode setup       # 切换到设定模式
/eket-mode execution   # 切换到承接模式
```

### Q: 自动模式和手动模式有什么区别？

- **自动模式**: 系统自动计算优先级并领取最高优先级的任务
- **手动模式**: 系统推荐 Top 3 任务，用户手动选择

### Q: 如何查看当前模式？

```bash
cat .eket/state/instance_mode.yml
```

### Q: 任务领取后如何开始工作？

1. 读取 Confluence 背景知识
2. 读取 Jira 任务详情
3. 创建 Git 分支
4. 开始开发

### Q: 如何提交完成的工作？

```bash
# 提交代码
git add .
git commit -m "feat: xxx"
git push -u origin feature/<task-id>

# 请求 Review
/eket-review <task-id>
```

---

## 下一步

- 阅读 [INSTANCE_INITIALIZATION.md](docs/INSTANCE_INITIALIZATION.md) 了解初始化流程
- 阅读 [AGENTS_CONFIG.md](docs/AGENTS_CONFIG.md) 了解 Agent 配置
- 阅读 [SKILLS_SYSTEM.md](docs/SKILLS_SYSTEM.md) 了解 Skills 系统
- 阅读 [BRANCH_STRATEGY.md](docs/BRANCH_STRATEGY.md) 了解分支策略

---

**维护者**: EKET Framework Team
