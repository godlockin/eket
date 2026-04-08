# EKET 降级策略设计

**版本**: v2.3.0
**最后更新**: 2026-04-08

---

## 🎯 设计理念

EKET 采用**多层自动降级**策略，确保在任何环境下都能稳定运行。核心原则：

> **优雅降级，而非失败停止** - 当高级功能不可用时，自动降级到可用的低级功能，保证核心协作流程不中断。

---

## 📊 三级运行时降级

```
┌─────────────────────────────────────────────────────┐
│ Level 3: Redis + SQLite (满血版)                    │
│ - Redis Pub/Sub 实时消息                            │
│ - SQLite 持久化存储                                 │
│ - 分布式 Master 选举                                │
│ - 二级缓存 (内存 + Redis)                           │
└─────────────────────────────────────────────────────┘
           ↓ Redis 不可用或连接失败
┌─────────────────────────────────────────────────────┐
│ Level 2: Node.js + 文件队列 (增强版)                │
│ - 优化的文件队列 (去重、归档)                       │
│ - LRU 内存缓存                                      │
│ - 断路器和重试                                      │
│ - TypeScript 类型安全                               │
└─────────────────────────────────────────────────────┘
           ↓ Node.js 不可用或崩溃
┌─────────────────────────────────────────────────────┐
│ Level 1: Shell + 文件队列 (基础版)                  │
│ - 基础文件队列                                      │
│ - Master-Slaver 协作                                │
│ - 任务分配和心跳                                    │
│ - 纯 Bash 实现                                      │
└─────────────────────────────────────────────────────┘
           ↓ 所有失败
┌─────────────────────────────────────────────────────┐
│ 优雅退出 + 详细错误日志                             │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 降级触发条件

### Level 3 → Level 2 降级

**触发条件**：
1. Redis 连接超时（默认 5 秒）
2. Redis 连接拒绝（端口不可达）
3. Redis 认证失败
4. Redis 命令执行错误（连续 3 次）
5. SQLite 文件损坏或不可写

**自动操作**：
```typescript
// 消息队列自动降级
const queue = new MessageQueue({
  useRedis: true,
  fallbackToFile: true  // 自动降级到文件队列
});

// Redis 不可用时，透明降级
await queue.publish('tasks', message);
// ↑ 自动使用文件队列，无需改代码
```

**日志输出**：
```
[WARN] Redis connection failed: ECONNREFUSED localhost:6379
[INFO] Falling back to file queue
[INFO] Current level: Level 2 (Node.js + File Queue)
```

---

### Level 2 → Level 1 降级

**触发条件**：
1. Node.js 进程崩溃
2. `dist/index.js` 不存在（未构建）
3. 关键 Node.js 模块缺失（`ioredis`, `better-sqlite3`）
4. Node.js 版本过低（< 18.0.0）
5. 内存不足（使用率 > 90%）

**自动操作**：
```bash
# hybrid-adapter.sh 自动判断
if check_node_available; then
  node dist/index.js $command
else
  # 降级到 Shell 实现
  bash scripts/$command.sh
fi
```

**日志输出**：
```
[WARN] Node.js not available or version too low
[INFO] Falling back to Shell implementation
[INFO] Current level: Level 1 (Shell + File Queue)
```

---

## 🔄 四级连接降级（Level 3 内部）

Level 3 的 **ConnectionManager** 实现四级连接降级：

```
Level 3-A: Remote Redis (分布式)
  ↓ 远程 Redis 不可用
Level 3-B: Local Redis (本地)
  ↓ 本地 Redis 不可用
Level 3-C: SQLite (持久化)
  ↓ SQLite 不可用
Level 3-D: File Queue (离线)
```

### 代码实现

```typescript
import { ConnectionManager } from './core/connection-manager.js';

const conn = await ConnectionManager.getInstance();

// 自动尝试四级连接
const level = conn.getCurrentLevel();
// 返回: 'remote_redis' | 'local_redis' | 'sqlite' | 'file'

// 使用连接（透明降级）
await conn.publish('tasks', message);
```

### 降级决策表

| 条件 | 级别 | 说明 |
|------|------|------|
| `EKET_REMOTE_REDIS_HOST` 设置 + 连接成功 | Remote Redis | 分布式部署 |
| Remote Redis 失败 + Local Redis 成功 | Local Redis | 单机高性能 |
| Redis 全部失败 + SQLite 可用 | SQLite | 持久化降级 |
| SQLite 失败 + 文件系统可写 | File Queue | 最终降级 |
| 全部失败 | Error | 优雅退出 |

---

## 💓 Master 选举三级降级

Master 选举也采用三级降级策略：

```typescript
async function electMaster(instanceId: string): Promise<boolean> {
  // Level 1: Redis SETNX (最快)
  if (redisAvailable) {
    const result = await redis.set(
      'eket:master',
      instanceId,
      'NX',  // Only if Not eXists
      'EX', 30  // 30秒租约
    );
    if (result === 'OK') return true;
  }

  // Level 2: SQLite 行锁 (持久化)
  if (sqliteAvailable) {
    const result = db.run(`
      INSERT OR IGNORE INTO master_election (key, instance_id, expires_at)
      VALUES ('master', ?, datetime('now', '+30 seconds'))
    `, [instanceId]);
    if (result.changes > 0) return true;
  }

  // Level 3: 文件锁 (最后手段)
  try {
    fs.mkdirSync('.eket/master-lock');
    fs.writeFileSync('.eket/master-lock/instance', instanceId);
    return true;
  } catch (err) {
    return false;  // 其他实例已持有锁
  }
}
```

**选举降级表**：

| 方法 | 性能 | 可靠性 | 分布式支持 |
|------|------|--------|------------|
| Redis SETNX | 极快 (<1ms) | 高 | ✅ |
| SQLite 行锁 | 快 (<10ms) | 中 | ❌ |
| 文件 mkdir | 慢 (~50ms) | 低 | ❌ |

---

## 🔍 降级检测机制

### 健康检查

所有组件定期执行健康检查：

```typescript
// Redis 健康检查
setInterval(async () => {
  try {
    await redis.ping();
    redisHealth.status = 'healthy';
  } catch (err) {
    redisHealth.status = 'unhealthy';
    redisHealth.failureCount++;

    if (redisHealth.failureCount >= 3) {
      logger.warn('Redis unhealthy, triggering fallback');
      await triggerFallback('redis');
    }
  }
}, 10000);  // 每 10 秒
```

### 断路器模式

使用断路器防止级联故障：

```typescript
import { CircuitBreaker } from './core/circuit-breaker.js';

const redisBreaker = new CircuitBreaker({
  failureThreshold: 5,      // 5 次失败后打开
  cooldownPeriod: 30000,    // 30 秒冷却
  halfOpenRequests: 3       // 半开状态尝试 3 次
});

// 使用断路器保护 Redis 调用
const result = await redisBreaker.execute(async () => {
  return await redis.get('key');
});

if (!result.success) {
  // 断路器打开，自动降级
  return await fileQueue.get('key');
}
```

### 断路器状态机

```
┌──────────┐
│  Closed  │ ← 正常工作
└────┬─────┘
     │ 失败次数 >= threshold
     ▼
┌──────────┐
│  Open    │ ← 拒绝所有请求，立即降级
└────┬─────┘
     │ 冷却时间到
     ▼
┌──────────┐
│HalfOpen  │ ← 尝试恢复
└────┬─────┘
     │ 成功 → Closed
     │ 失败 → Open
```

---

## 📊 降级性能影响

### 消息传递延迟对比

| 级别 | 延迟 (P95) | 吞吐量 | 备注 |
|------|------------|--------|------|
| Level 3 (Redis Pub/Sub) | **0.5ms** | ~100k msg/s | 实时 |
| Level 2 (优化文件队列) | **1.3ms** | ~2k msg/s | 去重+归档 |
| Level 1 (基础文件队列) | **2.0ms** | ~500 msg/s | 基础功能 |

### Master 选举延迟对比

| 方法 | 延迟 (P95) | 可靠性 |
|------|------------|--------|
| Redis SETNX | **0.96ms** | 高 |
| SQLite 行锁 | **5ms** | 中 |
| 文件 mkdir | **50ms** | 低 |

### 缓存命中率对比

| 级别 | 内存缓存 | Redis 缓存 | 总命中率 |
|------|----------|------------|----------|
| Level 3 | ✅ | ✅ | ~95% |
| Level 2 | ✅ | ❌ | ~85% |
| Level 1 | ❌ | ❌ | 0% |

---

## 🛡️ 降级策略最佳实践

### 1. 优雅降级，而非功能缺失

**❌ 错误做法**：
```typescript
if (redisAvailable) {
  await sendMessage(message);
} else {
  throw new Error('Redis not available');  // 功能完全失效
}
```

**✅ 正确做法**：
```typescript
if (redisAvailable) {
  await redis.publish('tasks', message);
} else {
  // 降级到文件队列，功能仍可用
  await fileQueue.enqueue(message);
  logger.warn('Using file queue fallback');
}
```

### 2. 透明降级，无需代码改动

**❌ 错误做法**：
```typescript
// 业务代码需要知道降级逻辑
if (level === 'redis') {
  await redisQueue.send(msg);
} else if (level === 'file') {
  await fileQueue.send(msg);
}
```

**✅ 正确做法**：
```typescript
// 业务代码无感知，Queue 内部处理降级
await queue.send(msg);  // 自动选择可用实现
```

### 3. 及时告警，但不阻塞服务

**✅ 正确做法**：
```typescript
if (currentLevel === 'file' && previousLevel === 'redis') {
  // 降级发生，发送告警
  await alerting.send({
    level: 'warning',
    message: 'System degraded from Redis to File Queue',
    impact: 'Performance reduced, no data loss'
  });
  // 但服务继续运行
}
```

### 4. 定期尝试恢复

**✅ 正确做法**：
```typescript
// 每 30 秒尝试恢复 Redis 连接
setInterval(async () => {
  if (currentLevel === 'file') {
    const recovered = await tryRecoverRedis();
    if (recovered) {
      currentLevel = 'redis';
      logger.info('Recovered to Redis, system upgraded');
    }
  }
}, 30000);
```

---

## 🔧 配置降级行为

### 环境变量

```bash
# 启用/禁用自动降级
export EKET_AUTO_FALLBACK=true          # 默认: true

# Redis 降级配置
export EKET_REDIS_TIMEOUT=5000          # 连接超时 (ms)
export EKET_REDIS_RETRY_ATTEMPTS=3      # 重试次数
export EKET_REDIS_RETRY_DELAY=1000      # 重试间隔 (ms)

# 断路器配置
export EKET_CIRCUIT_BREAKER_THRESHOLD=5       # 失败阈值
export EKET_CIRCUIT_BREAKER_COOLDOWN=30000    # 冷却时间 (ms)

# 降级告警
export EKET_ALERT_ON_DEGRADATION=true   # 降级时发送告警
export EKET_ALERT_WEBHOOK_URL=          # Webhook URL
```

### 代码配置

```typescript
import { ConnectionManager } from './core/connection-manager.js';

const conn = await ConnectionManager.getInstance({
  redis: {
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
    autoFallback: true
  },
  circuitBreaker: {
    failureThreshold: 5,
    cooldownPeriod: 30000
  },
  alerting: {
    enabled: true,
    webhookUrl: process.env.ALERT_WEBHOOK_URL
  }
});
```

---

## 📊 降级监控

### 查看当前运行级别

```bash
# Level 1 (Shell)
./lib/adapters/hybrid-adapter.sh check

# Level 2/3 (Node.js)
node dist/index.js system:check
```

**输出示例**：
```
========================================
EKET System Check
========================================

Node.js:  ✅ v18.16.0
Redis:    ❌ Connection refused (localhost:6379)
SQLite:   ✅ /Users/xxx/.eket/data/sqlite/eket.db
Shell:    ✅ Bash 5.2.15

Current Level: Level 2 (Node.js + File Queue)
Fallback Status: Redis → File (degraded)
Performance Impact: -40% throughput, +60% latency
```

### 降级历史日志

```bash
# 查看降级事件
tail -100 logs/eket.log | grep -i "fallback\|degrad"

# 输出示例:
# 2026-04-08 14:30:15 WARN Redis connection failed, falling back to file queue
# 2026-04-08 14:30:15 INFO Current level degraded: Level 3 → Level 2
# 2026-04-08 14:32:45 INFO Redis connection recovered, upgrading to Level 3
```

---

## 🎓 降级场景示例

### 场景 1: Redis 维护窗口

**情况**：Redis 需要停机维护 30 分钟

**系统行为**：
```
14:00 - Redis 关闭
14:00 - 自动降级到 Level 2 (文件队列)
14:00 - 发送告警: "Redis degraded, file queue active"
14:00-14:30 - 系统以 Level 2 模式运行
14:30 - Redis 恢复
14:30 - 自动升级到 Level 3
14:30 - 发送通知: "Redis recovered"
```

**用户影响**：消息延迟略增，但功能完全正常

---

### 场景 2: Node.js 进程崩溃

**情况**：Node.js 进程因 OOM 崩溃

**系统行为**：
```
15:00 - Node.js 进程崩溃
15:00 - hybrid-adapter.sh 检测到 Node.js 不可用
15:00 - 自动降级到 Level 1 (Shell)
15:00 - Shell 脚本接管，继续处理文件队列
15:00 - 发送紧急告警: "Node.js crashed, Shell fallback"
15:05 - 运维人员修复并重启 Node.js
15:05 - 自动升级到 Level 2/3
```

**用户影响**：短暂中断（~1分钟），然后以 Shell 模式恢复

---

### 场景 3: 网络分区

**情况**：分布式部署，网络分区导致 Remote Redis 不可达

**系统行为**：
```
16:00 - Remote Redis 连接超时
16:00 - ConnectionManager 降级到 Local Redis
16:00 - 本地 Slaver 继续工作（单机模式）
16:00 - 发送告警: "Network partition detected"
16:30 - 网络恢复
16:30 - 自动重连 Remote Redis
16:30 - 恢复分布式模式
```

**用户影响**：本地任务继续执行，分布式协作暂停

---

## 🛠️ 降级测试

### 测试 Redis 降级

```bash
# 1. 启动 Level 3 模式
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine
node dist/index.js instance:start --role master

# 2. 验证 Level 3
node dist/index.js system:check
# 输出: Current Level: Level 3

# 3. 停止 Redis
docker stop eket-redis

# 4. 验证自动降级
node dist/index.js system:check
# 输出: Current Level: Level 2 (File Queue)

# 5. 恢复 Redis
docker start eket-redis

# 6. 验证自动恢复
node dist/index.js system:check
# 输出: Current Level: Level 3
```

### 测试 Node.js 降级

```bash
# 1. 启动 Level 2 模式
node dist/index.js instance:start --role master &
NODE_PID=$!

# 2. 验证 Level 2
./lib/adapters/hybrid-adapter.sh check
# 输出: Current Level: Level 2

# 3. 杀死 Node.js 进程
kill $NODE_PID

# 4. 验证自动降级
./lib/adapters/hybrid-adapter.sh check
# 输出: Current Level: Level 1 (Shell)

# 5. 使用 Shell 命令
./lib/adapters/hybrid-adapter.sh start --role master
# Shell 模式正常工作
```

---

## 📚 相关文档

- **[三级架构设计](./THREE-LEVEL-ARCHITECTURE.md)** - 完整架构说明
- **[连接管理器](./CONNECTION-MANAGER.md)** - 四级降级实现
- **[消息队列](./MESSAGE-QUEUE.md)** - Redis + 文件队列实现
- **[断路器模式](./CIRCUIT-BREAKER.md)** - 故障保护机制

---

**降级策略核心**：**可用性 > 性能 > 功能完整性**

在任何情况下，EKET 都能保证核心协作功能可用。

---

**版本**: v2.3.0
**最后更新**: 2026-04-08
**维护者**: EKET Framework Team
