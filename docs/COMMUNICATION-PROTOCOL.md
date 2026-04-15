# 通信协议规范

**版本**: v2.9.0-alpha  
**创建日期**: 2026-04-10  
**目的**: 定义 EKET 框架节点间通信方式的选择原则和降级策略

---

## 1. 通信方式分级

EKET 支持四级降级通信方式：

| 级别 | 通信方式 | 适用场景 | 性能 |
|------|----------|----------|------|
| **Level 1** | 远程 Redis（Pub/Sub） | 分布式多实例、多机协作 | ⭐⭐⭐⭐⭐ |
| **Level 2** | 本地 Redis（Pub/Sub） | 单机多实例、多 Agent 协作 | ⭐⭐⭐⭐ |
| **Level 3** | SQLite（共享数据库） | 单机单实例、轻量协作 | ⭐⭐⭐ |
| **Level 4** | 文件系统（消息队列） | 降级模式、无依赖测试 | ⭐⭐ |

---

## 2. 通信选择原则

### 2.1 高效通信优先

> **原则**：如果有高效通信方式可用，优先使用高效方式；文件系统仅用于需要被记录和追溯的内容。

**高效通信用途**：
- 实时心跳信号
- 任务分配通知
- 状态更新同步
- 阻塞告警

**文件通信用途**：
- 需求文档（`inbox/human_input.md`）
- 分析报告（`jira/tickets/{ID}/analysis-report.md`）
- PR 审查记录（`outbox/review_requests/`）
- 人类反馈（`inbox/human_feedback/`）
- Milestone 总结报告

### 2.2 降级策略

```
启动时检测
    │
    ▼
检测远程 Redis
    ├── 可用 → 使用远程 Redis（Level 1）
    └── 不可用 → 检测本地 Redis
            ├── 可用 → 使用本地 Redis（Level 2）
            └── 不可用 → 检测 SQLite
                    ├── 可用 → 使用 SQLite（Level 3）
                    └── 不可用 → 使用文件系统（Level 4）
```

---

## 3. 消息格式规范

### 3.1 实时消息（Redis/SQLite 传输）

```json
{
  "id": "msg_{timestamp}_{sequence}",
  "timestamp": "2026-04-10T15:30:00+08:00",
  "from": "{agent_type}_{instance_id}",
  "to": "master" | "{slaver_id}" | "broadcast",
  "type": "task_assignment" | "status_update" | "blocker_report" | "heartbeat",
  "priority": "critical" | "high" | "normal" | "low",
  "payload": {
    // 消息内容
  },
  "ttl_seconds": 3600
}
```

### 3.2 文件消息（文件系统传输）

**位置**：`shared/message_queue/{inbox,outbox,broadcast,dead_letter}/`

**命名**：`{type}_{timestamp}_{sender}.json`

```json
{
  "message": { /* 同上实时消息格式 */ },
  "file_status": "pending" | "processed" | "failed",
  "processed_at": null,
  "processed_by": null
}
```

---

## 4. 通信频道定义

### 4.1 Redis Pub/Sub 频道

| 频道名 | 用途 | 订阅者 |
|--------|------|--------|
| `eket:tasks:assign` | 任务分配通知 | Slaver 实例 |
| `eket:tasks:status` | 任务状态更新 | Master 实例 |
| `eket:agents:lifecycle` | Agent 生命周期事件（启动/停止） | 所有实例 |
| `eket:agents:heartbeat` | 心跳信号 | Master 实例 |
| `eket:blockers:alert` | 阻塞告警 | Master 实例 |
| `eket:broadcast` | 广播消息 | 所有实例 |

### 4.2 SQLite 表结构

```sql
-- 消息队列表
CREATE TABLE IF NOT EXISTS message_queue (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    type TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    payload TEXT NOT NULL,  -- JSON 字符串
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    processed_by TEXT
);

-- 心跳表
CREATE TABLE IF NOT EXISTS agent_heartbeat (
    agent_id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    last_heartbeat TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    metadata TEXT  -- JSON 字符串
);

-- 任务状态表
CREATE TABLE IF NOT EXISTS task_status (
    task_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    assigned_to TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT  -- JSON 字符串
);
```

---

## 5. 节点初始化流程

### 5.1 Master 节点初始化

```
1. 读取 .eket/config/connection.yml
   │
   ▼
2. 连接管理器初始化（四级降级）
   │
   ▼
3. 发布 lifecycle 事件：master_started
   │
   ▼
4. 订阅频道：
   - eket:tasks:status
   - eket:blockers:alert
   - eket:agents:lifecycle
   │
   ▼
5. 启动心跳定时器（每 30 秒发布 heartbeat）
   │
   ▼
6. 检查 inbox/human_input.md 是否有新需求
```

### 5.2 Slaver 节点初始化

```
1. 读取 .eket/config/connection.yml
   │
   ▼
2. 连接管理器初始化（四级降级）
   │
   ▼
3. 发布 lifecycle 事件：slaver_started_{agent_type}
   │
   ▼
4. 订阅频道：
   - eket:tasks:assign
   - eket:broadcast
   │
   ▼
5. 启动心跳定时器（每 15 秒发布 heartbeat）
   │
   ▼
6. 检查 jira/tickets/是否有 ready 状态任务
```

---

## 6. 通信故障处理

### 6.1 故障检测

| 故障类型 | 检测方法 | 判定标准 |
|----------|----------|----------|
| 通信中断 | 心跳超时 | 连续 3 次无心跳 |
| 消息丢失 | ACK 超时 | 发送后 60 秒无确认 |
| 连接断开 | 连接错误 | Redis/SQLite 连接失败 |

### 6.2 故障恢复

```
检测到故障
    │
    ▼
尝试重连（最多 3 次）
    ├── 成功 → 恢复正常通信
    └── 失败 → 降级到下一级
            │
            ▼
        检查下一级是否可用
            ├── 可用 → 切换通信方式，发送故障通知
            └── 不可用 → 继续降级
```

### 6.3 消息补偿

**死信队列**：`shared/message_queue/dead_letter/`

- 处理失败的消息移入死信队列
- Master 定期检查死信队列并重试
- 重试 3 次仍失败 → 生成 blocker 报告通知人类

---

## 7. 配置示例

### 7.1 远程 Redis 配置

```yaml
# .eket/config/connection.yml
fallback:
  remote_redis:
    enabled: true
    host: ${EKET_REMOTE_REDIS_HOST}
    port: 6379
    password: ${EKET_REDIS_PASSWORD:-""}
    db: 0

  local_redis:
    enabled: false

  sqlite:
    enabled: true
    path: ".eket/data/sqlite/eket.db"

  filesystem:
    enabled: true
    base_dir: ".eket/data/fs"
```

### 7.2 本地 Redis 配置

```yaml
# .eket/config/connection.yml
fallback:
  remote_redis:
    enabled: false

  local_redis:
    enabled: true
    host: localhost
    port: 6379

  sqlite:
    enabled: true
    path: ".eket/data/sqlite/eket.db"

  filesystem:
    enabled: true
    base_dir: ".eket/data/fs"
```

### 7.3 SQLite 配置

```yaml
# .eket/config/connection.yml
fallback:
  remote_redis:
    enabled: false

  local_redis:
    enabled: false

  sqlite:
    enabled: true
    path: ".eket/data/sqlite/eket.db"

  filesystem:
    enabled: true
    base_dir: ".eket/data/fs"
```

---

## 8. 性能对比

| 通信方式 | 延迟 | 吞吐量 | 并发实例 | 适用场景 |
|----------|------|--------|----------|----------|
| 远程 Redis | < 5ms | 10K+/s | 无限制 | 生产环境、多机协作 |
| 本地 Redis | < 2ms | 10K+/s | 10+ | 单机多实例开发 |
| SQLite | < 10ms | 1K+/s | 1-3 | 轻量开发、测试 |
| 文件系统 | > 100ms | 100/s | 1-2 | 降级模式、演示 |

---

## 9. 相关文档

- [`MASTER-HEARTBEAT-CHECKLIST.md`](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 心跳检查
- [`SLAVER-HEARTBEAT-CHECKLIST.md`](./SLAVER-HEARTBEAT-CHECKLIST.md) — Slaver 心跳检查
- [`MASTER-WORKFLOW.md`](../template/docs/MASTER-WORKFLOW.md) — Master 工作流程
- [`SLAVER-AUTO-EXEC-GUIDE.md`](../template/docs/SLAVER-AUTO-EXEC-GUIDE.md) — Slaver 自动执行指南

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-10
