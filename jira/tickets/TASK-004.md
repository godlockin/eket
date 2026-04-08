# TASK-004: 性能基准测试和优化

**类型**: Performance
**优先级**: P1
**状态**: ready
**分配给**: 待领取
**预估工时**: 6 小时

---

## 背景

EKET 框架已经实现核心功能，需要建立性能基准并优化关键路径。

## 目标

1. 建立性能基准
2. 识别性能瓶颈
3. 优化关键路径
4. 支持 1000 并发

## 技术方案

### Phase 1: 建立基准 (2h)

```typescript
// benchmarks/performance-benchmark.ts
import { performance } from 'perf_hooks';

const benchmarks = {
  redis_write: async () => { /* 测试 Redis 写入 */ },
  redis_read: async () => { /* 测试 Redis 读取 */ },
  sqlite_query: async () => { /* 测试 SQLite 查询 */ },
  file_queue: async () => { /* 测试文件队列 */ },
  message_pub: async () => { /* 测试消息发布 */ },
  message_sub: async () => { /* 测试消息订阅 */ }
};
```

**基准目标**:
- Redis 读写: <5ms
- SQLite 查询: <10ms
- 文件队列: <20ms
- 消息传递: <50ms

### Phase 2: 压力测试 (2h)

使用 k6 进行压力测试：
```javascript
// k6/load-test.js
export default function() {
  http.post('http://localhost:8899/hooks/pre-tool-use', payload);
}

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 1000 },
    { duration: '2m', target: 0 }
  ]
};
```

### Phase 3: 优化 (2h)

**优化点**:
1. Redis 连接池优化
2. SQLite WAL 模式
3. 文件队列批量处理
4. WebSocket 连接复用
5. 内存缓存优化

## 验收标准

- [ ] 建立完整的性能基准
- [ ] P95 延迟 <100ms
- [ ] 支持 1000 并发连接
- [ ] 内存使用 <512MB
- [ ] CPU 使用 <50% (正常负载)
- [ ] 性能报告文档

## 相关文件

- `benchmarks/performance-benchmark.ts`
- `k6/load-test.js` (新增)
- `docs/performance/benchmark-report.md` (新增)

## 工具

- k6 (负载测试)
- clinic.js (性能分析)
- autocannon (HTTP 基准测试)

## 依赖

- 依赖 TASK-001, TASK-002 (测试稳定)
- 依赖 TASK-003 (架构优化)

---

**角色要求**: DevOps / Backend
**技能要求**: 性能测试, k6, Node.js 性能优化
**估算**: 6 小时
