# 断路器模式：系统过载的保险丝

> 平台：微信公众号 / 掘金
> 定位：L2 模块拆解
> 阅读时间：5分钟

---

## 🔥 灾难场景

Redis 挂了一秒钟，然后...

```
00:00:01 Redis 超时
00:00:02 请求堆积... 100个
00:00:03 请求堆积... 1000个
00:00:04 Node.js 内存爆炸
00:00:05 整个服务崩溃 💥
```

一个组件故障，拖垮整个系统。

这叫**雪崩效应**。

---

## 💡 断路器思想

**像电路保险丝一样，过载就断开。**

```
正常状态            过载状态
─────────           ─────────
[请求] → [Redis]    [请求] → ✂️ [Redis]
                           │
                           ↓
                        [降级响应]
```

保护下游，保护自己。

---

## 🔧 三态模型

```
         成功
    ┌──────────┐
    ↓          │
┌───────┐  ┌───┴────┐  ┌─────────┐
│CLOSED │──│HALF_   │──│  OPEN   │
│ 闭合  │  │ OPEN   │  │  断开   │
│ 正常  │  │ 半开   │  │  熔断   │
└───────┘  └────────┘  └─────────┘
    ↑          │           │
    │          │  失败     │
    │          └───────────┘
    │                      │
    └──────────────────────┘
           30s 后自动尝试
```

### 状态说明

| 状态 | 触发条件 | 行为 |
|------|---------|------|
| CLOSED | 默认/恢复成功 | 正常转发请求 |
| OPEN | 连续失败≥阈值 | 直接返回降级响应 |
| HALF_OPEN | 熔断后等待期结束 | 放行一个请求试探 |

---

## 🏗️ 实现代码

### 断路器类

```typescript
// node/src/core/circuit-breaker.ts

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  
  private readonly config = {
    failureThreshold: 3,      // 3次失败触发熔断
    successThreshold: 2,      // 2次成功恢复
    timeout: 100,             // 100ms 超时
    halfOpenDelay: 30_000,    // 30s 后尝试恢复
  };
  
  async execute<T>(
    fn: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    // 检查是否应该熔断
    if (this.shouldReject()) {
      return fallback();
    }
    
    try {
      // 带超时执行
      const result = await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return fallback();
    }
  }
  
  private shouldReject(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return false;
    }
    
    if (this.state === CircuitState.OPEN) {
      // 检查是否可以进入半开状态
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.halfOpenDelay) {
        this.state = CircuitState.HALF_OPEN;
        return false; // 允许一次尝试
      }
      return true; // 继续熔断
    }
    
    // HALF_OPEN 状态允许请求
    return false;
  }
  
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        // 恢复正常
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successCount = 0;
        console.log('🟢 Circuit breaker CLOSED');
      }
    } else {
      this.failures = 0;
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.log('🔴 Circuit breaker OPEN');
    }
  }
  
  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), this.config.timeout)
      ),
    ]);
  }
}
```

### 使用示例

```typescript
// Redis 断路器
const redisBreaker = new CircuitBreaker();

async function getFromRedis(key: string): Promise<string | null> {
  return redisBreaker.execute(
    // 正常逻辑
    async () => {
      return await redis.get(key);
    },
    // 降级逻辑
    () => {
      console.log('Redis 熔断，使用本地缓存');
      return localCache.get(key);
    }
  );
}
```

---

## 📊 参数调优

### 失败阈值

```typescript
// 太低：频繁误熔断
failureThreshold: 1  // ❌ 一次失败就熔断

// 太高：保护不及时
failureThreshold: 100  // ❌ 都堆积100个了才熔断

// 推荐：3-5次
failureThreshold: 3  // ✅ 平衡敏感度和稳定性
```

### 超时时间

```typescript
// 太短：正常请求被误杀
timeout: 10  // ❌ 10ms 太激进

// 太长：等待时间太久
timeout: 5000  // ❌ 5s 等太久

// 推荐：P99 延迟的2-3倍
timeout: 100  // ✅ Redis P99 约 30ms
```

### 恢复时间

```typescript
// 太短：还没恢复就又熔断
halfOpenDelay: 1000  // ❌ 1s 太短

// 太长：影响可用性
halfOpenDelay: 300_000  // ❌ 5分钟太长

// 推荐：30s-60s
halfOpenDelay: 30_000  // ✅ 给下游足够恢复时间
```

---

## 🎯 实际应用

### EKET 中的断路器

```
┌─────────────────────────────────────┐
│              请求                    │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│         Rust CLI 断路器              │
│  失败3次 → 切换 Node.js             │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│         Redis 断路器                 │
│  失败3次 → 切换文件队列             │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│         SQLite 断路器                │
│  失败3次 → 切换内存存储             │
└─────────────────────────────────────┘
```

### 监控告警

```typescript
circuitBreaker.on('stateChange', (from, to) => {
  metrics.record('circuit_breaker_state', {
    from,
    to,
    timestamp: Date.now(),
  });
  
  if (to === CircuitState.OPEN) {
    alerting.send({
      level: 'warning',
      message: `断路器熔断: ${serviceName}`,
    });
  }
});
```

---

## 💡 设计哲学

### 快速失败

```
❌ 等待超时
   [请求] ────5s────→ [超时错误]

✅ 快速降级
   [请求] ────1ms────→ [降级响应]
```

### 自我修复

```
故障 → 熔断 → 等待 → 试探 → 恢复
              │       │
              └───────┘
              自动循环
```

### 渐进恢复

```
半开状态：

请求1 → 成功 → 继续
请求2 → 成功 → 恢复正常 ✅

而不是：

请求1 → 成功 → 全开
所有请求涌入 → 又崩了 💥
```

---

## ⚠️ 常见误区

### ❌ 误区1：所有接口用同一个断路器

```typescript
// 错误：Redis 挂了，连本地功能都不能用
const globalBreaker = new CircuitBreaker();

// 正确：每个服务独立断路器
const redisBreaker = new CircuitBreaker();
const sqliteBreaker = new CircuitBreaker();
const apiBreaker = new CircuitBreaker();
```

### ❌ 误区2：忘记降级逻辑

```typescript
// 错误：熔断后直接抛错
await breaker.execute(async () => redis.get(key));

// 正确：提供降级响应
await breaker.execute(
  async () => redis.get(key),
  () => localCache.get(key)  // 降级到本地缓存
);
```

### ❌ 误区3：不监控断路器状态

```typescript
// 错误：断路器状态黑盒
// （服务在降级运行，团队不知道）

// 正确：状态变更即告警
breaker.on('open', () => alerting.send(...));
```

---

## 🚀 下一篇预告

**《为什么选择三仓分离？》**

深入架构决策：confluence/jira/code_repo 分离的考量。

---

#系统架构 #高可用 #断路器 #熔断 #降级设计
