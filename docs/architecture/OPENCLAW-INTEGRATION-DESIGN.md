# OpenCLAW + EKET 集成架构设计

**版本**: 1.0
**创建时间**: 2026-03-29
**状态**: 设计稿

---

## 1. 概述

### 1.1 目标

将 EKET 框架升级为可被 OpenCLAW 调用的**AI Agent 编排引擎**，实现：
- OpenCLAW 作为总控协调多个 Claude Code 实例
- EKET 作为底层执行框架提供 Master/Slaver 架构
- 形成强化后的 Claude Code Instance 团队

### 1.2 核心概念映射

| OpenCLAW 概念 | EKET 对应物 | 说明 |
|--------------|------------|------|
| Workflow | Epic | 工作流 = 史诗级任务 |
| Task | Ticket | 任务 = Jira Ticket |
| Agent Instance | Slaver Instance | 执行实例 |
| Orchestrator | Master Instance | 协调实例 |
| Tool | Skill | 工具 = 技能 |
| Memory | .eket/memory/ | 记忆存储 |

---

## 2. 架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCLAW Orchestrator                    │
│  (外部 AI 编排系统 / 人类总控)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ API / CLI / Message Queue
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EKET Gateway Layer (新增)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   REST API  │  │  WebSocket  │  │  CLI Proxy  │             │
│  │   Adapter   │  │   Adapter   │  │   Adapter   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Internal Protocol
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EKET Core Framework                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Master Instance                        │   │
│  │  - 需求分析 (OpenCLAW Workflow → EKET Epic)              │   │
│  │  - 任务拆解 (OpenCLAW Task → EKET Ticket)                │   │
│  │  - 资源分配 (Slaver 匹配)                                 │   │
│  │  - 代码审查 (PR Review)                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│          ┌───────────────────┼───────────────────┐              │
│          ▼                   ▼                   ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │  Slaver #1   │    │  Slaver #2   │    │  Slaver #N   │     │
│  │  (frontend)  │    │  (backend)   │    │  (test)      │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Three Repository Storage                     │
│  confluence/  │  jira/  │  code_repo/                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 组件层次

| 层级 | 组件 | 职责 |
|------|------|------|
| L1 | OpenCLAW | 外部编排、人类交互、多框架协调 |
| L2 | EKET Gateway | 协议转换、API 暴露、认证鉴权 |
| L3 | EKET Master | 任务分析、拆解、审查 |
| L4 | EKET Slaver | 任务执行、开发、测试 |
| L5 | Storage | 三仓库持久化 |

---

## 3. 升级计划

### Phase 1: API Gateway 层 (v1.0.0)

#### 3.1.1 新增 REST API

```bash
# 新增文件
node/src/api/openclaw-gateway.ts
node/src/api/routes/
  - workflow.ts      # Workflow 管理
  - task.ts          # Task 管理
  - agent.ts         # Agent 管理
  - memory.ts        # Memory 管理
```

**API 端点设计**:

| 方法 | 端点 | 功能 | EKET 映射 |
|------|------|------|----------|
| POST | `/api/v1/workflow` | 创建工作流 | 创建 Epic |
| GET | `/api/v1/workflow/:id` | 获取工作流状态 | 查询 Epic 状态 |
| POST | `/api/v1/task` | 创建任务 | 创建 Ticket |
| GET | `/api/v1/task/:id` | 获取任务详情 | 查询 Ticket |
| POST | `/api/v1/agent` | 启动 Agent 实例 | /eket-start |
| GET | `/api/v1/agent/:id/status` | 获取 Agent 状态 | 心跳检测 |
| GET | `/api/v1/memory` | 查询记忆 | 读取 .eket/memory/ |

#### 3.1.2 协议转换器

```typescript
// OpenCLAW Task → EKET Ticket 映射
interface OpenCLAWTask {
  id: string;
  type: 'feature' | 'bugfix' | 'test' | 'doc';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee?: string;
  workflow_id: string;
}

interface EKETTicket {
  ticket_id: string;  // FEAT-001, FIX-001, etc.
  type: string;
  importance: string;
  priority: string;
  epic_id: string;
  assignee?: string;
}

function openCLAWToEKET(task: OpenCLAWTask): EKETTicket {
  const typeMap = {
    'feature': 'FEAT',
    'bugfix': 'FIX',
    'test': 'TEST',
    'doc': 'DOC'
  };
  return {
    ticket_id: `${typeMap[task.type]}-xxx`,
    type: typeMap[task.type],
    importance: mapPriority(task.priority),
    priority: task.priority,
    epic_id: task.workflow_id,
    assignee: task.assignee
  };
}
```

### Phase 2: 动态 Agent 加载 (v1.1.0)

#### 3.2.1 Agent Profile 动态生成

```bash
# 新增文件
scripts/openclaw-load-agent.sh
.eket/profiles/openclaw_managed.yml
```

**Agent 配置模板**:

```yaml
# .eket/profiles/openclaw_managed.yml
source: openclaw
agent_type: ${OPENCLAW_ASSIGNED_ROLE}
capabilities:
  - ${OPENCLAW_SKILLS}
execution_mode: ${OPENCLAW_MODE:-auto}
reporting:
  to: openclaw
  channel: ${MESSAGE_QUEUE_URL}
  format: json
```

#### 3.2.2 OpenCLAW 命令适配

```bash
#!/bin/bash
# scripts/openclaw-exec.sh
# OpenCLAW 命令执行器

case "$1" in
  create-workflow)
    # 创建 Epic
    create-epic "$2"
    ;;
  assign-task)
    # 分配 Ticket 给 Slaver
    assign-ticket "$2" --assignee "$3"
    ;;
  start-agent)
    # 启动 Slaver 实例
    /eket-start -r "$OPENCLAW_ROLE"
    ;;
  get-status)
    # 获取状态
    get-agent-status "$2"
    ;;
esac
```

### Phase 3: 消息队列集成 (v1.2.0)

#### 3.3.1 双向消息通道

```
OpenCLAW ←→ RabbitMQ/Redis ←→ EKET Message Queue
```

**消息格式**:

```json
{
  "protocol": "openclaw-eket-bridge",
  "version": "1.0",
  "direction": "openclaw_to_eket",
  "message_type": "task_assignment",
  "payload": {
    "openclaw_task_id": "ocl_task_001",
    "eket_ticket_id": "FEAT-001",
    "assignee": "agent_frontend_dev_001",
    "deadline": "2026-03-30T18:00:00Z"
  }
}
```

#### 3.3.2 事件通知

| EKET 事件 | OpenCLAW 通知 |
|----------|--------------|
| Ticket 状态变更 | Task Status Update |
| PR 提交 | Code Review Request |
| Agent 上线/下线 | Agent Lifecycle Event |
| Sprint 完成 | Milestone Completed |

### Phase 4: 强化的 Claude Code 实例 (v1.3.0)

#### 3.4.1 多实例协同

```yaml
# OpenCLAW 配置的 Claude Code 团队
claude_code_team:
  master:
    instance_id: claude-master-001
    role: coordinator
    capabilities:
      - requirement_analysis
      - task_decomposition
      - code_review

  slavers:
    - instance_id: claude-frontend-001
      role: frontend_dev
      skills: [react, typescript, tailwind]

    - instance_id: claude-backend-001
      role: backend_dev
      skills: [nodejs, postgresql, redis]

    - instance_id: claude-test-001
      role: qa_engineer
      skills: [jest, playwright, api_testing]

    - instance_id: claude-devops-001
      role: devops
      skills: [docker, k8s, ci_cd]
```

#### 3.4.2 人类参与点

| 阶段 | 人类参与方式 | OpenCLAW 集成点 |
|------|------------|---------------|
| 需求确认 | Human-in-the-loop | OpenCLAW Human Review |
| 技术方案 | 技术决策 | OpenCLAW Tech Approval |
| Code Review | 最终批准 | OpenCLAW PR Sign-off |
| Sprint Review | 演示反馈 | OpenCLAW Retro |

---

## 4. 文件结构变更

### 4.1 新增目录

```
eket/
├── openclaw/                    # OpenCLAW 集成层 (新增)
│   ├── gateway/                 # API Gateway
│   │   ├── api/
│   │   ├── adapters/
│   │   └── middleware/
│   ├── bridge/                  # 消息桥接
│   │   ├── message-queue.ts
│   │   └── event-bus.ts
│   └── cli/                     # CLI 代理
│       └── openclaw-cli.ts
│
├── .claude/
│   └── commands/
│       ├── eket-start.sh        # (已升级 v0.9.3)
│       ├── eket-analyze.sh      # (已升级)
│       ├── eket-review-pr.sh    # (已升级)
│       └── openclaw-*.sh        # (新增)
│
├── scripts/
│   ├── openclaw-load-agent.sh   # (新增)
│   ├── openclaw-exec.sh         # (新增)
│   └── ...
│
└── .eket/
    ├── config.yml               # (升级：添加 OpenCLAW 配置)
    └── state/
        └── openclaw_status.yml  # (新增)
```

### 4.2 配置升级

```yaml
# .eket/config.yml 新增 OpenCLAW 配置
openclaw:
  enabled: true
  mode: managed  # managed | autonomous

  # API Gateway 配置
  gateway:
    port: 8080
    host: localhost
    auth:
      type: api_key
      key_env: OPENCLAW_API_KEY

  # 消息队列配置
  message_queue:
    type: redis  # redis | rabbitmq | file
    connection:
      host: ${REDIS_HOST}
      port: ${REDIS_PORT}
    channels:
      task_assignment: "openclaw:tasks:assign"
      status_update: "openclaw:tasks:status"
      agent_lifecycle: "openclaw:agents:lifecycle"

  # Agent 配置
  agents:
    auto_spawn: true
    max_concurrent: 5
    idle_timeout: 3600  # 1 小时无任务自动休眠

  # 人类参与配置
  human_in_loop:
    requirements_review: true
    tech_design_approval: true
    pr_final_signoff: false  # false=Master 可批准
```

---

## 5. 工作流程示例

### 5.1 OpenCLAW 创建 Workflow

```bash
# OpenCLAW 创建 Epic/Workflow
curl -X POST http://eket.local:8080/api/v1/workflow \
  -H "Authorization: Bearer ${OPENCLAW_API_KEY}" \
  -d '{
    "name": "用户认证系统",
    "description": "实现用户登录、注册、权限管理",
    "priority": "high",
    "deadline": "2026-04-15"
  }'

# 返回
{
  "workflow_id": "EPIC-001",
  "status": "created",
  "tickets_created": 0
}
```

### 5.2 OpenCLAW 分配 Task

```bash
# OpenCLAW 创建并分配 Task
curl -X POST http://eket.local:8080/api/v1/task \
  -H "Authorization: Bearer ${OPENCLAW_API_KEY}" \
  -d '{
    "workflow_id": "EPIC-001",
    "type": "feature",
    "title": "用户登录功能",
    "description": "实现 JWT 认证登录",
    "priority": "P1",
    "assignee_role": "frontend_dev",
    "skills_required": ["react", "typescript"]
  }'

# 返回
{
  "task_id": "FEAT-001",
  "ticket_id": "FEAT-001",
  "status": "ready",
  "assigned_to": "agent_frontend_dev_001"
}
```

### 5.3 EKET 执行 Task

```bash
# Slaver 自动领取任务并执行
/eket-start -a

# 执行流程：
# 1. 检测到 FEAT-001 状态为 ready
# 2. 更新状态为 in_progress
# 3. 开发 → 测试 → 提交 PR
# 4. Master Review
# 5. 合并到 main

# 发送完成通知到 OpenCLAW
curl -X POST http://eket.local:8080/api/v1/task/FEAT-001/complete \
  -H "Authorization: Bearer ${OPENCLAW_API_KEY}" \
  -d '{"status": "done", "pr_url": "https://..."}'
```

---

## 6. 安全与权限

### 6.1 认证机制

| 层级 | 认证方式 |
|------|----------|
| OpenCLAW → Gateway | API Key / OAuth2 |
| Gateway → Master | JWT Token |
| Master → Slaver | Instance Certificate |

### 6.2 权限控制

```yaml
permissions:
  openclaw:
    - workflow:create
    - workflow:read
    - task:create
    - task:assign
    - agent:start
    - agent:stop

  master:
    - ticket:create
    - ticket:update
    - pr:review
    - pr:merge

  slaver:
    - ticket:claim
    - code:write
    - pr:submit
```

---

## 7. 实施时间表

| Phase | 版本 | 预计工时 | 依赖 |
|-------|------|----------|------|
| Phase 1: API Gateway | v1.0.0 | 3-5 天 | 基础架构 |
| Phase 2: Agent 加载 | v1.1.0 | 2-3 天 | Phase 1 |
| Phase 3: 消息队列 | v1.2.0 | 3-4 天 | Phase 1,2 |
| Phase 4: 强化实例 | v1.3.0 | 5-7 天 | Phase 1,2,3 |

**总计**: 13-19 天

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| OpenCLAW API 变更 | 高 | 版本锁定、适配层 |
| 消息延迟 | 中 | 本地缓存、重试机制 |
| Agent 状态不一致 | 高 | 心跳检测、状态同步 |
| 安全风险 | 高 | API 认证、权限隔离 |

---

## 9. 下一步行动

### 立即可做

1. **创建 OpenCLAW 集成 branch**: `openclaw-integration`
2. **设计 API Schema**: 定义 OpenCLAW ↔ EKET 协议
3. **搭建开发环境**: Redis、测试框架

### 短期 (1-2 周)

1. 实现 API Gateway 基础功能
2. 创建协议转换器
3. 编写集成测试

### 中期 (3-4 周)

1. 实现消息队列集成
2. 开发动态 Agent 加载
3. 人类参与流程设计

---

**维护者**: EKET Framework Team
**审核状态**: 待审核
**批准者**: _(待填写)_
