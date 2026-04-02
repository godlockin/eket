# ADR-003: 为什么选择文件队列作为降级方案

**状态**: 已采纳
**日期**: 2026-03-26
**决策者**: EKET Framework Team

---

## 背景

在四级降级架构中，文件系统是最终降级方案。我们需要确保即使在没有任何数据库服务的情况下，消息队列仍能正常工作。

### 问题陈述

1. **零依赖要求**: 最终降级方案不能依赖任何外部服务
2. **可靠性要求**: 文件操作必须可靠，不能丢失消息
3. **并发安全**: 多实例同时写入不能损坏数据
4. **性能可接受**: 虽然是最差方案，但性能不能太差

---

## 决策

我们选择实现基于文件系统的消息队列，具备以下特性：

### 核心设计

```
.eket/data/queue/
├── pending/           # 待处理消息
│   ├── msg_001.json
│   ├── msg_002.json
│   └── ...
├── processed/         # 已处理消息
│   ├── 2026-04-02/
│   │   └── processed.json
│   └── ...
└── archive/           # 归档消息
    └── ...
```

### 原子操作模式

```typescript
// 1. 写入临时文件
const tempFile = `${filePath}.tmp.${Date.now()}`;
fs.writeFileSync(tempFile, JSON.stringify(data));

// 2. 原子重命名
fs.renameSync(tempFile, filePath);

// 结果：要么完全写入，要么完全没写入
```

### 文件锁机制

```typescript
// 获取锁
const lockFile = `${filePath}.lock`;
try {
  fs.mkdirSync(lockFile, { recursive: false });  // 原子操作
  // 执行操作...
} finally {
  fs.rmSync(lockFile, { recursive: true });  // 释放锁
}
```

### 校验和验证

```typescript
interface FileMessage {
  id: string;
  data: Record<string, unknown>;
  checksum: string;  // CRC32 校验和
  createdAt: number;
}

// 写入时计算校验和
const checksum = crc32(JSON.stringify(data));

// 读取时验证校验和
if (file.checksum !== crc32(JSON.stringify(file.data))) {
  throw new Error('CHECKSUM_MISMATCH');
}
```

---

## 理由

### 为什么选择文件队列而非其他方案？

**方案对比**:

| 方案 | 优点 | 缺点 | 为什么不用 |
|------|------|------|------------|
| **文件队列** | **零依赖、可靠** | **性能较低** | **✓ 最佳降级方案** |
| 内存队列 | 性能高 | 重启丢失 | 不符合持久化要求 |
| 仅 SQLite | 性能好 | 需要 SQLite 依赖 | 不是最终降级 |
| 消息中间件 | 功能强 | 依赖复杂 | 不适合降级场景 |

### 文件队列的优势

1. **零依赖**: 只需要文件系统
2. **可靠性**: 原子操作 + 校验和保证数据完整
3. **可调试**: 文件内容可直接查看
4. **易归档**: 文件天然支持归档

---

## 影响

### 积极影响

1. **最终可靠性**: 即使所有服务都不可用，系统仍能运行
2. **调试友好**: 消息内容可直接查看
3. **部署简单**: 不需要额外服务

### 消极影响

1. **性能**: 文件 IO 比内存操作慢 10-100 倍
2. **并发**: 文件锁可能成为瓶颈
3. **清理**: 需要定期清理已处理消息

### 性能对比

| 操作 | Redis | SQLite | 文件队列 |
|------|-------|--------|----------|
| 写入 | ~1ms | ~5ms | ~20ms |
| 读取 | ~1ms | ~5ms | ~10ms |
| 删除 | ~1ms | ~5ms | ~5ms |

### 缓解措施

- 批量操作减少 IO 次数
- 异步写入减少阻塞
- 定期清理防止磁盘占满

---

## 使用示例

### 配置示例

```typescript
const manager = createConnectionManager({
  fileQueueDir: './.eket/data/queue',
  driverMode: 'js',  // 或 'shell'
});

const result = await manager.initialize();
if (result.data === 'file') {
  console.log('Running in file queue mode');
}
```

### 环境变量

```bash
# 配置文件队列目录
EKET_FILE_QUEUE_DIR=./.eket/data/queue

# 配置驱动模式
EKET_DRIVER_MODE=js  # 或 shell
```

---

## 优化文件队列实现

### 原子写入

```typescript
async function writeMessage(filePath: string, data: unknown): Promise<void> {
  const tempFile = `${filePath}.tmp.${process.pid}.${Date.now()}`;

  // 1. 写入临时文件
  const content = JSON.stringify({
    data,
    checksum: calculateChecksum(data),
    timestamp: Date.now(),
  }, null, 2);

  fs.writeFileSync(tempFile, content, 'utf-8');

  // 2. 原子重命名
  fs.renameSync(tempFile, filePath);
}
```

### 批量读取

```typescript
function readPendingMessages(queueDir: string): Message[] {
  const pendingDir = path.join(queueDir, 'pending');
  const files = fs.readdirSync(pendingDir);

  const messages: Message[] = [];
  for (const file of files) {
    const filePath = path.join(pendingDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const message = JSON.parse(content) as Message;

    // 验证校验和
    if (verifyChecksum(message)) {
      messages.push(message);
    }
  }

  return messages;
}
```

---

## 相关文档

- [文件队列实现](../../node/src/core/optimized-file-queue.ts)
- [连接管理器](../../node/src/core/connection-manager.ts)

---

## 备注

文件队列作为最终降级方案，在以下场景特别有用：

1. **开发环境**: 快速启动，不需要 Redis/SQLite
2. **灾难恢复**: 所有服务不可用时的备份方案
3. **边缘部署**: 资源受限环境
4. **测试环境**: 隔离测试，不需要外部依赖
