# 双轨路由器：Rust与Node.js的优雅切换

> 平台：微信公众号 / 掘金
> 定位：L2 模块拆解
> 阅读时间：5分钟

---

## 🤔 设计难题

**Rust 快但难调试，Node.js 慢但好改。**

能不能两个都要？

答案：**双轨路由器（Dual-Track Router）**

---

## 🏗️ 架构设计

```
           请求
             ↓
    ┌─────────────────┐
    │  Dual-Track     │
    │  Router         │
    └────────┬────────┘
             │
     ┌───────┴───────┐
     ↓               ↓
┌─────────┐    ┌─────────┐
│ Track A │    │ Track B │
│  Rust   │    │ Node.js │
│  <5ms   │    │  ~50ms  │
└────┬────┘    └────┬────┘
     │              │
     └──────┬───────┘
            ↓
         响应
```

**默认走 Rust，失败切 Node.js。**

---

## 🔧 核心实现

### 路由器接口

```typescript
// node/src/core/dual-track-router.ts

interface DualTrackRouter {
  // 路由请求
  route<T>(
    operation: string,
    rustFn: () => Promise<T>,
    nodeFn: () => Promise<T>
  ): Promise<T>;
  
  // 获取当前轨道
  getCurrentTrack(): 'rust' | 'node';
  
  // 强制切换
  forceTrack(track: 'rust' | 'node'): void;
}
```

### 路由逻辑

```typescript
export class DualTrackRouterImpl implements DualTrackRouter {
  private circuitBreaker: CircuitBreaker;
  private currentTrack: 'rust' | 'node' = 'rust';
  
  async route<T>(
    operation: string,
    rustFn: () => Promise<T>,
    nodeFn: () => Promise<T>
  ): Promise<T> {
    // 检查断路器状态
    if (this.circuitBreaker.isOpen('rust')) {
      return this.executeWithFallback(nodeFn, operation);
    }
    
    try {
      // 尝试 Rust 轨道
      const start = performance.now();
      const result = await Promise.race([
        rustFn(),
        this.timeout(100), // 100ms 超时
      ]);
      
      const duration = performance.now() - start;
      this.recordSuccess('rust', duration);
      
      return result;
    } catch (error) {
      // 记录失败，可能触发熔断
      this.circuitBreaker.recordFailure('rust');
      
      // 降级到 Node.js
      logger.warn(`Rust failed for ${operation}, falling back to Node.js`);
      return this.executeWithFallback(nodeFn, operation);
    }
  }
}
```

### 断路器集成

```typescript
// node/src/core/circuit-breaker.ts

export class CircuitBreaker {
  private state: Map<string, CircuitState> = new Map();
  private failures: Map<string, number> = new Map();
  private lastFailure: Map<string, number> = new Map();
  
  private config = {
    failureThreshold: 3,    // 3次失败触发熔断
    timeout: 100,           // 100ms 超时阈值
    halfOpenDelay: 30000,   // 30s 后尝试恢复
  };
  
  isOpen(service: string): boolean {
    const state = this.state.get(service) || CircuitState.CLOSED;
    
    if (state === CircuitState.OPEN) {
      // 检查是否可以尝试恢复
      const lastFail = this.lastFailure.get(service) || 0;
      if (Date.now() - lastFail > this.config.halfOpenDelay) {
        this.state.set(service, CircuitState.HALF_OPEN);
        return false; // 允许一次尝试
      }
      return true;
    }
    
    return false;
  }
  
  recordFailure(service: string): void {
    const failures = (this.failures.get(service) || 0) + 1;
    this.failures.set(service, failures);
    this.lastFailure.set(service, Date.now());
    
    if (failures >= this.config.failureThreshold) {
      this.state.set(service, CircuitState.OPEN);
      logger.error(`Circuit breaker OPEN for ${service}`);
    }
  }
  
  recordSuccess(service: string): void {
    this.failures.set(service, 0);
    this.state.set(service, CircuitState.CLOSED);
  }
}
```

---

## 📊 状态流转

```
         成功
    ┌──────────┐
    ↓          │
┌───────┐  ┌───┴────┐  ┌─────────┐
│CLOSED │→→│HALF_OPEN│→→│  OPEN   │
│正常   │  │试探恢复 │  │ 熔断    │
└───────┘  └────────┘  └────┬────┘
    ↑                       │
    └───────────────────────┘
         30s 后自动尝试
```

### 状态说明

| 状态 | 含义 | 行为 |
|------|------|------|
| CLOSED | 正常 | 所有请求走 Rust |
| OPEN | 熔断 | 所有请求走 Node.js |
| HALF_OPEN | 试探 | 放一个请求走 Rust 试试 |

---

## 🎯 使用示例

### 任务领取

```typescript
async function claimTask(taskId: string): Promise<Task> {
  return dualTrackRouter.route(
    'claim_task',
    // Rust 实现
    async () => {
      const result = await execRust(`eket task:claim ${taskId}`);
      return parseTask(result);
    },
    // Node.js 实现
    async () => {
      const task = await readTicket(taskId);
      task.status = 'in_progress';
      task.assignee = getCurrentSlaver();
      await writeTicket(taskId, task);
      return task;
    }
  );
}
```

### 知识库搜索

```typescript
async function searchKnowledge(query: string): Promise<SearchResult[]> {
  return dualTrackRouter.route(
    'knowledge_search',
    // Rust FTS 实现（极速）
    async () => {
      const result = await execRust(`eket knowledge:search "${query}"`);
      return JSON.parse(result);
    },
    // Node.js 实现（功能相同，稍慢）
    async () => {
      return ftsSearch(query, { limit: 10 });
    }
  );
}
```

---

## 📈 性能对比

### 正常情况

```
Task Claim:
  Rust:    4.2ms  ████
  Node.js: 47ms   ████████████████████████████████████████████████

Knowledge Search:
  Rust:    12ms   ████████████
  Node.js: 89ms   █████████████████████████████████████████████████████████████████████████████████████████
```

### 降级情况

```
Rust 熔断后:
  首次降级: +50ms（切换开销）
  后续请求: 47ms（直接走 Node.js）
  
恢复后:
  首次恢复: 4.2ms（试探成功）
  后续请求: 4.2ms（恢复正常）
```

---

## 💡 设计哲学

### 性能与可靠性的平衡

```
性能优先 ←────────────→ 可靠性优先
   │                        │
   Rust                  Node.js
   快但可能崩              慢但稳定
```

双轨路由器：**两个都要**

### 渐进式迁移

1. 先用 Node.js 开发
2. 性能瓶颈用 Rust 重写
3. 双轨并行，逐步切换
4. Rust 稳定后成为主轨

### 无感切换

用户完全无感知：
- API 接口不变
- 响应格式不变
- 只有响应时间可能变化

---

## ⚠️ 注意事项

### 1. 保持接口一致

Rust 和 Node.js 实现必须返回相同格式：

```typescript
// ❌ 错误：格式不一致
rustFn: () => { status: 'ok', data: [...] }
nodeFn: () => { success: true, result: [...] }

// ✅ 正确：格式一致
rustFn: () => { status: 'ok', data: [...] }
nodeFn: () => { status: 'ok', data: [...] }
```

### 2. 超时要合理

```typescript
// ❌ 错误：超时太长，降级太慢
timeout: 5000

// ✅ 正确：快速失败，快速降级
timeout: 100
```

### 3. 监控要到位

```typescript
// 记录每次路由决策
metrics.record({
  operation,
  track: currentTrack,
  duration,
  success,
});
```

---

## 🚀 下一篇预告

**《知识飞轮：让AI越用越聪明》**

深入知识系统：如何沉淀经验，让 AI Agent 越用越强。

---

#系统架构 #Rust #Node.js #高可用 #性能优化
