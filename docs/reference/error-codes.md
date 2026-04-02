# EKET Framework 错误码参考

**版本**: 2.0.0
**最后更新**: 2026-04-02

---

## 目录

1. [错误码分类](#错误码分类)
2. [完整错误码列表](#完整错误码列表)
3. [错误处理最佳实践](#错误处理最佳实践)

---

## 错误码分类

| 分类 | 前缀 | 数量 | 说明 |
|------|------|------|------|
| 通用错误 | - | 3 | 基础错误类型 |
| Redis 相关 | `REDIS_*` | 2 | Redis 连接和操作 |
| SQLite 相关 | `SQLITE_*` | 2 | SQLite 连接和操作 |
| 任务相关 | `TASK_*` | 3 | 任务管理 |
| 票务相关 | `TICKET_*` | 2 | 票务管理 |
| 依赖分析 | `DEPENDENCY_*` | 1 | 依赖分析 |
| 告警相关 | `ALERT_*` | 4 | 告警系统 |
| 消息队列 | `MESSAGE_QUEUE_*` | 1 | 消息队列 |
| 数据库 | `DB_*` | 1 | 通用数据库 |
| 知识条目 | `ENTRY_*` | 6 | 知识库系统 |
| 工作流 | `WORKFLOW_*` | 3 | 工作流引擎 |
| 通信协议 | `PROTOCOL_*`, `MESSAGE_*` | 3 | 通信协议 |
| 锁管理 | `LOCK_*`, `QUEUE_*` | 5 | 资源锁 |
| 推荐系统 | `RECOMMENDATION_*` | 1 | 推荐系统 |
| 错误恢复 | `CIRCUIT_*`, `MAX_RETRIES_*`, `EXECUTION_*` | 3 | 断路器和重试 |
| 缓存优化 | `CACHE_*`, `REDIS_POOL_*` | 4 | 缓存层 |
| 文件队列 | `DUPLICATE_*`, `FILE_*`, `CHECKSUM_*` | 4 | 文件队列 |
| 连接管理 | `CONNECTION_*`, `*_NOT_CONFIGURED`, `*_CONNECT_FAILED` | 7 | 连接降级 |
| Master 选举 | `ELECTION_*`, `MASTER_*`, `CONFLICT_*`, `LEASE_*`, `NOT_MASTER` | 5 | Master 选举 |

**总计**: 57 个错误码

---

## 完整错误码列表

### 通用错误

#### `UNKNOWN_ERROR`

**说明**: 未知错误

**可能原因**:
- 未预期的异常情况
- 错误未正确分类

**解决方案**:
```typescript
// 查看详细错误上下文
console.error('Error context:', error.context);

// 提交 Issue 报告此错误
```

---

#### `NOT_IMPLEMENTED`

**说明**: 功能未实现

**可能原因**:
- 调用了未实现的方法
- 使用了占位符代码

**解决方案**:
```typescript
// 检查代码版本，确认功能是否已实现
// 如果是预期行为，使用条件检查避免调用
if (!feature.isImplemented()) {
  // 使用替代方案
}
```

---

#### `NOT_SUPPORTED`

**说明**: 功能不支持

**可能原因**:
- 在当前模式下不支持该功能
- 配置不允许该操作

**解决方案**:
```typescript
// 检查当前配置和模式
if (config.supportsFeature('xxx')) {
  // 执行操作
}
```

---

### Redis 相关

#### `REDIS_NOT_CONNECTED`

**说明**: Redis 未连接

**可能原因**:
- Redis 服务未启动
- 连接配置错误
- 网络问题

**解决方案**:
```bash
# 1. 检查 Redis 服务
redis-cli ping

# 2. 检查配置
echo $EKET_LOCAL_REDIS_HOST

# 3. 重启 Redis
systemctl restart redis
```

---

#### `REDIS_OPERATION_FAILED`

**说明**: Redis 操作失败

**可能原因**:
- Redis 命令执行失败
- 内存不足
- Key 不存在

**解决方案**:
```typescript
// 检查具体错误信息
try {
  await redis.get(key);
} catch (err) {
  console.error('Redis operation failed:', err.message);
  // 使用降级方案
}
```

---

### SQLite 相关

#### `SQLITE_NOT_CONNECTED`

**说明**: SQLite 未连接

**可能原因**:
- SQLite 文件不存在
- 权限不足
- 磁盘空间满

**解决方案**:
```bash
# 1. 检查 SQLite 文件
ls -la ~/.eket/data/sqlite/eket.db

# 2. 检查权限
chmod 755 ~/.eket/data/sqlite/

# 3. 检查磁盘空间
df -h
```

---

#### `SQLITE_OPERATION_FAILED`

**说明**: SQLite 操作失败

**可能原因**:
- SQL 语法错误
- 表不存在
- 约束违反

**解决方案**:
```typescript
// 检查具体错误信息
try {
  db.run('INSERT INTO ...');
} catch (err) {
  console.error('SQLite operation failed:', err.message);
  // 检查 SQL 语句和表结构
}
```

---

### 任务相关

#### `TASK_NOT_FOUND`

**说明**: 任务不存在

**可能原因**:
- 任务 ID 错误
- 任务已被删除
- 任务未同步

**解决方案**:
```typescript
// 验证任务 ID
const task = await getTask(taskId);
if (!task) {
  // 刷新任务列表或检查 ID
  await refreshTasks();
}
```

---

#### `TASK_ALREADY_CLAIMED`

**说明**: 任务已被领取

**可能原因**:
- 其他实例已领取该任务
- 锁未释放

**解决方案**:
```bash
# 1. 等待任务释放（有超时机制）
# 2. 检查锁状态
ls -la .eket/state/locks/
# 3. 如有必要，清理锁
rm -rf .eket/state/locks/
```

---

#### `TASK_CLAIM_FAILED`

**说明**: 任务领取失败

**可能原因**:
- 并发领取冲突
- 锁获取失败
- 任务状态变更

**解决方案**:
```typescript
// 重试领取（带退避）
const result = await retryExecutor.execute(
  () => claimTask(taskId),
  'claim-task'
);
```

---

### 票务相关

#### `TICKET_NOT_FOUND`

**说明**: 票证不存在

**可能原因**:
- 票证 ID 错误
- 票证未同步

**解决方案**:
```bash
# 检查 Jira 票证是否存在
# 刷新票证列表
```

---

#### `TICKET_UPDATE_FAILED`

**说明**: 票证更新失败

**可能原因**:
- API 调用失败
- 权限不足
- 状态转换非法

**解决方案**:
```typescript
// 检查票证状态转换
// 验证 API 权限
```

---

### 依赖分析

#### `DEPENDENCY_ANALYSIS_FAILED`

**说明**: 依赖分析失败

**可能原因**:
- 依赖图构建失败
- 循环依赖检测错误

**解决方案**:
```bash
# 检查项目依赖配置
cat .eket/config/dependencies.yml
```

---

### 告警相关

#### `ALERT_RULE_NOT_FOUND`

**说明**: 告警规则不存在

**解决方案**:
```typescript
// 检查规则配置
// 确保规则已注册
```

---

#### `ALERT_RULE_DISABLED`

**说明**: 告警规则已禁用

**解决方案**:
```typescript
// 启用规则
await alerting.enableRule(ruleId);
```

---

#### `ALERT_IN_COOLDOWN`

**说明**: 告警在冷却期

**说明**: 同一告警在冷却期内不会重复触发

**解决方案**:
```typescript
// 等待冷却期结束
// 或调整冷却时间配置
```

---

#### `ALERT_NOT_FOUND`

**说明**: 告警不存在

**解决方案**:
```bash
# 检查告警列表
/eket-cli alerts:status
```

---

### 消息队列

#### `MESSAGE_QUEUE_ERROR`

**说明**: 消息队列错误

**可能原因**:
- 队列操作失败
- 消息格式错误

**解决方案**:
```typescript
// 检查消息格式
// 查看队列状态
```

---

### 数据库

#### `DB_NOT_CONNECTED`

**说明**: 数据库未连接

**解决方案**:
```bash
# 检查数据库配置和连接状态
```

---

### 知识条目

#### `ENTRY_CREATE_FAILED`

**说明**: 知识条目创建失败

**解决方案**:
```typescript
// 检查条目内容是否完整
// 验证权限
```

---

#### `ENTRY_FETCH_FAILED`

**说明**: 知识条目获取失败

---

#### `ENTRY_QUERY_FAILED`

**说明**: 知识条目查询失败

---

#### `ENTRY_UPDATE_FAILED`

**说明**: 知识条目更新失败

---

#### `ENTRY_DELETE_FAILED`

**说明**: 知识条目删除失败

---

#### `ENTRY_NOT_FOUND`

**说明**: 知识条目不存在

---

### 工作流

#### `WORKFLOW_NOT_FOUND`

**说明**: 工作流不存在

---

#### `WORKFLOW_NOT_RUNNING`

**说明**: 工作流未运行

---

#### `WORKFLOW_NOT_PAUSED`

**说明**: 工作流未暂停

---

### 通信协议

#### `PROTOCOL_NOT_CONNECTED`

**说明**: 通信协议未连接

---

#### `MESSAGE_SEND_FAILED`

**说明**: 消息发送失败

---

#### `MESSAGE_SEND_ERROR`

**说明**: 消息发送错误

---

### 锁管理

#### `LOCK_QUEUED`

**说明**: 锁请求已排队

---

#### `NOT_LOCK_HOLDER`

**说明**: 不是锁持有者

---

#### `LOCK_RELEASE_FAILED`

**说明**: 锁释放失败

---

#### `LOCK_STATUS_FAILED`

**说明**: 锁状态查询失败

---

#### `QUEUE_LENGTH_FAILED`

**说明**: 队列长度查询失败

---

### 推荐系统

#### `RECOMMENDATION_FAILED`

**说明**: 推荐失败

---

### 错误恢复（Phase 7）

#### `CIRCUIT_OPEN`

**说明**: 断路器已打开，快速失败

**可能原因**:
- 失败次数超过阈值
- 下游服务不可用

**解决方案**:
```typescript
// 等待断路器自动恢复（超时后进入半开状态）
// 或手动重置
circuitBreaker.reset();

// 检查下游服务状态
```

---

#### `MAX_RETRIES_EXCEEDED`

**说明**: 超过最大重试次数

**可能原因**:
- 问题持续存在
- 重试配置不当

**解决方案**:
```typescript
// 检查根本原因
// 调整重试配置
const executor = createRetryExecutor({
  maxRetries: 5,         // 增加重试次数
  initialDelay: 1000,    // 增加初始延迟
  maxDelay: 10000,       // 增加最大延迟
});
```

---

#### `EXECUTION_ERROR`

**说明**: 执行错误

**可能原因**:
- 操作执行失败
- 运行时错误

**解决方案**:
```typescript
// 查看详细错误上下文
console.error('Execution error:', error.context);
```

---

### 缓存优化（Phase 7）

#### `CACHE_MISS`

**说明**: 缓存未命中

**说明**: 这不是错误，是正常情况，会回源加载数据

---

#### `CACHE_PENETRATION`

**说明**: 缓存穿透

**可能原因**:
- 查询不存在的数据
- 恶意攻击

**解决方案**:
```typescript
// 使用 getOrCompute 防止穿透
const value = await cache.getOrCompute(
  key,
  () => computeValue(),
  300000  // 5 分钟 TTL
);
```

---

#### `REDIS_POOL_EXHAUSTED`

**说明**: Redis 连接池耗尽

**可能原因**:
- 并发请求过多
- 连接泄漏

**解决方案**:
```typescript
// 增加连接池大小
const pool = createRedisConnectionPool({
  poolSize: 20,  // 增加连接数
});

// 检查连接泄漏（确保释放连接）
pool.release(connection);
```

---

#### `REDIS_POOL_INIT_FAILED`

**说明**: Redis 连接池初始化失败

---

### 文件队列优化（Phase 7）

#### `DUPLICATE_MESSAGE`

**说明**: 重复消息

**可能原因**:
- 消息已存在于去重队列

**解决方案**:
```typescript
// 检查消息 ID 是否已处理
// 清理去重缓存（如果需要）
```

---

#### `FILE_LOCK_FAILED`

**说明**: 文件锁获取失败

**解决方案**:
```bash
# 清理残留锁
rm -rf .eket/data/queue/*.lock
```

---

#### `CHECKSUM_MISMATCH`

**说明**: 校验和不匹配

**可能原因**:
- 文件损坏
- 数据被篡改

**解决方案**:
```typescript
// 从备份恢复
// 重新生成数据
```

---

#### `FILE_CORRUPTED`

**说明**: 文件损坏

---

### 连接管理（Phase 9.1）

#### `CONNECTION_FAILED`

**说明**: 所有连接级别都失败

**可能原因**:
- 所有后端服务不可用
- 配置完全错误

**解决方案**:
```bash
# 1. 检查所有配置
env | grep EKET

# 2. 至少确保一种连接可用
# Redis: systemctl start redis
# SQLite: 确保目录可写
# File: 确保目录存在
```

---

#### `REMOTE_REDIS_NOT_CONFIGURED`

**说明**: 未配置远程 Redis

**解决方案**:
```bash
# 配置远程 Redis
export EKET_REMOTE_REDIS_HOST=redis-cluster.example.com
export EKET_REMOTE_REDIS_PORT=6380
export EKET_REMOTE_REDIS_PASSWORD=xxx
```

---

#### `LOCAL_REDIS_NOT_CONFIGURED`

**说明**: 未配置本地 Redis

**解决方案**:
```bash
# 配置本地 Redis
export EKET_LOCAL_REDIS_HOST=localhost
export EKET_LOCAL_REDIS_PORT=6379
```

---

#### `SQLITE_CONNECT_FAILED`

**说明**: SQLite 连接失败

---

#### `FILE_CONNECT_FAILED`

**说明**: 文件系统连接失败

**解决方案**:
```bash
# 确保目录存在且可写
mkdir -p .eket/data/queue
chmod 755 .eket/data/queue
```

---

#### `UPGRADE_FAILED`

**说明**: 连接升级失败

**说明**: 尝试从低级连接升级到高级连接失败

---

#### `DOWNGRADE_FAILED`

**说明**: 连接降级失败

**说明**: 降级到备用连接失败，这是严重问题

---

### Master 选举（Phase 9.1）

#### `ELECTION_FAILED`

**说明**: Master 选举失败

**可能原因**:
- 所有选举级别都失败
- 配置错误

**解决方案**:
```bash
# 1. 清理锁文件
rm -rf .eket/state/master_lock/
rm confluence/.eket_master_marker

# 2. 重新启动实例
node dist/index.js start-instance
```

---

#### `MASTER_ALREADY_EXISTS`

**说明**: Master 已存在

**说明**: 这不是错误，表示当前实例应作为 Slaver 运行

---

#### `CONFLICT_DETECTED`

**说明**: 检测到冲突

**可能原因**:
- 多个实例同时声明为 Master
- 声明等待期检测到其他 Master

**解决方案**:
```typescript
// 自动降级为 Slaver
// 等待下次选举
```

---

#### `LEASE_RENEWAL_FAILED`

**说明**: 租约续期失败

**可能原因**:
- 锁已过期
- 网络问题

**解决方案**:
```typescript
// Master 会自动放弃身份
// 触发新的选举
```

---

#### `NOT_MASTER`

**说明**: 当前实例不是 Master

**说明**: 尝试执行 Master 专属操作时返回

---

## 错误处理最佳实践

### 1. 使用类型守卫

```typescript
// ✓ 好的做法
} catch (e: unknown) {
  if (isEketError(e)) {
    console.error('Error code:', e.code);
    console.error('Error message:', e.message);
    console.error('Error context:', e.context);
  } else {
    console.error('Unknown error:', e);
  }
}

// ✗ 避免的做法
} catch (e: any) {
  console.error(e);
}
```

### 2. 提供上下文信息

```typescript
// ✓ 好的做法
return {
  success: false,
  error: new EketError(
    'TASK_CLAIM_FAILED',
    `Failed to claim task ${taskId}: ${errorMessage}`,
    { taskId, instanceId, timestamp: Date.now() }
  ),
};

// ✗ 避免的做法
return {
  success: false,
  error: new EketError('TASK_CLAIM_FAILED', 'Failed'),
};
```

### 3. 使用重试执行器

```typescript
// 对可恢复错误使用重试
const executor = createRetryExecutor({
  maxRetries: 3,
  initialDelay: 500,
  maxDelay: 5000,
  retryableErrors: [
    'REDIS_CONNECTION_FAILED',
    'SQLITE_OPERATION_FAILED',
    'CONNECTION_FAILED',
  ],
});

const result = await executor.execute(
  () => redisOperation(),
  'redis-operation'
);
```

### 4. 使用断路器

```typescript
// 对下游服务使用断路器
const breaker = createCircuitBreaker({
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
});

const result = await breaker.execute(() => callDownstream());
```

### 5. 记录结构化的错误日志

```typescript
// 结构化日志便于分析
logger.error({
  level: 'error',
  code: error.code,
  message: error.message,
  context: error.context,
  stack: error.stack,
  timestamp: new Date().toISOString(),
});
```

---

## 相关文档

- [API 参考](../api/README.md)
- [故障排查指南](../troubleshooting/common-issues.md)
- [类型定义](../../node/src/types/index.ts)

---

**文档维护**: EKET Framework Team
