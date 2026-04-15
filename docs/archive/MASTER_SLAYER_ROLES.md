# EKET Master/Slaver 职责分工

**版本**: 0.4.0
**最后更新**: 2026-03-23

---

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                        EKET v0.4 架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Master 实例 (协调者)                     Slaver 实例 (执行者)   │
│   ┌─────────────────┐                    ┌─────────────────┐   │
│   │                 │                    │   独立 Instance   │   │
│   │  • 任务分析      │                    │   • 前端开发     │   │
│   │  • 任务拆解      │◄──── 任务分配 ───► │   • 后端开发     │   │
│   │  • 进度 Check    │                    │   • 测试员       │   │
│   │  • 代码 Review   │                    │   • 设计师       │   │
│   │  • 合并到 main   │◄──── PR 审核 ─────► │   • 运维         │   │
│   │                 │                    │                 │   │
│   │  主分支权限：✅  │                    │  主分支权限：❌  │   │
│   └─────────────────┘                    └─────────────────┘   │
│         │                                      │               │
│         └──────────────┬───────────────────────┘               │
│                        │                                       │
│                        ▼                                       │
│            ┌───────────────────────┐                          │
│            │    三仓库 + Worktree   │                          │
│            │  confluence / jira /  │                          │
│            │     code_repo         │                          │
│            └───────────────────────┘                          │
└───────────────────────────────────────────────────────────────┘
```

---

## Master 实例职责

### 核心职责

| 职责 | 说明 | 输出 |
|------|------|------|
| **任务分析** | 分析 `inbox/human_input.md` 中的需求 | 需求分析文档 |
| **任务拆解** | 将需求拆解为 Epic 和 Jira tickets | `jira/epics/`, `jira/tickets/` |
| **进度 Check** | 定时检查 Slaver 任务进度 | 进度报告 |
| **代码 Review** | 审核 Slaver 提交的 PR | PR 评论/批准 |
| **合并到主分支** | 审核通过后合并到 `main` 分支 | 合并提交 |

### 权限

- ✅ **唯一**可以操作主分支 (`main`) 的实例
- ✅ 创建/更新 Jira tickets
- ✅ 创建/更新 Confluence 文档
- ✅ 分配任务给 Slaver
- ✅ 审核和合并 PR

### Master 工作流程

```
1. 启动检测
   │
   ├─ 检查 Master 标记 → 不存在则创建
   ├─ 创建三仓库目录 → confluence/, jira/, code_repo/
   ├─ 设置 Master 标记 → .eket_master_marker
   │
   ▼
2. 需求分析
   │
   ├─ 读取 inbox/human_input.md
   ├─ 调用 requirement_analysis SKILL
   ├─ 输出需求分析文档
   │
   ▼
3. 任务拆解
   │
   ├─ 创建 Epic → jira/epics/EPIC-XXX.md
   ├─ 创建 Tickets → jira/tickets/feature/FEAT-XXX.md
   ├─ 设定优先级和依赖
   │
   ▼
4. 进度 Check (定时)
   │
   ├─ 检查 jira/state/active_tasks.json
   ├─ 读取 Slaver 状态报告
   ├─ 输出进度报告到 inbox/human_feedback/
   │
   ▼
5. 代码 Review
   │
   ├─ 接收 PR 通知 (消息队列)
   ├─ 审查代码变更
   ├─ 批准或要求修改
   │
   ▼
6. 合并到主分支
   │
   ├─ 从 testing 合并到 main
   ├─ 更新 Jira 状态为 done
   └─ 通知相关方
```

### Master 命令

| 命令 | 功能 |
|------|------|
| `/eket-start` | 启动 Master 实例 |
| `/eket-analyze` | 分析需求并拆解任务 |
| `/eket-review-pr` | 审核 Slaver 提交的 PR |
| `/eket-merge` | 合并 PR 到 main 分支 |
| `/eket-check-progress` | 检查 Slaver 任务进度 |

---

## Slaver 实例职责

### 核心职责

| 职责 | 说明 | 输出 |
|------|------|------|
| **领取任务** | 从 Jira 领取状态为 `ready` 的 tickets | 任务状态更新为 `in_progress` |
| **自主规划** | 根据任务内容制定实现计划 | 实现方案文档 |
| **开发** | 编写代码实现功能 | 源代码 |
| **测试** | 编写和执行测试 | 测试报告 |
| **迭代** | 根据测试结果修改 | 更新后的代码 |
| **提交 PR** | 提交 PR 请求 Master 审核 | PR 到 testing 分支 |

### 约束

- ❌ **不得**直接操作主分支 (`main`)
- ✅ 每个 Slaver 是独立的 instance/session
- ✅ 启动时必须创建 worktree 同步三仓库状态
- ✅ 完成开发后提交 PR 到 `testing` 分支

### Worktree 机制

每个 Slaver 实例启动时自动创建 worktree：

```bash
# Worktree 路径配置
.eket/state/worktree_paths.yml:
  confluence_path: /path/to/project/confluence
  jira_path: /path/to/project/jira
  code_repo_path: /path/to/project/code_repo
  worktree_path: .eket/worktrees/slaver_YYYYMMDD_HHMMSS
```

**目的**:
- 隔离 Master 和 Slaver 的工作区
- 避免文件锁冲突
- 支持多个 Slaver 并行工作

### Slaver 工作流程

#### 自动模式

```
1. 启动检测
   │
   ├─ 检测 Master 标记存在 → 进入 Slaver 模式
   ├─ 创建 worktree
   ├─ 同步三仓库状态
   │
   ▼
2. 初始化 Profile
   │
   ├─ 读取 Jira tickets
   ├─ 分析任务优先级
   ├─ 根据任务类型匹配角色 (frontend_dev/backend_dev/...)
   │
   ▼
3. 领取任务
   │
   ├─ 选择最高优先级任务
   ├─ 更新状态为 in_progress
   ├─ 通知 Master (消息队列)
   │
   ▼
4. 自主规划
   │
   ├─ 阅读 Confluence 背景文档
   ├─ 制定实现方案
   ├─ 创建 Git 分支 (feature/XXX)
   │
   ▼
5. 开发 → 测试 → 迭代
   │
   ├─ 编写代码
   ├─ 编写测试
   ├─ 运行测试
   └─ 修复问题
   │
   ▼
6. 提交 PR
   │
   ├─ 提交代码到 feature 分支
   ├─ 创建 PR 到 testing 分支
   ├─ 发送 Review 请求给 Master
   │
   ▼
7. 等待审核
   │
   ├─ Master 批准 → 等待合并到 main
   └─ Master 要求修改 → 返回步骤 5
```

#### 手动模式

```
1. 启动检测
   │
   ├─ 检测 Master 标记存在 → 进入 Slaver 模式
   ├─ 创建 worktree
   ├─ 同步三仓库状态
   │
   ▼
2. 分析项目状态
   │
   ├─ 读取 Confluence 文档
   ├─ 读取 Jira tickets
   ├─ 读取代码仓库
   │
   ▼
3. 整理建议
   │
   ├─ 项目背景总结
   ├─ 当前状态分析
   ├─ Ticket 列表整理
   │
   ▼
4. 等待人类指示
   │
   ├─ 显示建议给人类
   ├─ 人类选择任务
   └─ 进入自动模式流程
```

### Slaver 命令

| 命令 | 功能 |
|------|------|
| `/eket-start` | 启动 Slaver 实例 |
| `/eket-start -a` | 自动模式启动 |
| `/eket-role <role>` | 设置角色类型 |
| `/eket-claim <id>` | 领取任务 |
| `/eket-submit-pr` | 提交 PR 请求审核 |
| `/eket-status` | 查看任务状态 |

---

## 通信机制

### Master ↔ Slaver 通信

| 类型 | 方向 | 内容 | 位置 |
|------|------|------|------|
| 任务分配 | Master → Slaver | 新任务通知 | `shared/message_queue/inbox/` |
| 进度报告 | Slaver → Master | 任务进度更新 | `shared/message_queue/inbox/` |
| PR 审核请求 | Slaver → Master | PR 链接 + 说明 | `shared/message_queue/inbox/` |
| PR 审核结果 | Master → Slaver | 批准/修改意见 | `shared/message_queue/inbox/` |

### 消息格式

```json
{
  "id": "msg_20260323_001",
  "timestamp": "2026-03-23T10:30:00Z",
  "from": "slaver_frontend_dev_001",
  "to": "master",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "pr_number": 42,
    "branch": "feature/FEAT-001-login-form",
    "target": "testing",
    "summary": "实现用户登录表单组件",
    "changes": [
      "新增 LoginFrom 组件",
      "新增表单验证逻辑",
      "新增单元测试"
    ]
  }
}
```

---

## Ticket 状态流转

```
┌─────────────────────────────────────────────────────────────────┐
│                    Jira Ticket 状态机                            │
└─────────────────────────────────────────────────────────────────┘

    backlog
       │
       │ Master 创建任务
       ▼
    analysis ──────→ needs_info (需要更多信息)
       │
       │ Master 分析完成
       ▼
    approved
       │
       │ Master 设定优先级
       ▼
    ready ──┬────────────────────────────────────┐
       │    │ Slaver 领取任务                     │
       ▼    ▼                                     │
    dev    in_progress                            │
       │    │                                     │
       │    │ 开发/测试                             │
       ▼    ▼                                     │
    test ──┬──────────────────────────────────────┤
       │    │ 测试失败                             │
       │    ▼                                     │
       │  fix_bug                                 │
       │    │                                     │
       │    └─────────────────────────────────────┘
       │
       │ 测试通过
       ▼
    review ──┬────────────────────────────────────┐
       │    │ Master 审核不通过                    │
       ▼    ▼                                     │
    done  changes_requested                       │
       │    │                                     │
       │    └─────────────────────────────────────┘
       │
       │ Master 合并到 main
       ▼
    merged
```

### 状态说明

| 状态 | 负责方 | 说明 |
|------|-------|------|
| backlog | Master | 新建任务，等待分析 |
| analysis | Master | 需求分析中 |
| needs_info | Master | 需要更多信息 (等待人类) |
| approved | Master | 需求已批准，等待拆解 |
| ready | - | 准备就绪，等待 Slaver 领取 |
| in_progress | Slaver | 任务进行中 |
| dev | Slaver | 开发中 |
| test | Slaver | 测试中 |
| review | Master | 等待 Master 审核 |
| changes_requested | Slaver | 需要修改 |
| done | Master | 任务完成 |
| merged | Master | 已合并到 main |

---

## 分支策略

```
┌─────────────────────────────────────────────────────────────────┐
│                        分支策略图                                │
└─────────────────────────────────────────────────────────────────┘

main (生产分支)
  │
  │ ◄── Master 合并 (PR 审核通过后)
  │
  ▼
testing (测试分支)
  │
  │ ◄── Slaver 提交 PR
  │
  ▼
feature/* (功能分支)
  │
  │ Slaver 开发
  │
  ▼
开发提交
```

### 分支权限

| 分支 | Master | Slaver |
|------|--------|--------|
| `main` | ✅ 读/写 | ❌ 只读 |
| `testing` | ✅ 读/写 | ✅ 提交 PR |
| `feature/*` | ✅ 读 | ✅ 读/写 (自己的分支) |

---

## 快速开始

### Master 实例启动

```bash
# 在项目根目录
cd /path/to/project

# 启动 Master 实例
/eket-start

# 首次启动会自动：
# 1. 创建三仓库目录
# 2. 设置 Master 标记
# 3. 初始化 main 分支
# 4. 创建/检查 inbox/human_input.md
```

### Slaver 实例启动

```bash
# 在项目根目录 (Master 已初始化后)
cd /path/to/project

# 启动 Slaver 实例 (手动模式)
/eket-start

# 启动 Slaver 实例 (自动模式)
/eket-start -a

# 设置角色类型
/eket-role frontend_dev
```

---

**维护者**: EKET Framework Team
