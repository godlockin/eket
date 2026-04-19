# OpenCLAW + EKET 数据流与状态管理设计

**版本**: 1.0
**创建时间**: 2026-03-29
**状态**: 设计稿

---

## 1. 数据流架构

### 1.1 整体数据流图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OpenCLAW Orchestrator                              │
│   (外部 AI 编排系统 / 人类总控)                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 1. Workflow 创建请求
         │ HTTP POST /api/v1/workflow
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EKET API Gateway                                      │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                  │
│   │ Protocol      │  │ Auth          │  │ Rate          │                  │
│   │ Translator    │  │ Middleware    │  │ Limiter       │                  │
│   └───────────────┘  └───────────────┘  └───────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 2. Epic 创建命令
         │ Internal Event
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EKET Core Framework                                   │
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────┐       │
│   │                    Master Instance                             │       │
│   │  - 需求分析 (Workflow → Epic)                                  │       │
│   │  - 任务拆解 (Task → Ticket)                                    │       │
│   │  - 资源分配 (Slaver 匹配)                                       │       │
│   │  - 代码审查 (PR Review)                                        │       │
│   └────────────────────────────────────────────────────────────────┘       │
│                              │                                              │
│          ┌───────────────────┼───────────────────┐                        │
│          ▼                   ▼                   ▼                        │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│   │  Slaver #1   │    │  Slaver #2   │    │  Slaver #N   │              │
│   │  (frontend)  │    │  (backend)   │    │  (test)      │              │
│   └──────────────┘    └──────────────┘    └──────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 3. Git Commit / State Update
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Three Repository Storage                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│   │ Confluence/  │  │ Jira/        │  │ Code Repo/   │                     │
│   │ Docs         │  │ Tickets      │  │ Source Code  │                     │
│   └──────────────┘  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 4. Status Update / Event Notification
         │ Redis Pub/Sub
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Message Bridge                                        │
│   ┌────────────────────────────────────────────────────────────────┐       │
│   │                   Redis Channels                               │       │
│   │  - openclaw:tasks:assign                                       │       │
│   │  - openclaw:tasks:status                                       │       │
│   │  - openclaw:agents:lifecycle                                   │       │
│   └────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 5. Callback / Webhook
         │ HTTP POST /api/v1/callbacks/*
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OpenCLAW Orchestrator                              │
│   (状态更新、事件通知)                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流详细步骤

| 步骤 | 方向 | 数据类型 | 协议 | 内容 |
|------|------|----------|------|------|
| 1 | OpenCLAW → Gateway | Workflow 创建 | HTTP/REST | `{name, description, priority, deadline}` |
| 2 | Gateway → Master | Epic 创建 | Internal Event | Epic 元数据 |
| 3 | Master → Jira | Ticket 创建 | Git Commit | Markdown Ticket 文件 |
| 4 | Master → Redis | 任务发布 | Redis Pub/Sub | `{type: task_assignment, payload: {...}}` |
| 5 | Slaver → Redis | 任务领取 | Redis Pub/Sub | `{type: task_claimed, ticket_id: ...}` |
| 6 | Slaver → Code Repo | 代码提交 | Git Push | Feature Branch + PR |
| 7 | Slaver → Redis | 状态更新 | Redis Pub/Sub | `{type: task_status_update, status: review}` |
| 8 | Master → Redis | Review 完成 | Redis Pub/Sub | `{type: task_status_update, status: done}` |
| 9 | Gateway → OpenCLAW | Webhook | HTTP POST | Workflow 进度更新 |

---

## 2. 时序图

### 2.1 Workflow 创建和任务分配时序

```
OpenCLAW        API Gateway         Master          Redis           Slaver          Jira/CodeRepo
   │                 │                 │                │                │                 │
   │ POST /workflow  │                 │                │                │                 │
   │────────────────▶│                 │                │                │                 │
   │                 │                 │                │                │                 │
   │                 │ Create Epic     │                │                │                 │
   │                 │────────────────▶│                │                │                 │
   │                 │                 │                │                │                 │
   │                 │                 │ Create Tickets │                │                 │
   │                 │                 │───────────────▶│                │                 │
   │                 │                 │                │                │                 │
   │                 │                 │                │ Publish Task   │                 │
   │                 │                 │───────────────▶│                │                 │
   │                 │                 │                │                │                │
   │                 │                 │                │ Subscribe      │                 │
   │                 │                 │                │───────────────▶│                 │
   │                 │                 │                │                │                 │
   │                 │                 │                │   Task Claim   │                 │
   │                 │                 │                │◀───────────────│                 │
   │                 │                 │                │                │                 │
   │ 201 Created     │                 │                │                │                 │
   │◀────────────────│                 │                │                │                 │
   │ {workflow_id}   │                 │                │                │                 │
   │                 │                 │                │                │                │
   │                 │                 │                │ Notify Claim   │                 │
   │                 │                 │◀───────────────│                │                 │
   │                 │                 │                │                │                 │
   │                 │                 │                │                │ Code Develop    │
   │                 │                 │                │                │───────────────▶│
   │                 │                 │                │                │                 │
   │                 │                 │                │                │ Submit PR       │
   │                 │                 │                │                │───────────────▶│
   │                 │                 │                │                │                 │
   │                 │                 │                │ Status Update  │                 │
   │                 │                 │                │◀───────────────│                 │
   │                 │                 │                │                │                 │
```

### 2.2 任务执行完整流程时序

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         Workflow 执行完整时序图                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘

OpenCLAW    Gateway     Master      Redis       Slaver      Jira      CodeRepo    Memory
   │           │           │           │           │           │           │           │
   │ 1.Create  │           │           │           │           │           │           │
   │ Workflow  │           │           │           │           │           │           │
   │──────────▶│           │           │           │           │           │           │
   │           │           │           │           │           │           │           │
   │           │ 2.Analyze │           │           │           │           │           │
   │           │ Requirement           │           │           │           │           │
   │           │──────────▶│           │           │           │           │           │
   │           │           │           │           │           │           │           │
   │           │           │ 3.Decompose                                         │
   │           │           │ to Tickets                                          │
   │           │           │────────────────────────────────────────────────────▶│
   │           │           │           │           │           │                 │
   │           │           │           │ 4.Publish                               │
   │           │           │           │ Tasks                                   │
   │           │           │           │▶│           │           │                 │
   │           │           │           │           │           │                 │
   │           │           │           │           │ 5.Fetch                     │
   │           │           │           │           │ Tickets                     │
   │           │           │           │◀──────────│           │                 │
   │           │           │           │           │           │                 │
   │           │           │           │ 6.Assign  │           │                 │
   │           │           │◀──────────│ Notify    │           │                 │
   │           │           │           │           │           │                 │
   │           │           │           │           │ 7.Update                    │
   │           │           │           │           │ Status    │                 │
   │           │           │           │           │──────────▶│                 │
   │           │           │           │           │           │                 │
   │           │           │           │           │ 8.Develop                   │
   │           │           │           │           │ Code      │                 │
   │           │           │           │           │           │───────────────▶│
   │           │           │           │           │           │                 │
   │           │           │           │           │ 9.Commit  │                 │
   │           │           │           │           │ Feature   │                 │
   │           │           │           │           │───────────────────────────▶│
   │           │           │           │           │           │                 │
   │           │           │           │           │ 10.Submit                 │
   │           │           │           │           │ PR        │                 │
   │           │           │           │           │───────────────────────────▶│
   │           │           │           │           │           │                 │
   │           │           │           │           │ 11.Status                 │
   │           │           │           │◀──────────│ Update    │                 │
   │           │           │           │           │           │                 │
   │           │           │           │ 12.Notify           │                 │
   │           │           │◀──────────│ Review              │                 │
   │           │           │           │ Request │           │                 │
   │           │           │           │           │           │                 │
   │           │           │ 13.Review │           │           │                 │
   │           │           │ Code      │           │           │                 │
   │           │           │────────────────────────────────────────────────────▶│
   │           │           │           │           │           │                 │
   │           │           │           │           │ 14.Review │                 │
   │           │           │           │           │ Approved  │                 │
   │           │           │◀─────────────────────────────────│                 │
   │           │           │           │           │           │                 │
   │           │           │           │           │ 15.Merge  │                 │
   │           │           │           │           │ to main   │                 │
   │           │           │           │           │───────────────────────────▶│
   │           │           │           │           │           │                 │
   │           │           │           │           │ 16.Update │                 │
   │           │           │           │           │ Done      │                 │
   │           │           │           │           │──────────▶│                 │
   │           │           │           │           │           │                 │
   │           │           │           │ 17.Complete         │                 │
   │           │           │           │ Notify              │                 │
   │           │◀──────────│           │           │           │                 │
   │           │           │           │           │           │                 │
   │ 18.Status │           │           │           │           │                 │
   │ Update    │           │           │           │           │                 │
   │◀──────────│           │           │           │           │                 │
   │           │           │           │           │           │                 │
   │           │           │           │           │           │ 19.Save         │
   │           │           │           │           │           │ Memory          │
   │           │           │           │           │           │───────────────▶│
```

### 2.3 多 Slaver 协同时序

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    多 Slaver 协同时序图                                   │
└─────────────────────────────────────────────────────────────────────────┘

Master      Redis       Slaver-A      Slaver-B      Slaver-C      CodeRepo
   │           │            │            │            │            │
   │ 1.Create │            │            │            │            │
   │ Tickets  │            │            │            │            │
   │─────────▶│            │            │            │            │
   │           │            │            │            │            │
   │           │ 2.Broadcast         │            │            │
   │           │ Task List │            │            │            │
   │           │──────────▶│            │            │            │
   │           │─────────────────────▶│            │            │
   │           │──────────────────────────────────▶│            │
   │           │───────────────────────────────────────────────▶│
   │           │            │            │            │            │
   │           │ 3.Claim   │            │            │            │
   │           │◀──────────│            │            │            │
   │           │ FEAT-001  │            │            │            │
   │           │            │            │            │            │
   │           │ 4.Claim   │            │            │            │
   │           │◀─────────────────────│            │            │
   │           │ FIX-001   │            │            │            │
   │           │            │            │            │            │
   │           │ 5.Claim   │            │            │            │
   │           │◀──────────────────────────────────│            │
   │           │ TEST-001  │            │            │            │
   │           │            │            │            │            │
   │ 6.Assign │            │            │            │            │
   │ Confirm  │            │            │            │            │
   │─────────▶│            │            │            │            │
   │           │            │            │            │            │
   │           │ 7.Notify  │            │            │            │
   │           │ Assignment│            │            │            │
   │           │◀──────────│            │            │            │
   │           │──────────▶│            │            │            │
   │           │◀─────────────────────│            │            │
   │           │────────────────────▶│            │            │
   │           │◀──────────────────────────────────│            │
   │           │─────────────────────────────────▶│            │
   │           │            │            │            │            │
   │           │            │ Develop    │            │            │
   │           │            │───────────▶│            │            │
   │           │            │            │ Fix Bug    │            │
   │           │            │            │───────────▶│            │
   │           │            │            │            │ Write Test │
   │           │            │            │            │───────────▶│
   │           │            │            │            │            │
   │           │            │ 8.PR #1    │            │            │
   │           │            │────────────────────────────────────▶│
   │           │            │            │            │            │
   │           │            │ 9.PR #2    │            │            │
   │           │            │◀────────────────────────────────────│
   │           │            │            │            │            │
   │           │            │ 10.PR #3   │            │            │
   │           │            │────────────────────────────────────▶│
   │           │            │            │            │            │
   │ 11.Batch  │            │            │            │            │
   │ Review    │            │            │            │            │
   │◀─────────────────────────────────────────────────────────────│
   │           │            │            │            │            │
```

---

## 3. 生命周期管理

### 3.1 OpenCLAW Workflow 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow 生命周期状态机                         │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │ created  │ 刚被 OpenCLAW 创建
    └────┬─────┘
         │ Master 开始分析
         ▼
    ┌──────────┐
    │ analyzing│ 需求分析中
    └────┬─────┘
         │ 分析完成，Tickets 已创建
         ▼
    ┌──────────┐
    │ planning │ 等待 Slaver 领取任务
    └────┬─────┘
         │ 有任务开始执行
         ▼
    ┌──────────┐
    │executing │◀────────────────┐
    └────┬─────┘                  │ 新任务开始
         │ 所有任务完成            │
         ▼                        │
    ┌──────────┐                  │
    │ reviewing│ 最终审查──────────┘
    └────┬─────┘
         │ Master 批准
         ▼
    ┌──────────┐
    │ completed│ Workflow 完成
    └──────────┘
```

| 状态 | 触发条件 | 动作 | 通知 |
|------|----------|------|------|
| `created` | OpenCLAW POST /workflow | 创建 Epic 文件 | OpenCLAW |
| `analyzing` | Master 开始处理 | 读取需求文档 | - |
| `planning` | Master 完成分析 | 创建 Tickets | OpenCLAW |
| `executing` | 首个 Ticket 被领取 | 更新状态 | Redis Pub/Sub |
| `reviewing` | 所有 Ticket 完成 | 最终审查 | OpenCLAW |
| `completed` | Master 批准 | 归档 | OpenCLAW + Memory |

### 3.2 EKET Ticket 生命周期

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Ticket 完整生命周期                               │
└─────────────────────────────────────────────────────────────────────────┘

  backlog      analysis      approved       design        ready
     │            │             │             │             │
     └───────────▶│             │             │             │
          │      │             │             │             │
          │      └────────────▶│             │             │
          │             │      │             │             │
          │             │      └────────────▶│             │
          │             │             │      │             │
          │             │             │      └────────────▶│
          │             │             │      │             │
          │             │             │      │    Claim    │
          │◀───────────────────────────────────────────────│
          │                         │      │             │
          │                         ▼      │             │
          │                   in_progress   │             │
          │                         │       │             │
          │                         ▼       │             │
          │                   ┌───────┐     │             │
          │◀─────────────────►│  dev  │     │             │
          │    需要修改       │ /test│     │             │
          │                   └───┬───┘     │             │
          │                       │         │             │
          │                       ▼         │             │
          │                   review        │             │
          │                       │         │             │
          │         ┌─────────────┘         │             │
          │         │ Master 批准            │             │
          ▼         ▼                       │             │
       rejected  done ◀─────────────────────┘             │
                           直接批准 (简单任务)
```

### 3.3 Slaver Agent 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    Slaver Agent 生命周期                          │
└─────────────────────────────────────────────────────────────────┘

     ┌─────────┐
     │ offline │ 未启动
     └────┬────┘
          │ /eket-start
          ▼
     ┌─────────┐
     │starting │ 初始化中
     └────┬────┘
          │ 健康检查通过
          ▼
     ┌─────────┐
     │  idle   │ 等待任务
     └────┬────┘
          │ 领取任务
          ▼
     ┌─────────┐
     │ active  │◀────────────────┐
     └────┬────┘                 │ 领取新任务
          │ 任务完成              │
          ▼                      │
     ┌─────────┐                 │
     │reviewing│ 等待 Master──────┘
     └────┬────┘
          │ PR 批准
          ▼
     ┌─────────┐
     │  idle   │ 返回空闲
     └─────────┘
          │ 长时间空闲/错误
          ▼
     ┌─────────┐
     │ offline │ 离线/错误
     └─────────┘
```

### 3.4 Master Agent 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    Master Agent 生命周期                          │
└─────────────────────────────────────────────────────────────────┘

     ┌─────────┐
     │offline  │ 未启动
     └────┬────┘
          │ /eket-start (检测到 Master 标记)
          ▼
     ┌─────────┐
     │starting │ 选举/初始化
     └────┬────┘
          │ 选举成功
          ▼
     ┌─────────┐
     │ active  │ 主 Master
     └────┬────┘
          │ 租约到期/错误
          ▼
     ┌─────────┐
     │standby  │ 备选 Master
     └─────────┘
```

---

## 4. 状态管理

### 4.1 状态存储位置

| 状态类型 | 存储位置 | 格式 | 更新频率 |
|----------|----------|------|----------|
| Workflow 状态 | `jira/epics/EPIC-xxx.md` | Markdown | 低 |
| Ticket 状态 | `jira/tickets/{type}/XXX-xxx.md` | Markdown | 中 |
| Agent 状态 | Redis Hash + `.eket/state/` | JSON/YAML | 高 (心跳) |
| Message Queue | Redis Stream | JSON | 实时 |
| Memory | `.eket/memory/` | Markdown | 低 |
| Code 状态 | Git Branch/PR | Git | 中 |

### 4.2 状态同步机制

```
┌─────────────────────────────────────────────────────────────────┐
│                      状态同步架构图                               │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   OpenCLAW      │
                    │  (External)     │
                    └────────┬────────┘
                             │ HTTP Polling / Webhook
                    ┌────────▼────────┐
                    │   API Gateway   │
                    │  (State Cache)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────┐  ┌──────▼──────┐  ┌───▼────────┐
     │   Redis     │  │   Git       │  │   File     │
     │   (Hot)     │  │   (Warm)    │  │   (Cold)   │
     └────────┬────┘  └──────┬──────┘  └────┬───────┘
              │              │              │
              │              │              │
     ┌────────▼──────────────▼──────────────▼───────┐
     │           EKET Core (Master/Slaver)          │
     └──────────────────────────────────────────────┘
```

### 4.3 状态查询 API

```typescript
// GET /api/v1/workflow/:id
{
  "workflow_id": "EPIC-001",
  "status": "executing",
  "created_at": "2026-03-29T10:00:00Z",
  "updated_at": "2026-03-29T14:30:00Z",
  "tickets": {
    "total": 5,
    "completed": 2,
    "in_progress": 2,
    "pending": 1
  },
  "progress": 40
}

// GET /api/v1/task/:id
{
  "task_id": "FEAT-001",
  "ticket_id": "FEAT-001",
  "status": "in_progress",
  "assignee": "agent_frontend_dev_001",
  "created_at": "2026-03-29T10:05:00Z",
  "started_at": "2026-03-29T10:15:00Z",
  "pr_url": "https://github.com/.../pull/42",
  "branch": "feature/FEAT-001-user-login"
}

// GET /api/v1/agent/:id/status
{
  "agent_id": "agent_frontend_dev_001",
  "status": "active",
  "role": "frontend_dev",
  "skills": ["react", "typescript", "tailwind"],
  "current_task": "FEAT-001",
  "tasks_completed": 12,
  "last_heartbeat": "2026-03-29T14:35:00Z",
  "uptime_seconds": 3600
}
```

### 4.4 状态变更事件

```typescript
interface StateChangeEvent {
  entity_type: 'workflow' | 'task' | 'agent';
  entity_id: string;
  old_state: string;
  new_state: string;
  trigger: string;
  timestamp: string;
  payload: any;
}

// 事件示例
{
  "entity_type": "task",
  "entity_id": "FEAT-001",
  "old_state": "ready",
  "new_state": "in_progress",
  "trigger": "task_claimed",
  "timestamp": "2026-03-29T10:15:00Z",
  "payload": {
    "assignee": "agent_frontend_dev_001",
    "claim_method": "auto"
  }
}
```

---

## 5. 错误处理和恢复

### 5.1 错误类型和处理策略

| 错误类型 | 错误码 | 处理策略 | 恢复方式 |
|----------|--------|----------|----------|
| 网络连接失败 | `CONNECTION_FAILED` | 重试 + 降级 | 自动重试，降级到本地 Redis/SQLite |
| 任务领取冲突 | `TASK_CLAIM_CONFLICT` | 重新分配 | Master 重新分配任务 |
| Agent 离线 | `AGENT_OFFLINE` | 任务转移 | 检测到心跳丢失后转移任务 |
| Git 冲突 | `GIT_CONFLICT` | 手动解决 | 通知人类介入 |
| API 认证失败 | `AUTH_FAILED` | 停止请求 | 检查 API Key 配置 |
| 状态不一致 | `STATE_INCONSISTENT` | 重新同步 | 从 Git 仓库重建状态 |

### 5.2 断路器模式

```
┌─────────────────────────────────────────────────────────────────┐
│                       断路器状态机                               │
└─────────────────────────────────────────────────────────────────┘

    ┌───────────┐
    │  CLOSED   │ 正常运行
    └─────┬─────┘
          │ 失败次数 >= 阈值
          ▼
    ┌───────────┐
    │   OPEN    │ 拒绝请求，等待超时
    └─────┬─────┘
          │ 超时到期
          ▼
    ┌───────────┐
    │ HALF_OPEN │ 允许单个请求探测
    └─────┬─────┘
          │ 成功
          ▼
    ┌───────────┐
    │  CLOSED   │ 恢复正常
    └───────────┘
```

### 5.3 重试策略

```yaml
retry_config:
  max_retries: 3
  initial_delay_ms: 500
  max_delay_ms: 5000
  multiplier: 2
  jitter: true  # 添加随机抖动防止雪崩

retryable_errors:
  - CONNECTION_FAILED
  - REMOTE_REDIS_NOT_CONFIGURED
  - LOCAL_REDIS_NOT_CONFIGURED
  - EXECUTION_ERROR

non_retryable_errors:
  - AUTH_FAILED
  - INVALID_REQUEST
  - TASK_NOT_FOUND
```

---

## 6. 监控和可观测性

### 6.1 监控指标

| 指标类型 | 指标名称 | 说明 | 告警阈值 |
|----------|----------|------|----------|
| Gateway | `gateway_requests_total` | API 请求总数 | - |
| | `gateway_request_duration_ms` | 请求延迟 | p99 > 1000ms |
| | `gateway_errors_total` | 错误数 | > 10/min |
| Master | `master_tasks_created` | 创建任务数 | - |
| | `master_review_duration_ms` | Review 延迟 | p99 > 5000ms |
| Slaver | `slaver_tasks_completed` | 完成任务数 | - |
| | `slaver_active_duration_seconds` | 活跃时长 | - |
| Redis | `redis_pubsub_messages_total` | 消息数 | - |
| | `redis_subscriber_lag_seconds` | 订阅延迟 | > 5s |
| Workflow | `workflow_duration_seconds` | 工作流时长 | > 24h |
| | `workflow_success_rate` | 成功率 | < 95% |

### 6.2 日志格式

```json
{
  "timestamp": "2026-03-29T14:35:00.123Z",
  "level": "INFO",
  "service": "eket-gateway",
  "component": "task-router",
  "trace_id": "abc123",
  "span_id": "def456",
  "message": "Task created successfully",
  "data": {
    "openclaw_task_id": "ocl_task_001",
    "eket_ticket_id": "FEAT-001",
    "workflow_id": "EPIC-001",
    "assignee_role": "frontend_dev"
  }
}
```

### 6.3 链路追踪

```
OpenCLAW Request
       │
       ▼
[Gateway] span_id=abc123
  ├── [Auth Middleware] span_id=abc124
  ├── [Protocol Translator] span_id=abc125
  └── [Master Event] span_id=abc126
         │
         ▼
[Master] span_id=abc127
  ├── [Epic Create] span_id=abc128
  ├── [Ticket Create] span_id=abc129
  └── [Redis Publish] span_id=abc130
```

---

## 7. 安全设计

### 7.1 认证授权

```
┌─────────────────────────────────────────────────────────────────┐
│                        认证授权流程                              │
└─────────────────────────────────────────────────────────────────┘

OpenCLAW                    API Gateway                EKET Core
   │                            │                          │
   │  Bearer {api_key}          │                          │
   │───────────────────────────▶│                          │
   │                            │                          │
   │                            │ Verify API Key           │
   │                            │ (from env/config)        │
   │                            │                          │
   │                            │ Generate JWT             │
   │                            │ (sub: openclaw,          │
   │                            │  roles: [workflow:write, │
   │                            │   task:write])           │
   │                            │                          │
   │                            │ JWT Token                │
   │                            │─────────────────────────▶│
   │                            │                          │
   │                            │                          │ Verify JWT
   │                            │                          │ Check Permissions
   │                            │                          │
   │ 200 OK                     │                          │
   │◀───────────────────────────│                          │
   │                            │                          │
```

### 7.2 权限矩阵

| 角色 | workflow:create | workflow:read | task:create | task:assign | agent:start | agent:stop |
|------|-----------------|---------------|-------------|-------------|-------------|------------|
| OpenCLAW | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Master | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slaver | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Human | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 8. 性能优化

### 8.1 缓存策略

```
┌─────────────────────────────────────────────────────────────────┐
│                        多层缓存架构                             │
└─────────────────────────────────────────────────────────────────┘

L1: Memory Cache (LRU, 1000 entries, TTL 5min)
       │
       │ Cache Miss
       ▼
L2: Redis Cache (TTL 30min, persisted)
       │
       │ Cache Miss
       ▼
L3: Git Repository (source of truth)
```

### 8.2 批量操作

```typescript
// 批量状态更新
POST /api/v1/batch/status
{
  "updates": [
    {"entity_type": "task", "entity_id": "FEAT-001", "status": "done"},
    {"entity_type": "task", "entity_id": "FEAT-002", "status": "done"},
    {"entity_type": "task", "entity_id": "TEST-001", "status": "done"}
  ]
}

// 批量查询
GET /api/v1/batch/tasks?ids=FEAT-001,FEAT-002,TEST-001
```

---

**维护者**: EKET Framework Team
**审核状态**: 待审核
**批准者**: _(待填写)_
