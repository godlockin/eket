# EKET v0.7 Phase 2 实施文档

**版本**: 0.7.0
**日期**: 2026-03-25
**阶段**: Phase 2 - 核心功能实现

---

## 概述

Phase 2 实现了 EKET 框架的核心功能，包括：
1. 项目初始化向导
2. 消息队列模块
3. Slaver 心跳监控

---

## 新增模块

### 1. 项目初始化向导 (`node/src/commands/init-wizard.ts`)

**功能**:
- 交互式配置三个 Git 仓库（confluence/jira/code_repo）
- 支持认证信息配置（用户名/Token）
- Redis 配置（可选）
- SQLite 配置（可选）
- 自动生成 `.eket/config.yml`
- 创建必要目录结构

**使用方式**:
```bash
# Node.js CLI
node node/dist/index.js init

# 或指定项目路径
node node/dist/index.js init -p /path/to/project
```

**配置流程**:
```
========================================
  EKET 项目初始化向导
========================================

=== 基本信息 ===
项目名称 [my-project]:
组织名称 [my-org]:

=== 配置 文档仓库 ===
Confluence Git 仓库 URL:
默认分支名 [main]:
需要认证吗？ [Y/n]:
用户名:
Access Token / Password:

=== 配置 任务管理仓库 ===
Jira Git 仓库 URL:
...

=== 配置 Redis（可选）===
Redis 用于 Slaver 心跳监控和消息队列
启用 Redis 吗？ [y/N]:

=== 配置 SQLite（可选）===
SQLite 用于 Retrospective 数据持久化
启用 SQLite 吗？ [Y/n]:
```

**生成的配置**:
```yaml
# .eket/config/config.yml
project:
  name: "my-project"
  organization: "my-org"

repositories:
  confluence:
    url: "https://github.com/org/project-confluence.git"
    branch: "main"
    username: "user"
    token: "ghp_xxx"
  jira:
    url: "https://github.com/org/project-jira.git"
    branch: "main"
  code_repo:
    url: "https://github.com/org/project-code.git"
    branch: "main"

redis:
  enabled: true
  host: "localhost"
  port: 6379
  password: "xxx"
  db: 0

sqlite:
  enabled: true
  path: "/path/to/project/.eket/data/sqlite/eket.db"
```

---

### 2. 消息队列模块 (`node/src/core/message-queue.ts`)

**功能**:
- Redis 消息队列实现
- 文件队列降级模式
- 混合模式（自动降级）
- 支持订阅/发布模式

**架构**:
```
┌─────────────────────────────────────────────────────────┐
│                    混合消息队列                           │
├─────────────────────────────────────────────────────────┤
│  模式检测                                                │
│     │                                                    │
│     ├─→ Redis 可用 → RedisMessageQueue                  │
│     │                                                    │
│     └─→ Redis 不可用 → FileMessageQueue (降级)          │
└─────────────────────────────────────────────────────────┘
```

**使用方式**:
```typescript
import { createMessageQueue, createMessage } from './core/message-queue.js';

// 创建消息队列（自动降级）
const mq = createMessageQueue({ mode: 'auto' });

// 连接
await mq.connect();

// 订阅通道
await mq.subscribe('task_updates', (message) => {
  console.log('收到消息:', message);
});

// 发送消息
const msg = createMessage(
  'task_claimed',      // 消息类型
  'agent_frontend',    // 发送者
  'coordinator',       // 接收者
  { ticket_id: 'FEAT-123' },
  'normal'             // 优先级
);
await mq.publish('task_updates', msg);

// 断开
await mq.disconnect();
```

**CLI 测试**:
```bash
# 测试消息队列
node node/dist/index.js mq:test
```

---

### 3. Slaver 心跳监控 (`node/src/core/heartbeat-monitor.ts`)

**功能**:
- `SlaverHeartbeatManager`: Slaver 端心跳发送
- `ActiveSlaverMonitor`: 监控端活跃状态检查
- 可配置心跳间隔和超时时间
- 支持状态更新（active/busy/offline）

**心跳流程**:
```
Slaver 实例                     Redis                      监控端
    │                            │                           │
    ├──── 发送心跳 (10s) ───────→│                           │
    │                            │                           │
    │                            ├──── 获取活跃列表 ────────→│
    │                            │                           │
    │                            │   检测超时 (30s)          │
    │                            │                           │
```

**使用方式**:
```typescript
// Slaver 端
import { createHeartbeatManager } from './core/heartbeat-monitor.js';

const manager = createHeartbeatManager('slaver_frontend_001', {
  heartbeatInterval: 10000,  // 10 秒心跳
  heartbeatTimeout: 30000,   // 30 秒超时
});

await manager.start();

// 更新状态
manager.setStatus('busy', 'FEAT-123');

// 停止
await manager.stop();
```

```typescript
// 监控端
import { createSlaverMonitor } from './core/heartbeat-monitor.js';

const monitor = createSlaverMonitor();
await monitor.start();

// 获取活跃 Slaver
const result = await monitor.getActiveSlavers();
console.log(result.data);

// 检查是否离线
const isOffline = await monitor.isOffline('slaver_frontend_001');
```

**CLI 命令**:
```bash
# 启动心跳
node node/dist/index.js heartbeat:start slaver_frontend_001

# 查看状态
node node/dist/index.js heartbeat:status
```

---

## 新增 CLI 命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `init` | 项目初始化向导 | `node node/dist/index.js init` |
| `claim` | 领取任务 | `node node/dist/index.js claim FEAT-123` |
| `claim --auto` | 自动领取任务 | `node node/dist/index.js claim --auto` |
| `heartbeat:start <id>` | 启动心跳 | `node node/dist/index.js heartbeat:start slaver_001` |
| `heartbeat:status` | 查看心跳状态 | `node node/dist/index.js heartbeat:status` |
| `mq:test` | 测试消息队列 | `node node/dist/index.js mq:test` |

---

## 目录结构

```
node/
├── src/
│   ├── commands/
│   │   ├── claim.ts              # 任务领取命令
│   │   ├── claim-helpers.ts      # claim 辅助函数
│   │   └── init-wizard.ts        # 初始化向导
│   ├── core/
│   │   ├── redis-client.ts       # Redis 客户端
│   │   ├── sqlite-client.ts      # SQLite 客户端
│   │   ├── message-queue.ts      # 消息队列
│   │   └── heartbeat-monitor.ts  # 心跳监控
│   ├── utils/
│   │   ├── execFileNoThrow.ts    # 安全执行工具
│   │   └── process-cleanup.ts    # 进程清理工具
│   ├── types/
│   │   └── index.ts              # 类型定义
│   └── index.ts                  # CLI 入口
├── package.json
└── tsconfig.json
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_REDIS_PASSWORD` | Redis 密码 | - |

---

## 降级策略

### 消息队列降级
```
Redis 可用 → 使用 Redis Pub/Sub
    ↓ (不可用)
文件队列 → 写入 .eket/data/queue/*.json
    ↓ (轮询处理)
```

### 心跳监控降级
```
Redis 可用 → 存储在 Redis (slaver:{id}:heartbeat)
    ↓ (不可用)
文件心跳 → 写入 .eket/state/heartbeats/*.json
```

---

## 下一步 (Phase 3)

- [x] PR 提交命令 (`submit-pr`)
- [x] 三仓库自动克隆 (`init-three-repos.sh`) - 从 config.yml 读取配置
- [x] 文件队列持久化优化 (FileQueueManager with deduplication)
- [x] 端到端测试准备完成

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-25
