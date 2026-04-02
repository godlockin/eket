# EKET Framework API 参考文档

**版本**: 2.0.0
**最后更新**: 2026-04-02

---

## 目录

1. [REST API 端点](#rest-api-端点)
2. [Web Dashboard API](#web-dashboard-api)
3. [消息协议](#消息协议)
4. [错误码参考](#错误码参考)

---

## REST API 端点

### 服务器配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Host | `localhost` | 服务器监听地址 |
| Port | `3000` | 服务器端口 |
| 协议 | HTTP/1.1 | 支持的协议版本 |

---

## Web Dashboard API

### 1. 获取完整仪表盘数据

**端点**: `GET /api/dashboard`

**描述**: 获取系统完整状态，包括实例状态、任务列表和统计数据。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "systemStatus": {
      "level": 1,
      "description": "Level 1 (Redis+SQLite)",
      "redisConnected": true,
      "sqliteConnected": true,
      "messageQueueConnected": true
    },
    "instances": [
      {
        "id": "instance_001",
        "type": "ai",
        "agent_type": "frontend_dev",
        "skills": ["react", "typescript", "css"],
        "status": "busy",
        "currentTaskId": "TASK-123",
        "currentLoad": 1,
        "lastHeartbeat": 1712000000000,
        "updatedAt": 1712000000000
      }
    ],
    "tasks": [
      {
        "id": "TASK-123",
        "title": "实现用户登录功能",
        "priority": "high",
        "tags": ["frontend", "auth"],
        "status": "in_progress",
        "assignee": "instance_001"
      }
    ],
    "stats": {
      "totalInstances": 5,
      "activeInstances": 2,
      "idleInstances": 2,
      "offlineInstances": 1,
      "totalTasks": 50,
      "inProgressTasks": 5,
      "completedTasksToday": 12,
      "successRate": 98.5
    },
    "timestamp": 1712000000000
  },
  "timestamp": 1712000000000
}
```

**状态码**:
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 500 | 服务器错误 |

---

### 2. 获取系统状态

**端点**: `GET /api/status`

**描述**: 获取系统健康状态和连接信息。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "level": 1,
    "description": "Level 1 (Redis+SQLite)",
    "redisConnected": true,
    "sqliteConnected": true,
    "messageQueueConnected": true
  },
  "timestamp": 1712000000000
}
```

**降级级别说明**:
| 级别 | 说明 | 状态 |
|------|------|------|
| Level 1 | Redis + SQLite | 正常 |
| Level 2 | 仅 Redis | 降级 |
| Level 3 | 仅 SQLite | 降级 |
| Level 5 | 仅文件系统 | 严重降级 |

---

### 3. 获取所有实例

**端点**: `GET /api/instances`

**描述**: 获取所有注册的 Agent 实例列表。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "instances": [
      {
        "id": "instance_001",
        "type": "ai",
        "agent_type": "frontend_dev",
        "skills": ["react", "typescript"],
        "status": "busy",
        "currentTaskId": "TASK-123",
        "currentLoad": 1,
        "lastHeartbeat": 1712000000000,
        "updatedAt": 1712000000000
      },
      {
        "id": "instance_002",
        "type": "human",
        "agent_type": "reviewer",
        "skills": ["code_review", "security"],
        "status": "idle",
        "currentLoad": 0,
        "lastHeartbeat": 1712000000000,
        "updatedAt": 1712000000000
      }
    ]
  },
  "timestamp": 1712000000000
}
```

**实例状态**:
| 状态 | 说明 |
|------|------|
| `idle` | 空闲，可领取新任务 |
| `busy` | 忙碌，正在执行任务 |
| `offline` | 离线，心跳超时 |

---

### 4. 获取任务列表

**端点**: `GET /api/tasks`

**描述**: 获取所有任务列表（包括进行中和待处理任务）。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "TASK-123",
        "title": "实现用户登录功能",
        "priority": "high",
        "tags": ["frontend", "auth"],
        "status": "in_progress",
        "assignee": "instance_001"
      }
    ]
  },
  "timestamp": 1712000000000
}
```

**任务优先级**:
| 优先级 | 说明 |
|--------|------|
| `urgent` | 紧急，需立即处理 |
| `high` | 高优先级 |
| `normal` | 普通优先级 |
| `low` | 低优先级 |

---

### 5. 获取统计数据

**端点**: `GET /api/stats`

**描述**: 获取系统统计数据。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalInstances": 5,
    "activeInstances": 2,
    "idleInstances": 2,
    "offlineInstances": 1,
    "totalTasks": 50,
    "inProgressTasks": 5,
    "completedTasksToday": 12,
    "successRate": 98.5
  },
  "timestamp": 1712000000000
}
```

**统计字段说明**:
| 字段 | 说明 |
|------|------|
| `totalInstances` | 总实例数 |
| `activeInstances` | 活跃实例数（执行任务中） |
| `idleInstances` | 空闲实例数 |
| `offlineInstances` | 离线实例数 |
| `totalTasks` | 总任务数 |
| `inProgressTasks` | 进行中任务数 |
| `completedTasksToday` | 今日完成任务数 |
| `successRate` | 任务成功率（百分比） |

---

## 消息协议

### 消息格式

所有实例间通信使用以下消息格式：

```json
{
  "id": "msg_20240115_001",
  "timestamp": "2024-01-15T10:30:00Z",
  "from": "agent_frontend_dev_001",
  "to": "agent_tech_manager",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-123",
    "pr_number": 42,
    "branch": "feature/feat-123-user-auth",
    "summary": "实现用户登录功能"
  }
}
```

### 消息类型

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `pr_review_request` | PR 审查请求 | 请求审查代码 |
| `task_claimed` | 任务已领取 | 通知任务被领取 |
| `task_completed` | 任务已完成 | 通知任务完成 |
| `task_blocked` | 任务被阻塞 | 通知任务阻塞 |
| `notification` | 通知 | 一般通知 |
| `task_assigned` | 任务分配 | 分配任务给实例 |
| `task_progress` | 任务进度 | 更新任务进度 |
| `help_request` | 帮助请求 | 请求其他实例帮助 |
| `knowledge_share` | 知识分享 | 分享知识条目 |
| `dependency_notify` | 依赖通知 | 通知依赖变更 |
| `status_change` | 状态变更 | 实例状态变更 |
| `handover_request` | 交接请求 | 请求任务交接 |

### 消息优先级

| 优先级 | 说明 | 响应要求 |
|--------|------|----------|
| `urgent` | 紧急 | 立即处理 |
| `high` | 高 | 5 分钟内处理 |
| `normal` | 普通 | 30 分钟内处理 |
| `low` | 低 | 2 小时内处理 |

---

## 错误码参考

完整错误码列表请参考 [错误码参考文档](../reference/error-codes.md)。

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "CONNECTION_FAILED",
    "message": "All connection levels failed",
    "context": {
      "attemptedLevels": ["remote_redis", "local_redis", "sqlite"]
    }
  },
  "timestamp": 1712000000000
}
```

### 主要错误码分类

| 分类 | 错误码前缀 | 说明 |
|------|------------|------|
| 通用错误 | `UNKNOWN_ERROR`, `NOT_IMPLEMENTED` | 基础错误类型 |
| Redis 相关 | `REDIS_*` | Redis 连接和操作错误 |
| SQLite 相关 | `SQLITE_*` | SQLite 连接和操作错误 |
| 任务相关 | `TASK_*` | 任务管理错误 |
| 票务相关 | `TICKET_*` | 票务管理错误 |
| 消息队列 | `MESSAGE_QUEUE_*` | 消息队列错误 |
| 错误恢复 | `CIRCUIT_*`, `MAX_RETRIES_*` | 断路器和重试错误 |
| 连接管理 | `CONNECTION_*`, `*_NOT_CONFIGURED` | 连接降级错误 |
| Master 选举 | `ELECTION_*`, `MASTER_*` | Master 选举错误 |

---

## 认证

### API Key 认证

部分 API 端点需要 API Key 认证：

**请求头**:
```
X-API-Key: your-api-key-here
```

### 获取 API Key

API Key 通过环境变量配置：
```bash
EKET_API_KEY=your-secure-api-key
```

---

## 使用示例

### cURL 示例

```bash
# 获取仪表盘数据
curl -X GET http://localhost:3000/api/dashboard

# 获取系统状态
curl -X GET http://localhost:3000/api/status

# 获取实例列表
curl -X GET http://localhost:3000/api/instances
```

### JavaScript 示例

```javascript
async function getDashboard() {
  const response = await fetch('http://localhost:3000/api/dashboard');
  const data = await response.json();

  if (data.success) {
    console.log('System Status:', data.data.systemStatus);
    console.log('Instances:', data.data.instances);
    console.log('Stats:', data.data.stats);
  } else {
    console.error('Error:', data.error);
  }
}
```

---

**文档维护**: EKET Framework Team
**反馈**: 请提交 Issue 到项目仓库
