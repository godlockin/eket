# 双轨路由器模式（Dual-Track Router）

> **来源**: EPIC-010 Rust 高性能核心演进

**场景**: 需要高性能原生实现 (Rust/Go/C++) 与纯脚本降级兜底 (Node.js/Python) 并存  
**核心诉求**: 调用方无感知切换，任何环境绝不崩溃

---

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│              Unified Interface (抽象接口)               │
│   tryElect(): Promise<bool>  |  publish(): Promise<void>│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────┐         ┌─────────────────────────┐  │
│  │   Track A     │  ←───→  │    Circuit Breaker      │  │
│  │ (Rust Native) │         │  ·超时阈值: 100ms       │  │
│  │ < 5ms latency │         │  ·失败计数: 3次触发     │  │
│  └───────────────┘         │  ·恢复探测: 30s 半开    │  │
│          │ fallback        └───────────┬─────────────┘  │
│          ▼                             │                │
│  ┌───────────────┐                     │                │
│  │   Track B     │ ←───────────────────┘                │
│  │ (JS Fallback) │                                      │
│  │ 纯内存/文件   │                                      │
│  └───────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 实现要点

### 1. 接口抽象

```typescript
// 统一接口，调用方无需感知底层实现
interface IMasterElection {
  tryElect(): Promise<boolean>;
}

interface IMessageBus {
  publish(msg: EketMessage): Promise<void>;
  subscribe(channel: string, handler: (msg) => void): void;
}
```

### 2. 环境检测

```typescript
async function detectTrack(): Promise<'A' | 'B'> {
  // 1. 检查 Rust binary 是否存在
  const binaryExists = await checkBinaryExists('eket');
  if (!binaryExists) return 'B';
  
  // 2. 检查 Rust server 是否响应
  try {
    await fetch('http://127.0.0.1:9877/health', { timeout: 100 });
    return 'A';
  } catch {
    return 'B';
  }
}
```

### 3. 动态降级

```typescript
class DualTrackRouter<T extends object> {
  private track: 'A' | 'B' = 'A';
  private circuitBreaker: CircuitBreaker;
  
  async call<K extends keyof T>(method: K, ...args: any[]): Promise<any> {
    if (this.track === 'A' && this.circuitBreaker.isOpen()) {
      this.track = 'B';
      console.warn('[Dual-Track] 断路器触发，降级至 JS 轨道');
    }
    
    if (this.track === 'A') {
      try {
        return await this.rustAdapter[method](...args);
      } catch (err) {
        this.circuitBreaker.recordFailure();
        if (this.circuitBreaker.isOpen()) {
          this.track = 'B';
        }
        // 本次调用也降级
        return await this.jsFallback[method](...args);
      }
    }
    
    return await this.jsFallback[method](...args);
  }
}
```

---

## 适用组件

| 组件 | Track A (Rust) | Track B (JS) |
|------|---------------|--------------|
| Master 选举 | SQLite 原子锁 | 文件排它锁 |
| 消息总线 | Redis Pub/Sub | 内存 EventEmitter + 文件队列 |
| 状态同步 | WAL 重放 | 定时轮询 |
| 缓存 | LRU + mmap | Map + JSON 文件 |

---

## 关键规则

1. **接口签名 100% 相同** — 调用方代码零修改
2. **降级透明** — 仅输出 warn 日志，不抛异常
3. **断路器保护** — 防止故障 Rust 进程持续重试
4. **恢复探测** — 半开状态定期尝试 Track A

---

## 参考实现

- `node/src/core/dual-track-router.ts` (365 行)
- `rust/crates/eket-core/src/election.rs` (788 行)
- `rust/crates/eket-engine/src/event_bus.rs` (298 行)
