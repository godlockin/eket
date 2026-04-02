# ADR-001: 为什么选择四级降级架构

**状态**: 已采纳
**日期**: 2026-03-26
**决策者**: EKET Framework Team

---

## 背景

EKET 框架需要在多种部署环境下可靠运行，从开发环境到生产环境，基础设施条件可能差异巨大。我们需要一个能够在不同条件下都能工作的连接策略。

### 问题陈述

1. **基础设施异构性**: 不同项目有不同的基础设施条件
   - 有些项目有企业级 Redis 集群
   - 有些项目只有本地 Redis
   - 有些项目无法使用 Redis

2. **可用性要求**: 框架必须在任何条件下都能运行
   - 不能因为 Redis 不可用就完全失效
   - 需要优雅降级而非完全崩溃

3. **透明性**: 降级过程对使用者透明
   - API 保持一致
   - 无需修改业务代码

---

## 决策

我们选择实现四级降级架构：

```
Level 1: 远程共享 Redis (最优)
    ↓ 降级
Level 2: 本地 Redis
    ↓ 降级
Level 3: 本地 SQLite
    ↓ 降级
Level 4: 本地文件系统 (最终降级)
```

### 架构设计

```typescript
interface ConnectionManagerConfig {
  remoteRedis?: { host, port, password, db };  // Level 1
  localRedis?: { host, port };                  // Level 2
  sqlitePath?: string;                          // Level 3
  fileQueueDir?: string;                        // Level 4
  driverMode?: 'js' | 'shell';                  // 驱动模式
}
```

### 实现细节

1. **启动时自动检测**: 初始化时按优先级尝试连接
2. **降级透明**: 上层业务感知不到降级
3. **支持升级**: 高级别连接恢复时可自动升级

---

## 理由

### 为什么选择这个顺序？

| 级别 | 技术 | 优势 | 劣势 |
|------|------|------|------|
| Level 1 | 远程 Redis | 分布式、高可用、共享 | 依赖外部服务 |
| Level 2 | 本地 Redis | 快速、简单 | 单机、数据易失 |
| Level 3 | SQLite | 可靠、ACID | 性能较低 |
| Level 4 | 文件系统 | 零依赖、最可靠 | 性能最低 |

### 为什么不是其他方案？

**方案对比**:

| 方案 | 优点 | 缺点 | 为什么不用 |
|------|------|------|------------|
| 仅 Redis | 性能好 | 单点故障 | 不符合高可用要求 |
| Redis + 数据库 | 数据持久化 | 增加依赖 | 过度设计 |
| 仅文件系统 | 零依赖 | 性能差 | 用户体验差 |
| **四级降级** | **兼顾性能和可用性** | **实现复杂** | **✓ 最佳平衡** |

---

## 影响

### 积极影响

1. **高可用性**: 系统在任何条件下都能运行
2. **部署灵活性**: 适应不同基础设施条件
3. **优雅降级**: 降级过程透明，不影响业务
4. **可观测性**: 提供降级统计和监控

### 消极影响

1. **实现复杂度**: 需要维护多套后端实现
2. **测试负担**: 每套降级方案都需要测试
3. **性能差异**: 不同级别性能差异较大

### 缓解措施

- 统一接口抽象，降低维护成本
- 自动化测试覆盖所有降级路径
- 监控降级状态，及时告警

---

## 使用示例

```typescript
const manager = createConnectionManager({
  remoteRedis: { host: 'redis-cluster', port: 6380, password: 'xxx' },
  localRedis: { host: 'localhost', port: 6379 },
  sqlitePath: '~/.eket/data/sqlite/eket.db',
  fileQueueDir: './.eket/data/queue',
});

const result = await manager.initialize();
console.log(`Current level: ${result.data}`);  // e.g., 'local_redis'

// 查看统计
const stats = manager.getStats();
console.log(stats);
// {
//   currentLevel: 'local_redis',
//   fallbackCount: 1,
//   remoteRedisAvailable: false,
//   localRedisAvailable: true,
//   ...
// }
```

---

## 相关文档

- [Connection Manager 实现](../../node/src/core/connection-manager.ts)
- [错误码参考](./error-codes.md)

---

## 备注

此决策基于以下假设：
1. 大多数生产环境有 Redis 集群
2. 开发环境通常可以运行本地 Redis
3. SQLite 和文件系统作为最后保障

如果假设不成立，需要重新评估此决策。
