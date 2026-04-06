# Slaver 自动执行模式使用指南

**版本**: v2.0.0
**最后更新**: 2026-04-06

---

## 1. 概述

Slaver 自动执行模式允许 EKET 框架在初始化时配置为 Slaver 角色，并自动执行以下完整流程：

1. 查看 Jira tickets 并按重要性/优先级排序
2. 选择一个 ticket 并修改状态
3. 创建分支进行开发
4. 设计测试（TDD）
5. 完成开发
6. 修改和迭代完善
7. 提交 PR 并通知 Master Review

---

## 2. 初始化配置

### 2.1 运行初始化脚本

```bash
./scripts/init-project.sh <项目名称> <项目路径>
```

### 2.2 配置流程

初始化脚本会引导你完成以下配置：

#### 步骤 1: 选择实例角色

```
请选择实例角色:
  1) Master - 协调实例 (负责任务分析和 Review)
  2) Slaver - 执行实例 (负责领取和执行任务)

选择 [1/2]，默认 2: 2
```

#### 步骤 2: 选择 Slaver 专家角色

```
选择 Slaver 专家角色:
  1) frontend_dev - 前端开发 (React/Vue/TypeScript)
  2) backend_dev - 后端开发 (Node.js/Python/Go)
  3) fullstack - 全栈开发
  4) tester - 测试工程师
  5) devops - 运维工程师

选择 [1-5]，默认 1: 1  # 前端开发
```

#### 步骤 3: 启用自动执行

```
是否启用自动执行？[y/N]: y
```

---

## 3. 自动执行流程

### 3.1 启动 Slaver

```bash
# 进入项目目录
cd <项目路径>

# 启动 Slaver（自动模式）
/eket-start -a
```

### 3.2 自动执行步骤

脚本会自动执行以下步骤：

```
┌──────────────────────────────────────────────────────────────┐
│  Slaver 自动执行流程                                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. fetch_tickets        - 获取 Jira tickets                 │
│  2. sort_by_priority     - 按优先级排序                       │
│  3. select_ticket        - 选择最高优先级 ticket              │
│  4. update_status        - 更新状态为 in_progress            │
│  5. create_worktree      - 创建 worktree/分支                │
│  6. design_tests         - 设计测试 (TDD)                    │
│  7. implement            - 实现功能                          │
│  8. test_iterate         - 测试/迭代/完善                     │
│  9. submit_pr            - 提交 PR                           │
│  10. wait_review         - 等待 Master Review                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 配置文件

### 4.1 实例配置文件

位置：`.eket/state/instance_config.yml`

```yaml
# 实例角色
role: "slaver"

# Slaver 角色类型
agent_type: "frontend_dev"

# 自动模式
auto_mode: true

# 实例状态
status: "initialized"

# 工作区配置
workspace:
  confluence_initialized: true
  jira_initialized: true
  code_repo_initialized: true

# Slaver 自动执行配置
slaver_auto_exec:
  enabled: true
  role: "frontend_dev"
  workflow:
    - "fetch_tickets"
    - "sort_by_priority"
    - "select_ticket"
    - "update_status"
    - "create_worktree"
    - "design_tests"
    - "implement"
    - "test_iterate"
    - "submit_pr"
    - "wait_review"
```

### 4.2 Agent Profile 配置

位置：`.eket/state/profiles/frontend_dev.yml`

```yaml
# frontend_dev 专家角色配置

role: "frontend_dev"
skills:
  - "requirements_analysis"
  - "technical_design"
  - "react_development"
  - "typescript"
  - "tailwindcss"
  - "unit_testing"
  - "e2e_testing"
```

---

## 5. 手动模式

如果不想使用自动执行模式，可以选择手动模式：

### 5.1 禁用自动执行

初始化时选择 `N`，或编辑配置文件：

```yaml
auto_mode: false
```

### 5.2 手动命令

```bash
# 启动 Slaver
/eket-start

# 查看任务列表
/eket-status

# 领取任务
/eket-claim <ticket-id>

# 提交 PR
/eket-submit-pr
```

---

## 6. 完整示例

### 6.1 初始化新项目

```bash
# 初始化项目，配置为 Slaver 自动执行模式
./scripts/init-project.sh "my-project" "/path/to/my-project"

# 配置交互:
# - 选择角色：2 (Slaver)
# - 选择专家类型：1 (frontend_dev)
# - 启用自动执行：y
```

### 6.2 启动 Slaver

```bash
cd /path/to/my-project

# 启动 Slaver（自动模式）
/eket-start -a
```

### 6.3 输出示例

```
========================================
Slaver 自动执行
========================================

实例配置:
  角色：slaver
  专家类型：frontend_dev
  自动模式：true

## 步骤 1: 获取 Jira tickets 并排序

待处理 Tickets (按优先级排序):
----------------------------------------
  FEAT-001 - 优先级：High - 标签：feature, frontend
  FEAT-002 - 优先级：Medium - 标签：feature, ui
----------------------------------------

选择 Ticket: FEAT-001
  优先级：High
  文件：jira/tickets/feature/FEAT-001.md

## 步骤 2: 更新 Ticket 状态
✓ 状态已更新：ready → in_progress

## 步骤 3: 创建 Worktree 和分支
✓ 分支已创建：feature/FEAT-001-user-login

## 步骤 4: 加载 Agent Profile
✓ Profile 已加载：frontend_dev

Skills:
  - requirements_analysis
  - technical_design
  - react_development
  - typescript
  - unit_testing
  - e2e_testing

========================================
Slaver 自动执行准备完成
========================================

请运行以下命令启动 Claude Code 进行开发:
  claude
```

---

## 7. 故障排查

### Q1: 没有 ready 状态的 tickets

**解决方法**: 等待 Master 创建任务或手动创建 ticket

```bash
# 查看 tickets 状态
ls jira/tickets/feature/

# 手动创建 ticket（如需要）
```

### Q2: 自动模式未启用

**解决方法**: 编辑配置文件

```bash
vim .eket/state/instance_config.yml
# 设置 auto_mode: true
```

### Q3: Profile 文件不存在

**解决方法**: 重新运行初始化或手动创建

```bash
mkdir -p .eket/state/profiles
# 创建对应的 profile 文件
```

---

## 8. 最佳实践

1. **专注单一任务**: 一次只处理一个 ticket，完成后再领取下一个
2. **TDD 开发**: 先编写测试，再实现功能
3. **及时提交 PR**: 完成后立即提交 PR，避免阻塞
4. **状态记录**: 每次状态变更都要记录在 ticket 中
5. **定期心跳**: 定期更新任务状态，避免超时重置

---

## 9. PR 提交和 Master 通知

### 9.1 自动创建 PR 信息

当 Slaver 完成开发并提交 PR 时，`/eket-submit-pr` 脚本会自动：

1. **创建 PR 描述文件** 到 `outbox/review_requests/` 目录
2. **发送 Review 请求消息** 到 `shared/message_queue/inbox/`
3. **更新 Ticket 状态** 为 `review`
4. **更新分配给字段** 为 `null`，等待 Master 审核

### 9.2 PR 文件格式

```markdown
# PR 请求：FEAT-001

**提交者**: slaver
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

### 9.3 Master Review 请求消息

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

### 9.4 Master 审核流程

Master 收到 Review 请求后：

1. 读取 PR 描述文件
2. 检查代码变更
3. 运行测试验证
4. 提供审核意见（批准/需要修改）
5. 合并到 main 分支（如批准）

---

**维护者**: EKET Framework Team
**版本**: v2.0.0
