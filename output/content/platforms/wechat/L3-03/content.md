# 文件系统 vs 数据库：分布式通信的取舍

> 平台：微信公众号
> 定位：L3 决策说明
> 阅读时间：5分钟

---

## 🤔 设计选择

EKET 的核心通信方式：

```
Master ──────→ Ticket 文件 ──────→ Slaver
       写入                  读取
```

为什么不用 Redis Pub/Sub？为什么不用 Kafka？

---

## 📊 方案对比

### 方案 A: 消息队列

```
Master → Redis Pub/Sub → Slaver
```

优点：
- ✅ 实时推送
- ✅ 支持广播
- ✅ 成熟方案

缺点：
- ❌ 需要运维 Redis
- ❌ 消息可能丢失
- ❌ 调试困难（消息即逝）
- ❌ 依赖网络

### 方案 B: 文件系统

```
Master → Ticket 文件 → Slaver
```

优点：
- ✅ 零依赖
- ✅ 天然持久化
- ✅ 可追溯（Git）
- ✅ 可调试（直接看文件）

缺点：
- ❌ 轮询开销
- ❌ 并发控制复杂
- ❌ 不支持实时推送

---

## 💡 EKET 的选择

**以文件为主，消息队列为增强。**

```
Level 0-2: 文件系统（基础）
Level 3:   Redis Pub/Sub（增强）
```

### 为什么？

#### 1. AI Agent 的特点

AI Agent 不需要毫秒级实时性：

```
人类用户：等 100ms 觉得慢
AI Agent：等 1s 完全可以
```

轮询间隔 500ms 完全够用。

#### 2. 可调试性至上

开发 AI Agent 最大的痛点是调试：

```
消息队列调试：
  "消息发了吗？" → 看日志
  "消息内容是啥？" → 加日志
  "历史消息呢？" → 没了

文件系统调试：
  "任务状态是啥？" → cat jira/tickets/TASK-042.md
  "谁改的？" → git blame
  "改了什么？" → git diff
```

**文件 = 天然的审计日志。**

#### 3. 零依赖底线

```
有 Redis → 用 Redis（更快）
没 Redis → 用文件（照样跑）
```

不会因为 Redis 挂了整个系统崩溃。

---

## 🔧 文件通信实现

### Ticket 文件结构

```markdown
# TASK-042: 实现用户登录

## 元数据
- 状态: in_progress
- 优先级: P1
- 负责人: slaver_1
- 创建时间: 2024-01-15T10:00:00Z
- 更新时间: 2024-01-15T14:30:00Z

## 验收标准
1. 支持邮箱登录
2. 返回 JWT token

## 依赖
- TASK-041（已完成）

## 检查点
- [x] 设计 API
- [ ] 实现逻辑
- [ ] 单元测试
```

### 状态轮询

```typescript
// node/src/core/task-watcher.ts

export class TaskWatcher {
  private interval: NodeJS.Timer;
  
  start(callback: (task: Task) => void): void {
    this.interval = setInterval(async () => {
      const tasks = await this.scanReadyTasks();
      for (const task of tasks) {
        callback(task);
      }
    }, 500); // 500ms 轮询
  }
  
  private async scanReadyTasks(): Promise<Task[]> {
    const files = await glob('jira/tickets/TASK-*.md');
    const tasks: Task[] = [];
    
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const task = parseTicket(content);
      if (task.status === 'ready') {
        tasks.push(task);
      }
    }
    
    return tasks;
  }
}
```

### 原子写入

```typescript
// node/src/utils/atomic-write.ts

export async function atomicWrite(
  path: string,
  content: string
): Promise<void> {
  const tempPath = `${path}.tmp.${process.pid}`;
  
  // 写入临时文件
  await writeFile(tempPath, content);
  
  // 原子重命名
  await rename(tempPath, path);
}
```

### 文件锁

```typescript
// node/src/core/file-lock.ts

export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>
): Promise<T> {
  const fd = await open(lockPath, 'wx'); // 排他创建
  
  try {
    return await fn();
  } finally {
    await close(fd);
    await unlink(lockPath);
  }
}

// 使用
await withLock('jira/tickets/TASK-042.lock', async () => {
  const task = await readTicket('TASK-042');
  task.status = 'in_progress';
  await writeTicket('TASK-042', task);
});
```

---

## 📈 性能考量

### 轮询开销

```
500ms 轮询
× 100 个 ticket 文件
× stat + 部分 read
= ~10ms/轮询
```

完全可以接受。

### 优化手段

#### 1. 增量扫描

```typescript
// 只扫描最近修改的文件
const recentFiles = files.filter(f => 
  f.mtime > lastScanTime
);
```

#### 2. 内存缓存

```typescript
// 缓存 ticket 状态
const taskCache = new Map<string, TaskStatus>();

// 只读取状态变化的
if (taskCache.get(taskId) !== currentStatus) {
  // 读取完整内容
}
```

#### 3. inotify (Linux)

```typescript
// 文件系统事件监听
const watcher = chokidar.watch('jira/tickets/*.md');
watcher.on('change', (path) => {
  // 直接处理变更的文件
});
```

---

## 🔄 与消息队列配合

### Level 3 增强

```typescript
// node/src/core/hybrid-queue.ts

export class HybridQueue {
  private redis?: Redis;
  private fileQueue: FileQueue;
  
  async publish(channel: string, message: Message): Promise<void> {
    // 1. 写入文件（持久化）
    await this.fileQueue.write(channel, message);
    
    // 2. 发送 Redis 通知（加速）
    if (this.redis) {
      try {
        await this.redis.publish(channel, JSON.stringify(message));
      } catch (e) {
        // Redis 失败不影响，文件已写入
        logger.warn('Redis publish failed, file queue active');
      }
    }
  }
  
  async subscribe(
    channel: string, 
    callback: (msg: Message) => void
  ): Promise<void> {
    if (this.redis) {
      // 优先使用 Redis 订阅（实时）
      await this.redis.subscribe(channel, callback);
    }
    
    // 同时轮询文件（兜底 + 恢复）
    await this.fileQueue.watch(channel, callback);
  }
}
```

### 消息流

```
Master 发布任务:
    ↓
写入 TASK-042.md（持久化）
    ↓
Redis publish（通知）
    ↓
Slaver 收到 Redis 消息（实时）
    或
Slaver 轮询发现文件变更（兜底）
```

---

## 💡 设计哲学

### 文件是最可靠的存储

```
Redis 挂了 → 数据可能丢失
文件系统挂了 → 整个机器都挂了
```

文件系统是操作系统最后的防线。

### Git 是最好的审计

```
谁改的？  → git blame
改了什么？ → git diff
什么时候？ → git log
```

免费获得完整审计能力。

### 简单是最好的设计

```
Kafka: broker、partition、consumer group、offset...
文件:  read、write、rename
```

复杂度差 100 倍。

---

## 🚀 下一篇预告

**《覆盖率陷阱：测试数字游戏的教训》**

EPIC-014 的血泪史：为什么追求覆盖率数字会适得其反？

---

#架构设计 #分布式系统 #文件系统 #消息队列 #技术选型
