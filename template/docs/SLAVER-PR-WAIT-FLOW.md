# Slaver PR 等待流程 (v2.1.0)

**版本**: v2.1.0  
**创建日期**: 2026-04-10  
**目的**: 定义 Slaver 提交 PR 后等待 Master 反馈期间的行为规范

---

## 1. PR 提交流程

### 1.1 提交 PR 前的自检

在运行 `/eket-submit-pr` 之前，Slaver 必须完成以下自检：

```
开发完成
    │
    ▼
自测通过？
    ├── 否 → 修复测试 → 重新测试
    └── 是 → 继续
            │
            ▼
代码质量检查？
    ├── 否 → 重构优化 → 重新测试
    └── 是 → 继续
            │
            ▼
文档已更新？
    ├── 否 → 补充文档 → 重新测试
    └── 是 → 继续
            │
            ▼
准备提交 PR
```

### 1.2 提交 PR 步骤

**运行命令**:
```bash
/eket-submit-pr
```

**脚本自动执行**：
1. ✅ 检查当前分支是否有未提交的变更
2. ✅ 提交所有变更到远程仓库
3. ✅ 创建 PR 描述文件到 `outbox/review_requests/`
4. ✅ 更新 Ticket 状态：`in_progress` → `review`
5. ✅ 发送 Review 请求消息到消息队列
6. ✅ 记录 PR 提交时间到 Ticket

**PR 描述文件格式**:
```markdown
# PR 请求：FEAT-001

**提交者**: slaver_20260410_150000_x9y8z7w6
**分支**: slaver_20260410_150000_x9y8z7w6-FEAT-001
**目标分支**: testing
**创建时间**: 2026-04-10T17:30:00+08:00

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

- [x] 代码符合项目规范
- [x] 测试覆盖关键逻辑
- [x] 文档已更新

## 测试情况

- [x] 单元测试通过
- [x] 手动测试完成（如需要）

---

## 状态：pending_review

**等待 Master 审核**
```

---

## 2. PR 等待流程

### 2.1 等待期间的状态

提交 PR 后，Slaver 进入**等待反馈**状态：

```
PR 提交完成
    │
    ▼
等待 Master Review
    │
    ├── 状态：review
    ├── PR 文件：outbox/review_requests/pr_FEAT-001_*.md
    └── 分支：slaver_20260410_150000_x9y8z7w6-FEAT-001
```

### 2.2 等待期间的行为选择

Slaver 在等待期间有两种选择：

#### 选项 A：等待反馈（推荐用于紧急/复杂任务）

**适用场景**：
- P0/P1 紧急任务
- 架构复杂度高的任务
- 预计 Master 会快速响应的任务

**检查频率**：
| Slaver 状态 | 检查频率 | 说明 |
|------------|---------|------|
| 空闲等待 | 每 1 分钟 | 无其他任务，专注等待反馈 |
| 工作中 | 每 5 分钟 | 并行处理其他任务，间隙检查 |

**检查清单**：
- [ ] 检查 `inbox/human_feedback/` 是否有新文件
- [ ] 检查消息队列是否有 `pr_review_result` 类型消息
- [ ] 检查 Ticket 状态是否变更

**行为**：
1. 根据当前状态按频率检查 Master 反馈
2. 如果 Master 要求修改，立即响应
3. 如果 Master 批准，准备领取新任务

#### 选项 B：领取新任务（推荐用于常规任务）

**适用场景**：
- P2/P3 常规任务
- 预计 Review 周期较长的任务
- Slaver 有充足处理能力

**行为**：
1. 检查 `jira/tickets/` 中 `ready` 状态的任务
2. 领取匹配角色的新任务
3. 为新任务创建独立 worktree
4. 并行处理多个任务
5. 收到 Master 反馈时，暂停手头工作，优先处理反馈

**决策树**：
```
PR 提交完成
    │
    ▼
Master 预计响应时间？
    ├── < 30 分钟 → 选项 A：等待反馈
    └── > 30 分钟 → 选项 B：领取新任务
            │
            ▼
        领取新任务
            │
            ▼
        收到 Master 反馈？
            ├── 是，需要修改 → 暂停当前任务 → 处理反馈
            ├── 是，批准 → 继续当前任务 → 准备 merge
            └── 否 → 继续当前任务
```

---

## 3. Master 反馈处理

### 3.1 反馈类型

Master Review 后有三种可能的结果：

| 结果 | 状态变更 | Slaver 行动 |
|------|----------|------------|
| **批准** | `review` → `approved` | 准备 merge，领取新任务 |
| **需要修改** | `review` → `changes_requested` | 立即修改，重新提交 PR |
| **驳回** | `review` → `rejected` | 重新分析需求，重新开发 |

### 3.2 需要修改（changes_requested）

**Master 行动**：
1. 在 PR 描述文件中添加 Review 意见
2. 更新 Ticket 状态为 `changes_requested`
3. 发送消息到消息队列

**Slaver 行动**：
```
收到修改请求
    │
    ▼
读取 Review 意见
    │
    ▼
评估修改工作量
    ├── < 1 小时 → 立即修改 → 重新提交 PR
    └── > 1 小时 → 通知 Master → 更新优先级 → 修改 → 重新提交
```

**修改流程**：
1. 切换到 worktree：`.eket/worktrees/{instance_id}-{ticket_id}`
2. 根据 Review 意见修改代码
3. 运行测试验证
4. 更新 PR 描述文件
5. 重新提交通知

### 3.3 批准（approved）

**Master 行动**：
1. 更新 Ticket 状态为 `approved`
2. 合并代码到 `main` 分支
3. 删除 worktree 分支
4. 通知 Slaver

**Slaver 行动**：
1. 确认 Ticket 状态已更新
2. 清理本地 worktree（可选）
3. 领取新任务

---

## 4. 并发任务管理

### 4.1 多任务并行

Slaver 可以同时处理多个任务：

```
┌─────────────────────────────────────────────────────────────┐
│  Slaver 实例：slaver_20260410_150000_x9y8z7w6                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Task 1: FEAT-001                                           │
│    状态：review (等待 Master 反馈)                            │
│    分支：slaver_...-FEAT-001                                │
│    Worktree: .eket/worktrees/slaver_...-FEAT-001            │
│                                                             │
│  Task 2: FEAT-002                                           │
│    状态：in_progress (开发中)                                │
│    分支：slaver_...-FEAT-002                                │
│    Worktree: .eket/worktrees/slaver_...-FEAT-002            │
│                                                             │
│  Task 3: FIX-001                                            │
│    状态：ready (等待领取)                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 任务切换策略

```
收到 Master 反馈
    │
    ▼
是否需要修改？
    ├── 是 → 暂停当前任务 → 切换到反馈任务 worktree → 处理修改
    └── 否（批准）→ 记录 → 继续当前任务 → 准备领取新任务
```

### 4.3 并发限制

| Slaver 角色 | 最大并发任务 |
|------------|-------------|
| frontend_dev | 2-3 |
| backend_dev | 2-3 |
| fullstack | 2-3 |
| tester | 3-4 |
| devops | 2-3 |

**超过并发限制时**：
- 新任务状态设为 `blocked_by_capacity`
- 通知 Master 当前容量已满
- 完成一个任务后再领取

---

## 5. Worktree 管理

### 5.1 命名规则

```
{instance_id}-{ticket_id}
例：slaver_20260410_150000_x9y8z7w6-FEAT-001
```

### 5.2 创建时机

- **领取任务时**：`/eket-claim` 脚本自动创建
- **位置**：`.eket/worktrees/{instance_id}-{ticket_id}/`

### 5.3 清理时机

| 情况 | 清理时间 | 清理方式 |
|------|---------|---------|
| PR 批准并 merge | Master 合并后 | Master 删除分支 |
| PR 驳回 | Slaver 重新开发前 | Slaver 删除并重建 |
| 任务取消 | 收到通知后 | Slaver 删除 |

### 5.4 Worktree 同步

```bash
# 同步主仓库状态
cd .eket/worktrees/{worktree_name}
git fetch origin
git rebase origin/main
```

---

## 6. 消息队列通信

### 6.1 PR 提交通知

```json
{
  "id": "msg_20260410173000",
  "timestamp": "2026-04-10T17:30:00+08:00",
  "from": "slaver_20260410_150000_x9y8z7w6",
  "to": "master",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "branch": "slaver_...-FEAT-001",
    "pr_file": "outbox/review_requests/pr_FEAT-001_*.md",
    "summary": "请求审核 FEAT-001"
  }
}
```

### 6.2 Master 反馈通知

```json
{
  "id": "msg_20260410180000",
  "timestamp": "2026-04-10T18:00:00+08:00",
  "from": "master_20260410_143000_a1b2c3d4",
  "to": "slaver_20260410_150000_x9y8z7w6",
  "type": "pr_review_result",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "result": "changes_requested",
    "comments": ["需要添加错误处理", "测试覆盖率不足"],
    "pr_file": "outbox/review_requests/pr_FEAT-001_*.md"
  }
}
```

---

## 7. 相关文档

- [`SLAVER-HEARTBEAT-CHECKLIST.md`](./SLAVER-HEARTBEAT-CHECKLIST.md) - Slaver 心跳检查
- [`MASTER-WORKFLOW.md`](./MASTER-WORKFLOW.md) - Master Review 流程
- [`COMMUNICATION-PROTOCOL.md`](./COMMUNICATION-PROTOCOL.md) - 消息队列通信

---

**维护者**: EKET Framework Team  
**版本**: v2.1.0  
**最后更新**: 2026-04-10
