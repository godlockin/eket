# EKET Template - 项目初始化模板

> 使用此模板快速初始化一个新的 AI 智能体协作项目

## 使用方法

### 方法 1: 复制 Template 目录

```bash
# 1. 复制 template 目录到你的新项目
cp -r eket/template /path/to/your/new-project

# 2. 进入新项目
cd /path/to/your/new-project

# 3. 运行初始化
./init-eket.sh your-project-name
```

### 方法 2: 使用初始化脚本

```bash
# 从 eket 目录运行
cd /path/to/your/new-project
/path/to/eket/scripts/init-project.sh your-project-name
```

### 方法 3: 手动配置

```bash
# 1. 创建目录
mkdir -p .eket/state .eket/memory inbox/human_feedback outbox/review_requests tasks

# 2. 创建 CLAUDE.md
# 复制 eket/template/CLAUDE.md 到你的项目根目录

# 3. 创建配置文件
# 复制 eket/template/.eket/config.yml 到 .eket/config.yml

# 4. 创建输入模板
# 复制 eket/template/inbox/human_input.md 到 inbox/human_input.md
```

## Template 结构

```
template/
├── CLAUDE.md                    # Claude Code 配置（核心）
├── README.md                    # 项目说明
├── .eket/
│   └── config.yml               # EKET 配置
├── inbox/
│   ├── human_input.md           # 人类输入模板
│   └── human_feedback/          # Review 反馈目录
├── outbox/
│   └── review_requests/         # Review 请求目录
└── tasks/                       # 任务目录
```

## 配置说明

### .eket/config.yml

```yaml
# 运行模式
mode: "claude_code"  # claude_code 或 standalone

# 任务配置
tasks:
  auto_claim: true       # 自动领取任务
  max_concurrent: 3      # 最大并发任务数
  timeout_minutes: 120   # 任务超时

# Git 配置
git:
  main_branch: "main"
  branch_prefix: "feature/"
  commit_style: "conventional"
  auto_push: true
  auto_create_pr: true
```

### CLAUDE.md

这是 Claude Code 的核心配置文件，定义了：
- 智能体的角色和职责
- 工作流程
- 可用命令
- 决策规则
- 输出规范

## 快速开始

初始化完成后：

1. **编辑 `inbox/human_input.md`**，描述你的需求

2. **启动 Claude Code**，它会自动读取 CLAUDE.md 并作为智能体工作

3. **查看输出**：
   - `outbox/review_requests/` - Review 请求
   - `tasks/` - 创建的任务
   - Git 分支 - 代码变更

4. **提供反馈**：
   - 在 `inbox/human_feedback/` 创建反馈文件

## 与 Claude Code 集成

### 在项目中启动 Claude Code

```bash
# 进入项目目录
cd your-project

# 启动 Claude Code
claude
```

Claude 会读取 `CLAUDE.md` 并作为 EKET 智能体工作。

### 可用命令

| 命令 | 说明 |
|------|------|
| `/eket-status` | 查看状态 |
| `/eket-task <desc>` | 创建任务 |
| `/eket-review` | 请求 Review |
| `/eket-claim <id>` | 领取任务 |

## 示例

### 示例：创建一个 Todo 页面

1. 编辑 `inbox/human_input.md`:

```markdown
---
timestamp: "2026-03-18T15:00:00+08:00"
priority: "normal"
---

# 需求描述

## 我想要

创建一个 React Todo 列表页面

## 验收标准

- [ ] 可以添加待办事项
- [ ] 可以标记为完成
- [ ] 可以删除事项
```

2. 启动 Claude Code:

```bash
claude
```

3. 等待处理完成，检查 `outbox/review_requests/`

4. 提供反馈并完成任务

---

**EKET Template v0.1.0**
