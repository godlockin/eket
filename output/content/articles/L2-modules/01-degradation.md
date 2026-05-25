# 四级降级架构：永不宕机的秘密

> 平台：微信公众号 / 知乎
> 定位：L2 模块拆解
> 阅读时间：6分钟

---

## 🎯 设计目标

**任何环境都能跑，任何故障都有兜底。**

你的生产环境有 Redis？太好了，享受高性能。
没有 Redis？没关系，SQLite 兜底。
没有 Node.js？没关系，Shell 兜底。

---

## 🏗️ 四层架构

```
Level 3: Redis + SQLite    ← 生产级，高性能
    ↓ Redis 不可用
Level 2: Node.js + 文件队列  ← 开发级，功能完整
    ↓ Node.js 不可用
Level 1: Rust CLI           ← 原生级，极速响应
    ↓ Rust 不可用
Level 0: Pure Shell          ← 终极兜底，POSIX 兼容
```

---

## 🔧 各层详解

### Level 0: Pure Shell

**最后防线，永远可用。**

```bash
#!/bin/bash
# lib/adapters/hybrid-adapter.sh

claim_task() {
    local task_id=$1
    local task_file="jira/tickets/${task_id}.md"
    
    # 文件锁实现原子操作
    (
        flock -n 200 || exit 1
        
        # 检查状态
        status=$(grep "^状态:" "$task_file" | cut -d: -f2)
        if [ "$status" != "ready" ]; then
            exit 1
        fi
        
        # 更新状态
        sed -i 's/状态: ready/状态: in_progress/' "$task_file"
        echo "slaver_1" >> "$task_file"
    ) 200>"${task_file}.lock"
}
```

特点：
- ✅ 零依赖（只需 bash + coreutils）
- ✅ POSIX 兼容（Linux/macOS/WSL）
- ✅ 文件锁实现并发控制
- ⚠️ 性能一般（~100ms）

### Level 1: Rust CLI

**性能怪兽，<5ms 响应。**

```rust
// rust/crates/eket-core/src/db.rs

pub async fn claim_task(task_id: &str) -> Result<(), EketError> {
    let conn = get_connection()?;
    
    // SQLite 事务保证原子性
    conn.execute(
        "UPDATE tickets 
         SET status = 'in_progress', 
             assignee = ?1,
             claimed_at = datetime('now')
         WHERE id = ?2 AND status = 'ready'",
        params![current_slaver(), task_id],
    )?;
    
    Ok(())
}
```

特点：
- ✅ 极速响应（<5ms）
- ✅ 内存安全
- ✅ SQLite 原生支持
- ⚠️ 需要编译 Rust 环境

### Level 2: Node.js

**功能完整，开发友好。**

```typescript
// node/src/core/task-manager.ts

export async function claimTask(taskId: string): Promise<void> {
  // 双轨路由：先尝试 Rust
  try {
    await rustCore.claimTask(taskId);
    return;
  } catch (e) {
    // 降级到 Node.js 实现
    logger.warn('Rust core unavailable, falling back to Node.js');
  }
  
  // Node.js 实现
  const task = await readTicket(taskId);
  if (task.status !== 'ready') {
    throw new TaskNotReadyError(taskId);
  }
  
  task.status = 'in_progress';
  task.assignee = getCurrentSlaver();
  await writeTicket(taskId, task);
}
```

特点：
- ✅ 生态丰富
- ✅ 开发调试方便
- ✅ TypeScript 类型安全
- ⚠️ 性能次于 Rust（~50ms）

### Level 3: Redis + SQLite

**生产级，分布式就绪。**

```typescript
// node/src/core/message-queue.ts

export class MessageQueue {
  private redis: Redis;
  private fallbackPath: string;
  
  async publish(channel: string, message: Message): Promise<void> {
    try {
      await this.redis.publish(channel, JSON.stringify(message));
    } catch (e) {
      // 降级到文件队列
      await this.fileQueueFallback(channel, message);
    }
  }
  
  private async fileQueueFallback(
    channel: string, 
    message: Message
  ): Promise<void> {
    const queueFile = path.join(
      this.fallbackPath, 
      `${channel}.jsonl`
    );
    await appendFile(queueFile, JSON.stringify(message) + '\n');
  }
}
```

特点：
- ✅ 分布式 Pub/Sub
- ✅ 高并发支持
- ✅ 持久化消息
- ⚠️ 需要运维 Redis

---

## 🔄 降级触发条件

### 自动检测

```typescript
// node/src/core/circuit-breaker.ts

interface CircuitBreakerConfig {
  failureThreshold: 3,      // 3次失败触发
  timeout: 100,             // 100ms 超时
  halfOpenDelay: 30000,     // 30s 后尝试恢复
}

enum CircuitState {
  CLOSED,      // 正常
  OPEN,        // 熔断
  HALF_OPEN,   // 试探恢复
}
```

### 降级链

```
Redis 失败
  → 检查失败次数
  → 超过阈值？
    → 熔断 Redis
    → 切换文件队列
    → 30s 后尝试恢复
```

---

## 📊 性能对比

| 层级 | 响应时间 | 并发能力 | 依赖 |
|------|---------|---------|------|
| L0 Shell | ~100ms | 低 | bash |
| L1 Rust | <5ms | 高 | 编译环境 |
| L2 Node | ~50ms | 中 | Node.js |
| L3 Redis | ~10ms | 极高 | Redis |

---

## 💡 设计哲学

### 渐进增强

从最低要求开始，逐步增强：

```
能跑 → 跑得稳 → 跑得快 → 跑得好
L0      L1        L2        L3
```

### 优雅降级

高级功能不可用时，退回基础功能：

```
Redis 挂了 → 用文件队列
Rust 没装 → 用 Node.js
Node.js 崩了 → 用 Shell
```

### 关注点分离

每层只关心自己：
- L0: 基础功能
- L1: 性能优化
- L2: 功能完整
- L3: 分布式扩展

---

## 🛠️ 实际应用

### 开发环境

```bash
# 只需 Node.js
npm install
npm run dev
# 自动使用 L2
```

### 生产环境

```bash
# 安装 Rust CLI
cargo install eket

# 配置 Redis
export EKET_REDIS_HOST=redis.example.com

# 自动使用 L3，故障自动降级
eket server --port 9877
```

---

## 🚀 下一篇预告

**《双轨路由器：Rust与Node.js的优雅切换》**

深入双轨路由器的实现原理：如何在 Rust 和 Node.js 之间无缝切换。

---

#系统架构 #高可用 #降级设计 #Rust #Node.js
