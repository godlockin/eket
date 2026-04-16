# EKET 性能测试套件
**TASK-004: 性能基准测试和优化**

本目录包含 EKET 框架的性能测试工具和文档。

---

## 📂 目录结构

```
.
├── node/benchmarks/           # Node.js 基准测试
│   ├── performance-benchmark.ts         # 原有基准测试
│   └── comprehensive-benchmark.ts       # 综合基准测试 (新增)
│
├── k6/                        # k6 压力测试脚本
│   ├── load-test.js          # 完整压力测试 (新增)
│   └── quick-test.js         # 快速测试 (新增)
│
└── docs/performance/          # 性能文档
    ├── benchmark-report.md              # 基准测试报告 (新增)
    └── optimization-recommendations.md  # 优化建议 (新增)
```

---

## 🚀 快速开始

### 1. 运行基准测试

```bash
# 进入 Node.js 目录
cd node

# 安装依赖（如果还未安装）
npm install

# 运行综合基准测试
npm run bench:comprehensive

# 或运行原有基准测试
npm run bench
```

**预期输出**:
```
==========================================================================
🚀 EKET v2.1.1 综合性能基准测试 - TASK-004
==========================================================================

⚙️  配置:
  ├─ 迭代次数: 1000
  ├─ 预热轮数: 100
  └─ 并发级别: 1, 10, 100, 500, 1000

📋 测试目标:
  ├─ Redis 读写:  <5ms (P95)
  ├─ SQLite 查询: <10ms (P95)
  ├─ 文件队列:    <20ms (P95)
  ├─ 消息传递:    <50ms (P95)
  └─ 内存使用:    <512MB

==========================================================================
📦 测试 1: Redis 读写性能
==========================================================================
...
```

### 2. 运行 k6 压力测试

```bash
# 安装 k6 (如果还未安装)
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6

# 启动 HTTP Hook 服务器
cd node
npm run build
node dist/index.js hooks:start --port 8899 &

# 运行快速测试（5 分钟）
cd ..
k6 run k6/quick-test.js

# 运行完整压力测试（30+ 分钟）
k6 run k6/load-test.js

# 自定义测试参数
k6 run --vus 500 --duration 10m k6/quick-test.js
```

---

## 📊 测试说明

### 基准测试 (Benchmarks)

**comprehensive-benchmark.ts** 包含以下测试：

1. **Redis 读写性能**
   - SET/GET/DELETE 操作
   - 目标: P95 <5ms

2. **SQLite 查询性能**
   - INSERT/SELECT/批量查询
   - 目标: P95 <10ms

3. **文件队列性能**
   - 消息发布/订阅
   - 目标: P95 <20ms

4. **LRU 缓存性能**
   - 写入/读取/驱逐
   - 目标: P95 <1ms

5. **并发性能**
   - 1-1000 并发级别
   - 测试吞吐量和延迟

6. **内存使用**
   - 10000 条目内存占用
   - 目标: <512MB

### 压力测试 (k6)

**load-test.js** 包含 4 个测试场景：

1. **渐进式负载测试**
   - 0 → 100 → 500 → 1000 并发
   - 持续 17 分钟

2. **稳定负载测试**
   - 500 并发持续 10 分钟
   - 验证系统稳定性

3. **WebSocket 连接测试**
   - 100 并发 WebSocket 连接
   - 持续 5 分钟

4. **峰值负载测试**
   - 快速爬升到 2000 并发
   - 持续 1 分钟

**quick-test.js** 快速测试：
- 5 分钟快速压力测试
- 最高 500 并发

---

## 🎯 性能目标

| 指标 | 目标值 |
|------|--------|
| Redis 读写 P95 | <5ms |
| SQLite 查询 P95 | <10ms |
| 文件队列 P95 | <20ms |
| HTTP 请求 P95 | <100ms |
| 消息传递 P95 | <50ms |
| 错误率 | <1% |
| 最大并发 | 1000 |
| 内存使用 | <512MB |
| CPU 使用 | <50% |

---

## 📝 测试报告

测试完成后，查看以下文档：

1. **[benchmark-report.md](docs/performance/benchmark-report.md)**
   - 详细的测试结果数据
   - 性能指标分析
   - 达成情况评估

2. **[optimization-recommendations.md](docs/performance/optimization-recommendations.md)**
   - 识别的性能瓶颈
   - 优化建议和代码示例
   - 预期性能提升
   - 实施计划

---

## 🔧 环境变量

测试使用以下环境变量（可选）：

```bash
# Redis 配置
EKET_REDIS_HOST=localhost
EKET_REDIS_PORT=6379

# SQLite 配置
EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db

# k6 测试目标
EKET_HOOK_URL=http://localhost:8899
EKET_WS_URL=ws://localhost:8899/ws
```

---

## 🐛 故障排查

### Redis 测试跳过

**问题**: "⚠️ Redis 不可用，跳过 Redis 测试"

**解决方案**:
```bash
# 启动 Redis (Docker)
docker run -d -p 6379:6379 redis:7-alpine

# 或使用本地 Redis
redis-server
```

### k6 连接失败

**问题**: k6 测试报告连接错误

**解决方案**:
```bash
# 确保 Hook 服务器已启动
node dist/index.js hooks:start --port 8899

# 检查服务器状态
curl http://localhost:8899/health
```

### TypeScript 编译错误

**问题**: ts-node 报告导入错误

**解决方案**:
```bash
# 确保使用 --esm 标志
ts-node --esm benchmarks/comprehensive-benchmark.ts

# 或构建后运行
npm run build
node dist/../benchmarks/comprehensive-benchmark.js
```

---

## 🚀 性能优化建议

基于测试结果，我们识别了以下优化机会：

### 立即实施 (本周)

1. **启用 SQLite WAL 模式**
   ```typescript
   db.pragma('journal_mode = WAL');
   db.pragma('synchronous = NORMAL');
   ```

2. **优化文件队列轮询**
   ```typescript
   filePollingInterval: 100  // 从 500ms 降到 100ms
   ```

3. **Redis 超时保护**
   ```typescript
   timeout: 3000  // 3 秒超时
   ```

### 短期优化 (本月)

- 文件队列批量处理
- 迁移到 AsyncSQLiteClient
- Redis 连接池优化
- 内存监控告警

详见: [optimization-recommendations.md](docs/performance/optimization-recommendations.md)

---

## 📚 相关文档

- [TASK-004 任务说明](../jira/tickets/TASK-004.md)
- [CLAUDE.md 开发指南](../CLAUDE.md)
- [k6 官方文档](https://k6.io/docs/)

---

## ✅ 验收标准

- [x] 创建综合基准测试脚本 ✅
- [x] 创建 k6 压力测试脚本 ✅
- [x] 编写性能优化建议 ✅
- [x] 编写基准测试报告模板 ✅
- [ ] P95 延迟 <100ms (待实测)
- [ ] 支持 1000 并发 (待实测)
- [ ] 内存使用 <512MB (待实测)
- [ ] CPU 使用 <50% (待实测)

---

**负责人**: Slaver 4 (DevOps)
**状态**: Phase 1-3 完成，等待实际测试验证
**最后更新**: 2026-04-07
