# EKET Framework 架构审查报告

**版本**: 0.9.2
**审查日期**: 2026-03-30
**审查范围**: Phase 7 & Phase 9.1 核心模块
**审查者**: Claude Code AI

---

## 执行摘要

本次审查覆盖了 EKET 框架 v0.9.1/v0.9.2 版本的 7 个核心模块，包括连接管理、Master 选举、断路器、缓存层、OpenCLAW 集成和 Skills 注册表。整体架构设计展现了较高的工程水准，特别是在**降级策略**、**分布式协调**和**错误恢复**方面。然而，也存在一些需要关注的类型安全、资源泄漏和错误处理问题。

### 总体评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | 8.5/10 | 四级降级、三级选举设计优秀 |
| 类型安全 | 6.5/10 | 存在 `any` 使用和类型守卫不足 |
| 错误处理 | 7.0/10 | 大部分良好，部分模块需改进 |
| 资源管理 | 6.0/10 | 存在 Timer 和连接泄漏风险 |
| 代码质量 | 7.5/10 | 整体良好，部分细节需完善 |

---

## 1. 架构优点

### 1.1 四级降级策略（ConnectionManager）

**位置**: `node/src/core/connection-manager.ts`

**优点**:
- **渐进式降级**: 远程 Redis → 本地 Redis → SQLite → 文件系统，每级都有明确的降级条件
- **可升级**: 支持从低级连接自动升级到高级别连接（`tryUpgrade()` 方法）
- **统计追踪**: 记录 `fallbackCount` 和 `lastFallbackTime`，便于运维监控
- **防御性配置**: 使用 `JSON.parse(JSON.stringify(config))` 防止外部修改

**代码示例**:
```typescript
async initialize(): Promise<Result<ConnectionLevel>> {
  // 1. 尝试远程 Redis
  if (this.config.remoteRedis) {
    const result = await this.tryConnectRemoteRedis();
    if (result.success) {
      this.currentLevel = 'remote_redis';
      return { success: true, data: this.currentLevel };
    }
  }
  // 2. 尝试本地 Redis (降级)
  // 3. 尝试 SQLite (再降级)
  // 4. 最终降级到文件系统
}
```

### 1.2 三级 Master 选举机制（MasterElection）

**位置**: `node/src/core/master-election.ts`

**优点**:
- **分布式锁**: Redis SETNX / SQLite 事务 / File mkdir 三级降级
- **声明等待期**: 2 秒检测窗口防止多 Master 同时产生
- **租约续期**: 每 15 秒自动续期（租约 30 秒），防止 Master 假死
- **原子操作**: SQLite 使用事务保证选举原子性

**选举流程**:
```
1. 尝试获取锁 (SETNX / INSERT / mkdir)
     │
     ├── 成功 → 声明等待期 (2 秒) → 无冲突 → 成为 Master
     │                            │
     │                            └── 有冲突 → 成为 Slaver
     │
     └── 失败 → 降级下一级 (SQLite → File)
```

### 1.3 断路器与重试机制（CircuitBreaker & RetryExecutor）

**位置**: `node/src/core/circuit-breaker.ts`

**优点**:
- **三状态机**: closed → open → half_open 状态转换清晰
- **监控窗口**: `monitorTimeout` 防止历史失败影响当前判断
- **指数退避**: 重试延迟 = `initialDelay * multiplier^attempt`
- **随机抖动**: 添加 30% 随机性防止惊群效应

### 1.4 多层缓存设计（LRUCache）

**位置**: `node/src/core/cache-layer.ts`

**优点**:
- **LRU 驱逐**: 自动淘汰最少使用条目
- **TTL 过期**: 支持条目级 TTL 控制
- **多层缓存**: 内存 + Redis 双层结构
- **缓存穿透保护**: `getOrCompute` 使用互斥锁防止击穿

### 1.5 Skills 注册表设计（SkillsRegistry）

**位置**: `node/src/skills/registry.ts`

**优点**:
- **分类索引**: 按 category 建立二级索引，加速查询
- **适配器管理**: 统一管理外部 AI 适配器（OpenCLAW/Claude Code/Codex）
- **统计功能**: `getStats()` 提供详细的注册信息

---

## 2. 架构缺点与问题

### 2.1 类型安全问题

#### 问题 1: `any` 类型使用

**位置**: `node/src/core/cache-layer.ts:127-129`

```typescript
// ❌ 使用 any 类型
const data = await client.get(`${this.config.redisPrefix}${key}`);
if (data) {
  const value = JSON.parse(data) as T;  // 类型断言绕过检查
```

**风险**: `JSON.parse` 返回 `any`，类型断言 `as T` 绕过了 TypeScript 检查。

**建议修复**:
```typescript
// ✓ 使用类型守卫
const parseResult = JSON.parse(data) as unknown;
if (!isValidCacheValue<T>(parseResult)) {
  return null;
}
const value = parseResult as T;
```

#### 问题 2: 错误类型转换为 `any`

**位置**: `node/src/core/circuit-breaker.ts:328`

```typescript
// ❌ 将错误转换为 any
lastError = circuitResult.error as unknown as Error;
```

**风险**: 双重类型断言完全绕过类型检查，丢失错误上下文（code、requestId）。

**建议修复**:
```typescript
// ✓ 使用类型守卫
if (isEketError(circuitResult.error)) {
  lastError = new Error(`${circuitResult.error.code}: ${circuitResult.error.message}`);
} else {
  lastError = circuitResult.error as Error;
}
```

#### 问题 3: `any` 参数传递

**位置**: `node/src/api/openclaw-gateway.ts:57`

```typescript
// ❌ 错误处理回调使用 any
this.app.use((err: Error, _req: Request, res: Response, _next: any) => {
```

**建议修复**:
```typescript
// ✓ 定义 NextFunction 类型
import { NextFunction } from 'express';
this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
```

### 2.2 资源泄漏问题

#### 问题 1: Timer 未清理

**位置**: `node/src/core/master-election.ts:569`

```typescript
// ⚠️ leaseTimer 在 close() 中清理，但异常情况下可能泄漏
this.leaseTimer = setInterval(renew, renewInterval);
```

**风险**: 如果 `startLeaseRenewal` 被多次调用，旧 Timer 未被清理。

**建议修复**:
```typescript
private startLeaseRenewal(level?: ElectionLevel, lockFile?: string): void {
  // 清理旧 Timer
  if (this.leaseTimer) {
    clearInterval(this.leaseTimer);
  }

  const renewInterval = this.config.leaseTime / 2;
  this.leaseTimer = setInterval(renew, renewInterval);
}
```

#### 问题 2: Redis 连接池未健康检查

**位置**: `node/src/core/cache-layer.ts:463-477`

```typescript
async acquire(): Promise<RedisClient> {
  // 查找空闲连接
  for (const item of this.clients) {
    if (!item.busy && item.client.isReady()) {
      item.busy = true;
      item.lastUsed = Date.now();
      return item.client;
    }
  }
  // ⚠️ 连接可能已断开但 isReady() 返回 true
}
```

**建议修复**:
```typescript
async acquire(): Promise<RedisClient> {
  for (const item of this.clients) {
    if (!item.busy) {
      // 健康检查
      const healthCheck = await item.client.ping();
      if (healthCheck.success) {
        item.busy = true;
        item.lastUsed = Date.now();
        return item.client;
      } else {
        // 重连或替换连接
        await this.replaceConnection(item);
      }
    }
  }
  // 没有空闲连接，等待
  return new Promise((resolve) => {
    this.waitQueue.push(resolve);
  });
}
```

#### 问题 3: SkillsRegistry 异步清理不完整

**位置**: `node/src/skills/registry.ts:175-194`

```typescript
async clear(): Promise<void> {
  // ⚠️ 适配器断开连接的错误被忽略
  for (const [, name] of this.adapters.entries()) {
    try {
      await name.disconnect();
    } catch (error) {
      // 忽略断开连接错误 - 可能导致资源泄漏
    }
  }
  this.adapters.clear();
}
```

**建议修复**:
```typescript
async clear(): Promise<void> {
  const disconnectErrors: string[] = [];

  for (const [adapterName, adapter] of this.adapters.entries()) {
    try {
      await adapter.disconnect();
    } catch (error) {
      disconnectErrors.push(`${adapterName}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  this.adapters.clear();

  if (disconnectErrors.length > 0) {
    console.warn('[SkillsRegistry] Some adapters failed to disconnect:', disconnectErrors);
  }
}
```

### 2.3 错误处理问题

#### 问题 1: 吞掉异常

**位置**: `node/src/integration/openclaw-adapter.ts:770-773`

```typescript
// ⚠️ catch 块吞掉所有异常，返回成功
} catch {
  // 忽略发送错误
  return { success: true, data: undefined };
}
```

**风险**: Agent 生命周期事件发送失败被静默忽略，导致状态不一致。

**建议修复**:
```typescript
} catch (error) {
  console.warn(`[OpenCLAW Adapter] Failed to send agent lifecycle event: ${error instanceof Error ? error.message : 'Unknown'}`);
  // 返回失败，让调用者决定如何处理
  return {
    success: false,
    error: new EketErrorClass('LIFECYCLE_EVENT_FAILED', 'Failed to send lifecycle event'),
  };
}
```

#### 问题 2: 错误日志缺少上下文

**位置**: `node/src/core/master-election.ts:564-566`

```typescript
// ⚠️ 仅打印错误，缺少 instanceId、electionLevel 等上下文
} catch (error) {
  console.error('[MasterElection] Lease renewal failed:', error);
  this.isMaster = false;
}
```

**建议修复**:
```typescript
} catch (error) {
  console.error('[MasterElection] Lease renewal failed:', {
    instanceId: this.instanceId,
    electionLevel: level,
    error: error instanceof Error ? error.message : 'Unknown',
    timestamp: new Date().toISOString(),
  });
  this.isMaster = false;
}
```

#### 问题 3: TODO 未实现

**位置**: `node/src/integration/openclaw-adapter.ts` 多处

```typescript
// ⚠️ 多个 TODO 未实现
// TODO: 持久化 Epic 到 jira/epics/
// TODO: 从 Redis/SQLite 查询 Ticket 状态
// TODO: 从历史追踪获取
```

**风险**: 代码当前返回模拟数据，生产环境会导致数据不一致。

**建议**: 为每个 TODO 创建追踪 Issue，明确责任人和截止时间。

### 2.4 并发控制问题

#### 问题 1: LRU 驱逐竞态条件

**位置**: `node/src/core/cache-layer.ts:353-368`

```typescript
private evictLRU(): void {
  let lruKey: string | null = null;
  let lruTime = Infinity;

  for (const [key, entry] of this.cache.entries()) {
    // ⚠️ 简化的 LRU 算法，未考虑并发访问
    const accessTime = entry.createdAt + (entry.hits * 1000);
    if (accessTime < lruTime) {
      lruTime = accessTime;
      lruKey = key;
    }
  }

  if (lruKey) {
    this.cache.delete(lruKey);
    this.stats.evictions++;
  }
}
```

**风险**: 多线程环境下，`hits` 计数可能不准确。

**建议修复**:
```typescript
// 使用更精确的访问时间追踪
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
  createdAt: number;
  lastAccessAt: number;  // 新增
}

private evictLRU(): void {
  let lruKey: string | null = null;
  let lruTime = Infinity;

  for (const [key, entry] of this.cache.entries()) {
    // 使用最后访问时间
    if (entry.lastAccessAt < lruTime) {
      lruTime = entry.lastAccessAt;
      lruKey = key;
    }
  }

  if (lruKey) {
    this.cache.delete(lruKey);
    this.stats.evictions++;
  }
}
```

### 2.5 设计问题

#### 问题 1: 单例模式滥用

**位置**: `node/src/skills/registry.ts:360-369`

```typescript
// ⚠️ 全局单例，难以测试
let globalRegistry: SkillsRegistry | null = null;

export function getGlobalSkillsRegistry(): SkillsRegistry {
  if (!globalRegistry) {
    globalRegistry = createSkillsRegistry();
  }
  return globalRegistry;
}
```

**风险**:
- 测试时状态污染
- 难以模拟（Mock）
- 隐式依赖

**建议**: 使用依赖注入模式，由调用者传入 Registry 实例。

#### 问题 2: Redis 连接未复用

**位置**: `node/src/core/cache-layer.ts:76-78`

```typescript
constructor(config: Partial<CacheConfig> = {}) {
  // ⚠️ 每个 LRUCache 实例都创建新的 RedisClient
  if (this.config.useRedis) {
    this.redis = createRedisClient();
  }
}
```

**风险**: 多个缓存实例导致多个 Redis 连接，浪费资源。

**建议**: 支持传入现有 RedisClient 实例：
```typescript
export interface CacheConfig {
  // ... 现有配置
  redisClient?: RedisClient;  // 新增：可选的共享客户端
}
```

---

## 3. 修复建议优先级

### 高优先级（立即修复）

| 编号 | 问题 | 位置 | 建议 |
|------|------|------|------|
| H1 | Timer 泄漏 | `master-election.ts:569` | 清理旧 Timer 后再创建新 Timer |
| H2 | 异常吞掉 | `openclaw-adapter.ts:770` | 记录日志并返回错误 |
| H3 | `any` 类型 | `circuit-breaker.ts:328` | 使用类型守卫 |
| H4 | TODO 未实现 | `openclaw-adapter.ts` 多处 | 创建 Issue 追踪 |

### 中优先级（下个迭代）

| 编号 | 问题 | 位置 | 建议 |
|------|------|------|------|
| M1 | LRU 驱逐算法 | `cache-layer.ts:353` | 使用 `lastAccessAt` 追踪 |
| M2 | 错误日志上下文 | `master-election.ts:564` | 添加 instanceId、electionLevel |
| M3 | Redis 连接复用 | `cache-layer.ts:76` | 支持传入现有客户端 |
| M4 | 连接池健康检查 | `cache-layer.ts:463` | 添加 ping 检测 |

### 低优先级（技术债务）

| 编号 | 问题 | 位置 | 建议 |
|------|------|------|------|
| L1 | 全局单例 | `skills-registry.ts:360` | 迁移到依赖注入 |
| L2 | Express any 类型 | `openclaw-gateway.ts:57` | 使用 `NextFunction` 类型 |
| L3 | SkillsRegistry 清理 | `skills-registry.ts:175` | 记录断开连接错误 |

---

## 4. 架构改进建议

### 4.1 引入连接池抽象

当前 `ConnectionManager` 管理四级连接，但每个级别的连接池管理分散在各模块。建议引入统一的连接池抽象：

```typescript
interface ConnectionPool<T> {
  acquire(): Promise<T>;
  release(conn: T): void;
  healthCheck(): Promise<boolean>;
  stats(): PoolStats;
}
```

### 4.2 增加可观测性

建议在关键模块添加指标导出（Prometheus 格式）：

```typescript
// CircuitBreaker 指标
circuit_breaker_state{module="redis-client", state="closed"} 1
circuit_breaker_failures_total{module="redis-client"} 5
circuit_breaker_opened_total{module="redis-client"} 1

// MasterElection 指标
master_election_level{instance="instance_001"} "redis"
master_lease_renewals_total{instance="instance_001"} 150
```

### 4.3 配置中心化

当前各模块配置分散，建议引入配置中心：

```typescript
interface EketConfig {
  connection: {
    remoteRedis?: RedisConfig;
    localRedis?: RedisConfig;
    sqlite?: SqliteConfig;
    file?: FileConfig;
  };
  election: {
    timeout: number;
    declarationPeriod: number;
    leaseTime: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    timeout: number;
  };
  // ...
}
```

### 4.4 增加混沌工程支持

建议添加混沌测试工具，模拟各种故障场景：

```bash
# 模拟 Redis 故障
eket-chaos redis:kill --duration 60s

# 模拟网络分区
eket-chaos network:partition --targets=instance_001,instance_002

# 模拟 Master 崩溃
eket-chaos master:kill
```

---

## 5. 总结

EKET 框架的架构设计整体优秀，特别是在**降级策略**、**分布式协调**和**错误恢复**方面展现了成熟的工程实践。然而，仍存在以下需要改进的关键领域：

1. **类型安全**: 减少 `any` 使用，增加类型守卫
2. **资源管理**: 修复 Timer 和连接泄漏问题
3. **错误处理**: 改进日志上下文，避免吞掉异常
4. **可测试性**: 移除全局单例，采用依赖注入

完成上述改进后，EKET 框架将具备更强的生产环境可靠性。

---

**审查完成时间**: 2026-03-30
**下次审查建议**: 2026-04-30（修复高优先级问题后）
