# Phase B - EKET HTTP Server Implementation

**Version**: 1.0.0
**Status**: 🚧 In Progress
**Date**: 2026-04-07

---

## 概览

Phase B 实现 EKET Protocol v1.0.0 定义的完整 HTTP REST API Server，为各种 AI 工具（Claude Code, OpenCLAW, Cursor, Windsurf, Gemini 等）提供标准化的协作接口。

---

## 已完成工作

### 1. 协议定义 (Phase A) ✅

- ✅ **EKET_PROTOCOL_V1.md** - 完整协议规范
- ✅ **OpenAPI 3.0 Spec** - `docs/protocol/openapi.yaml`
- ✅ **JSON Schemas** - Agent Registration, Task, Message
- ✅ **Quick Start Guide** - 5 分钟入门指南

### 2. 核心服务器代码 ⚠️

**文件**: `node/src/api/eket-server.ts`

已创建但需要重构以适配现有基础设施：

**实现的功能**:
- ✅ Agent 注册与认证 (JWT)
- ✅ Agent 生命周期管理 (注册/注销/心跳)
- ✅ 任务查询与领取
- ✅ 消息队列 (POST/GET messages)
- ✅ PR 工作流 (Submit/Review/Merge)
- ✅ WebSocket 实时通信
- ✅ 健康检查端点

**需要重构的部分**:
- ⚠️ Redis 客户端集成 - 需要适配现有 `RedisClient` 类
- ⚠️ SQLite 客户端集成 - 需要适配现有 `SQLiteClient` 类
- ⚠️ 消息队列集成 - 需要使用现有 `createMessageQueue()` 和 `createMessage()`
- ⚠️ 错误处理 - 需要统一使用 `Result<T>` 类型

### 3. CLI 命令 ✅

**文件**: `node/src/commands/server-start.ts`

```bash
node dist/index.js server:start \
  --port 8080 \
  --host 0.0.0.0 \
  --jwt-secret <secret> \
  --heartbeat-interval 60 \
  --heartbeat-timeout 300
```

已集成到 `src/index.ts`:
```typescript
import { registerServerStart } from './commands/server-start.js';
// ...
registerServerStart(program);
```

---

## 架构设计

### 服务器层次结构

```
EKET HTTP Server (满血版)
├── HTTP Layer (Express)
│   ├── Agent Routes (/api/v1/agents/*)
│   ├── Task Routes (/api/v1/tasks/*)
│   ├── Message Routes (/api/v1/messages)
│   └── PR Routes (/api/v1/prs/*)
├── WebSocket Layer (ws)
│   └── Real-time messaging (/ws)
├── Auth Middleware (JWT)
├── Redis Integration (State Management)
│   ├── Agent Registry (agent:*)
│   ├── Task Store (task:*)
│   ├── PR Store (pr:*)
│   └── Message Queue (agent:*:messages)
└── SQLite Fallback (Offline Mode)
```

### 数据流

```
AI Tool (Claude Code/OpenCLAW/etc.)
    ↓ HTTP/WebSocket
EKET Server (Node.js)
    ↓ Redis/SQLite
State Management
    ↓ File System
三仓库 (confluence/jira/code_repo)
```

---

## 现有基础设施集成点

### 1. Redis Client (`core/redis-client.ts`)

**现有接口**:
```typescript
class RedisClient {
  async connect(): Promise<Result<void>>
  async disconnect(): Promise<void>
  async ping(): Promise<string>
  async registerSlaver(heartbeat: SlaverHeartbeat): Promise<Result<void>>
  async getActiveSlavers(): Promise<Result<SlaverHeartbeat[]>>
  async publishMessage(channel: string, message: string): Promise<Result<void>>
  async subscribeMessage(channel: string, onMessage: (msg: string) => void): Promise<Result<void>>
  getClient(): IORedisClient | IORedisClusterClient | null  // 获取底层 ioredis 客户端
}
```

**集成策略**:
- 使用 `getClient()` 获取底层 ioredis 实例
- 直接调用 ioredis 的 `hset`, `hget`, `sadd`, `smembers` 等方法
- 示例:
  ```typescript
  const redisClient = createRedisClient();
  await redisClient.connect();
  const ioredis = redisClient.getClient();
  if (ioredis) {
    await ioredis.hset('agent:xxx', 'status', 'active');
  }
  ```

### 2. SQLite Client (`core/sqlite-client.ts`)

**现有接口**:
```typescript
class SQLiteClient {
  query(sql: string, params?: unknown[]): Result<unknown[]>
  execute(sql: string, params?: unknown[]): Result<{ changes: number }>
  close(): void
}
```

**集成策略**:
- 创建 Agent/Task/PR 表结构
- 用作 Redis 降级备份

### 3. Message Queue (`core/message-queue.ts`)

**现有接口**:
```typescript
interface MessageQueue {
  connect(): Promise<Result<void>>
  disconnect(): Promise<void>
  publish(channel: string, message: Message): Promise<Result<void>>
  subscribe(channel: string, handler: MessageHandler): Promise<Result<void>>
}

function createMessageQueue(config?: Partial<MessageQueueConfig>): HybridMessageQueue
function createMessage(
  type: Message['type'],
  from: string,
  to: string,
  payload: Record<string, unknown>,
  priority?: Message['priority']
): Message
```

**集成策略**:
- 直接使用 `createMessage()` 创建消息
- 使用 `messageQueue.publish()` 发送消息
- 使用 `messageQueue.subscribe()` 订阅频道

---

## 下一步实施计划

### Step 1: 重构 eket-server.ts ✏️

**任务**:
1. 重写 Redis 集成部分，使用 `RedisClient.getClient()`
2. 添加 SQLite 降级逻辑
3. 集成现有 `createMessageQueue()` 和 `createMessage()`
4. 统一错误处理为 `Result<T>` 类型

**预计工作量**: 4-6 小时

### Step 2: 创建 API 端点测试 🧪

**文件**: `node/tests/api/eket-server.test.ts`

测试覆盖:
- Agent 注册流程
- 任务查询与领取
- 消息发送与接收
- PR 提交与审核
- WebSocket 连接

**预计工作量**: 3-4 小时

### Step 3: 集成验证 ✅

**验证清单**:
- [ ] 启动服务器 (`npm run dev -- server:start`)
- [ ] 健康检查 (`curl http://localhost:8080/health`)
- [ ] Agent 注册 (`POST /api/v1/agents/register`)
- [ ] 任务查询 (`GET /api/v1/tasks`)
- [ ] 消息发送 (`POST /api/v1/messages`)
- [ ] WebSocket 连接 (`ws://localhost:8080/ws?instance_id=xxx`)

**预计工作量**: 2-3 小时

### Step 4: 文档与示例 📚

**创建文件**:
- `docs/guides/http-server-setup.md` - 服务器部署指南
- `docs/guides/api-usage-examples.md` - API 使用示例
- `examples/http-mode/` - 完整示例代码
  - `examples/http-mode/register-agent.sh` - Shell curl 示例
  - `examples/http-mode/python-client.py` - Python SDK 示例
  - `examples/http-mode/js-client.js` - JavaScript SDK 示例

**预计工作量**: 4-5 小时

---

## 技术债务

### 需要解决的问题

1. **类型不匹配** ⚠️
   - `createRedisClient()` 返回 `RedisClient` 对象，不是 `Result<RedisClient>`
   - `createSQLiteClient()` 返回 `SQLiteClient` 对象，不是 `Result<SQLiteClient>`
   - **解决方案**: 使用 try-catch 包装，或修改工厂函数返回值

2. **消息队列配置** ⚠️
   - `createMessageQueue({ projectRoot: ... })` 不支持 `projectRoot` 参数
   - **解决方案**: 检查 `MessageQueueConfig` 接口，使用正确参数

3. **依赖缺失** ⚠️
   - 需要安装: `express`, `ws`, `jsonwebtoken`, `@types/express`, `@types/ws`, `@types/jsonwebtoken`
   - **状态**: 已安装 ✅

4. **编译错误** ⚠️
   - 当前编译有多个类型错误
   - **优先级**: P0 (必须解决)

---

## 与 OpenCLAW Gateway 的关系

**现有文件**: `node/src/api/openclaw-gateway.ts`

**区别**:
| 特性 | EKET Server | OpenCLAW Gateway |
|------|-------------|------------------|
| 协议 | EKET Protocol v1.0.0 (Universal) | OpenCLAW API (Specific) |
| 适用范围 | 所有 AI 工具 | 仅 OpenCLAW |
| 功能 | 完整 Agent 协作协议 | 协议转换层 |
| 端口 | 8080 (default) | 8899 (default) |

**关系**:
- EKET Server 是通用协议层
- OpenCLAW Gateway 是 EKET Server 的一个特化适配器
- 两者可共存，OpenCLAW Gateway 内部调用 EKET Server API

---

## 性能指标

### 预期性能

| 指标 | 目标值 |
|------|--------|
| Agent 注册延迟 | < 100ms |
| 任务查询延迟 | < 50ms |
| 消息投递延迟 | < 20ms |
| WebSocket 延迟 | < 10ms |
| 并发 Agent 数 | 100+ |
| 并发请求数 (RPS) | 1000+ |

### 监控指标

- HTTP 请求响应时间 (P50/P95/P99)
- WebSocket 连接数
- Redis 命令执行时间
- 消息队列延迟
- 错误率

---

## 安全性

### 已实现

- ✅ JWT 认证 (所有 API 端点除 /health 和 /register)
- ✅ Token 过期时间 (7 天)
- ✅ 请求日志记录

### 待实现

- [ ] Rate Limiting (每 IP 限流)
- [ ] API Key 管理 (用于服务间调用)
- [ ] HTTPS 支持 (生产环境)
- [ ] CORS 配置
- [ ] 请求参数验证 (JSON Schema)

---

## 部署

### 开发环境

```bash
# 启动 Redis (Docker)
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine

# 启动 EKET Server
cd node
npm run build
node dist/index.js server:start --port 8080
```

### 生产环境

```bash
# 使用环境变量配置
export EKET_JWT_SECRET=<secure-random-secret>
export EKET_REDIS_HOST=redis.example.com
export EKET_REDIS_PORT=6379
export EKET_REDIS_PASSWORD=<redis-password>

# 启动服务器
node dist/index.js server:start \
  --port 8080 \
  --host 0.0.0.0
```

### Docker 部署

```dockerfile
# Dockerfile (待创建)
FROM node:20-alpine
WORKDIR /app
COPY node/package*.json ./
RUN npm ci --production
COPY node/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js", "server:start"]
```

---

## 相关文档

- [EKET Protocol Specification](../protocol/EKET_PROTOCOL_V1.md)
- [OpenAPI Specification](../protocol/openapi.yaml)
- [Quick Start Guide](../protocol/QUICKSTART.md)
- [Architecture Design](./2026-04-06-optimization-loop-design.md)

---

## 总结

Phase B (HTTP Server 实现) 的核心代码框架已完成，但需要重构以适配现有基础设施。主要挑战是 Redis/SQLite 客户端集成和错误处理统一。

**下一阶段**:
1. 修复编译错误
2. 完成 Redis/SQLite 集成
3. 编写集成测试
4. 创建示例代码

**预计完成时间**: 2-3 个工作日

---

**Last Updated**: 2026-04-07
**Author**: EKET Framework Team
