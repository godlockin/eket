# EKET 快速开始指南

**版本**: 0.2.0

---

## 5 分钟快速上手

### 1. 使用 template 初始化新项目

```bash
# 进入 eket 框架目录
cd /path/to/eket-framework

# 初始化新项目
./scripts/init-project.sh my-project /path/to/my-project

# 进入新项目
cd /path/to/my-project
```

### 2. 初始化三仓库（可选）

```bash
# 初始化三个 Git 仓库（confluence、jira、code_repo）
./scripts/init-three-repos.sh my-project my-org github
```

### 3. 启动 Claude Code

```bash
# 启动 Claude
claude

# 运行初始化向导
/eket-init
```

### 4. 选择模式

系统会自动检测项目状态并进入对应模式：

**任务设定模式**（三仓库未初始化）：
- 在 `inbox/human_input.md` 中描述项目愿景
- 协调智能体分析需求并创建任务

**任务承接模式**（三仓库已初始化）：
```bash
# 启动实例
/eket-start

# 或启用自动模式（自动领取最高优先级任务）
/eket-start -a
```

### 5. 领取任务

```bash
# 查看推荐任务
/eket-status

# 领取任务
/eket-claim FEAT-001

# 创建分支并开发
git checkout -b feature/FEAT-001-login
```

---

## 核心命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导 |
| `/eket-start` | 启动实例 |
| `/eket-start -a` | 自动模式启动 |
| `/eket-mode setup` | 切换到设定模式 |
| `/eket-mode execution` | 切换到承接模式 |
| `/eket-status` | 查看状态 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-review <id>` | 请求 Review |
| `/eket-help` | 显示帮助 |

---

## 详细说明

更多详细内容，请阅读：

- [docs/QUICKSTART.md](docs/QUICKSTART.md) - 完整快速开始指南
- [docs/COMPLETE_FRAMEWORK_v0.2.md](docs/COMPLETE_FRAMEWORK_v0.2.md) - v0.2 完整说明
- [docs/INSTANCE_INITIALIZATION.md](docs/INSTANCE_INITIALIZATION.md) - 实例初始化流程
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) - 实现状态

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    顶层协调智能体小组                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ 需求分析师   │  技术经理    │  项目经理    │  文档监控员  │  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  执行层智能体（去中心化网络）                   │
│  ┌─────────┬─────────┬──────────┬──────────┬────────┬──────┐ │
│  │ 设计师   │ 测试员   │ 前端开发  │ 后端开发   │ 运维    │ 存储 │ │
│  └─────────┴─────────┴──────────┴──────────┴────────┴──────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 工作流程

```
1. 人类输入需求 → inbox/human_input.md
       ↓
2. 需求分析 → 拆解为 Jira tickets
       ↓
3. 执行智能体 → 轮询并领取任务
       ↓
4. 执行智能体 → 创建分支 → 开发 → 提交 PR
       ↓
5. 协调智能体 → review PR → 合并或要求修改
       ↓
6. 任务完成 → 更新 Jira 状态 → 通知相关方
```

---

**版本**: 0.2.0 | **最后更新**: 2026-03-20
