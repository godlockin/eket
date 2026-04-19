# EKET - 使用指南

## 概述

EKET 是一个 **AI 智能体协作框架 template**，用于快速初始化支持 Claude Code 等 AI 智能体进行任务处理的项目。

### 核心思路

1. **eket 是 template**，不是用来开发的项目本身
2. **用它初始化新项目**，让 AI 智能体在新项目中工作
3. **通过文件系统进行通信**，智能体和人类通过读写文件交互
4. **Claude Code 作为智能体运行时**，读取 CLAUDE.md 执行任务

---

## 快速开始

### 初始化一个新项目

**方法 1：使用初始化脚本（推荐）**

```bash
# 语法：./init-project.sh <project-name> [project-root]

# 在当前目录初始化
./scripts/init-project.sh my-project

# 指定项目根目录
./scripts/init-project.sh my-project /path/to/your/new-project

# 从 eket 目录运行
/path/to/eket/scripts/init-project.sh my-project /path/to/your/new-project
```

**方法 2：手动复制 template**

```bash
cp -r /path/to/eket/template/* /path/to/your/new-project/
cd /path/to/your/new-project
```

**方法 3：Git clone（推荐，如果有远程仓库）**

```bash
git clone <eket-repo-url> temp-eket
cp -r temp-eket/template/* /path/to/your/new-project/
rm -rf temp-eket
```

### 使用 Claude Code

初始化完成后，在项目目录中启动 Claude Code：

```bash
cd /path/to/your/new-project
claude
```

**可用命令**（在 Claude Code 中）：

| 命令 | 功能 |
|------|------|
| `/eket-status` | 查看智能体状态和任务列表 |
| `/eket-task [描述]` | 创建新任务 |
| `/eket-claim [task-id]` | 领取任务 |
| `/eket-review [task-id]` | 请求 Review |
| `/eket-help` | 显示帮助信息 |

**如果命令不可用**，确保：
1. `.claude/` 目录存在于项目根目录
2. `.claude/settings.json` 包含 permissions 配置
3. `.claude/commands/` 目录包含命令脚本
4. 重启 Claude Code 以加载新配置

1. **编辑 `inbox/human_input.md`**，描述你的需求

2. **启动 Claude Code**：
   ```bash
   claude
   ```

3. **等待智能体处理**，它会：
   - 读取需求
   - 创建任务
   - 编写代码
   - 提交 PR

4. **Review 并完成**：
   - 检查 `outbox/review_requests/`
   - 在 `inbox/human_feedback/` 回复

---

## 反馈机制

### 智能体状态报告

智能体每轮执行结束后，会在 `inbox/human_feedback/` 创建状态报告，包含：

- **当前阶段**：需求分析/技术方案/开发/测试
- **阶段成果**：完成的工作和产出
- **待确认问题**：需要人类决策的问题，包含选项和推荐答案
- **下一步计划**：计划继续执行的内容

### 人类回复方式

在状态报告文件的**人类反馈区**回复：

```markdown
## 人类反馈

**回复于**: YYYY-MM-DD HH:MM

### 确认状态

- [x] 确认阶段成果
- [x] 同意技术方案
- [x] 批准进入下一阶段

### 需要修改

- 问题 1: 选择方案 B，因为...

### 额外指示

- 请在继续之前先更新文档
```

### 快速回复格式

```markdown
# 反馈：<task-id>

- ✅ 确认分析结果
- ✅ 同意技术方案
- ✅ 可以继续执行

或

- ✅ 确认成果
- ❌ 问题 1 需要修改：[说明原因]
- ⏸️ 暂停，等待 [某事]
```

---

## 目录结构

初始化后的项目结构：

```
my-project/
├── CLAUDE.md                    # Claude Code 配置（智能体行为定义）
├── .eket/
│   └── config.yml               # EKET 配置
├── inbox/
│   ├── human_input.md           # 人类需求输入（你写这里）
│   └── human_feedback/          # Review 反馈（你写这里）
├── outbox/
│   └── review_requests/         # Review 请求（智能体输出）
├── tasks/                       # 任务定义（智能体输出）
└── src/                         # 你的代码
```

---

## 与智能体交互

### 方式 1：文件输入（推荐）

**你输入需求**：
```bash
# 编辑 inbox/human_input.md
vim inbox/human_input.md
```

**智能体读取并处理**，然后：
- 在 `tasks/` 创建任务
- 在 `outbox/review_requests/` 创建 Review 请求

**你回复反馈**：
```bash
# 在 inbox/human_feedback/ 创建反馈文件
vim inbox/human_feedback/FEAT-001_feedback.md
```

### 方式 2：Claude Code 对话

直接在与 Claude Code 的对话中描述需求：

```
请帮我创建一个登录页面，需要支持用户名密码登录和 OAuth。
```

Claude 会读取 CLAUDE.md 并按照 EKET 流程处理。

---

## 配置说明

### CLAUDE.md

这是最重要的文件，定义了 Claude Code 如何作为智能体工作。包括：
- 角色定义
- 工作流程
- 决策规则
- 输出规范

### .eket/config.yml

项目级别的配置：
- 运行模式（claude_code / standalone）
- 任务配置
- Git 配置
- Review 配置

### inbox/human_input.md

需求输入模板，包含：
- 需求描述
- 验收标准
- 优先级

---

## 工作流程

```
┌─────────────────┐
│  人类输入需求    │
│  inbox/human_   │
│  input.md       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  智能体分析需求  │
│  创建 tasks      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  智能体执行任务  │
│  编写代码/测试   │
│  提交 PR        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  智能体请求      │
│  Review         │
│  outbox/        │
│  review_requests│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  人类 Review     │
│  inbox/human_   │
│  feedback/      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────┐  ┌──────────┐
│ 通过  │  │ 需要修改  │
└──┬───┘  └────┬─────┘
   │           │
   ▼           ▼
完成任务    创建 revision
更新状态    任务
```

---

## 最佳实践

### 需求描述

**好的需求**：
```markdown
## 我想要

创建一个用户登录功能

## 验收标准

- [ ] 支持用户名密码登录
- [ ] 支持记住登录状态（7 天）
- [ ] 登录失败显示错误提示
- [ ] 成功后跳转到首页
```

**不好的需求**：
```
做个登录
```

### Review 反馈

**明确的反馈**：
```markdown
需要修改：
1. 登录按钮颜色改为蓝色
2. 错误提示不够明显，用红色
3. 增加"忘记密码"链接
```

**模糊的反馈**：
```
不太满意
```

---

## 高级配置

### 多项目支持

在 `.eket/config.yml` 中配置：

```yaml
project:
  name: "my-project"
  root: "/path/to/project"

# 多项目可以配置多个 root
```

### 自定义智能体行为

编辑 `CLAUDE.md`，添加自定义规则：

```markdown
## 自定义规则

- 所有代码必须有 TypeScript 类型定义
- 组件必须使用函数式写法
- 必须编写单元测试
```

### 集成 CI/CD

在 `.eket/config.yml` 中配置：

```yaml
git:
  auto_push: true
  auto_create_pr: true

review:
  auto_merge: false  # 需要人类确认
```

---

## 清理项目

如果要清空项目的所有任务和历史，重新开始：

```bash
# 清理当前目录（保留配置）
./scripts/cleanup-project.sh

# 指定项目目录
./scripts/cleanup-project.sh /path/to/your/project

# 完全清理（包括 Git 和 .claude 配置，用于重新初始化）
./scripts/cleanup-project.sh --full /path/to/your/project
```

清理操作会删除：
- `tasks/` - 所有任务
- `inbox/human_feedback/` - 所有反馈
- `outbox/review_requests/` - 所有 Review 请求
- `.eket/state/` - 运行状态
- `.eket/logs/` - 日志
- `.eket/memory/` - 记忆

**标准清理**：保留配置文件和代码（`.claude/`, `.eket/config.yml`, `CLAUDE.md` 等）

**完全清理 (`--full`)**：额外删除 `.git/`, `.gitignore`, `.claude/`，用于重新运行初始化脚本

**注意**：清理操作需要确认，且不会删除源代码文件。

---

## 故障排除

### 智能体没有响应

1. 检查 `inbox/human_input.md` 格式是否正确
2. 重新启动 Claude Code
3. 检查 `.eket/config.yml` 配置

### 任务卡住

1. 查看 `tasks/` 目录中的任务状态
2. 检查是否有文件锁冲突
3. 手动更新任务状态

### Git 冲突

1. 智能体会尝试自动解决
2. 如无法解决，会在 `inbox/` 创建帮助请求
3. 人类手动解决后继续

---

## 文件清单

### eket 目录（Template 源）

```
eket/
├── template/                    # 项目模板
│   ├── CLAUDE.md
│   ├── .eket/config.yml
│   ├── inbox/
│   └── outbox/
├── scripts/
│   ├── init-project.sh          # 初始化脚本
│   └── cleanup-project.sh       # 清理脚本
└── docs/
    └── USAGE.md                 # 本文档
```

### 初始化后的项目

```
my-project/
├── CLAUDE.md                    # ← 从 template 复制
├── .eket/config.yml             # ← 从 template 复制
├── inbox/
│   └── human_input.md           # ← 你在这里输入
├── outbox/
│   └── review_requests/         # ← 智能体在这里输出
└── tasks/                       # ← 任务列表
```

---

## 总结

**EKET 的核心价值**：
1. 📁 **标准化项目结构** - 让 AI 智能体理解项目
2. 📝 **清晰的通信协议** - 通过文件进行可靠通信
3. 🔄 **完整的工作流** - 从需求到完成的闭环
4. 🔧 **可配置的规则** - 适应不同项目需求

**开始使用**：
```bash
/path/to/eket/scripts/init-project.sh my-project
cd my-project
claude
```

---

**EKET v0.1.0** | Initialized by EKET Agent Framework
