# Level 3: 满血版模式使用指南

**目标**: Redis + SQLite 生产级完整功能
**优先级**: ⭐⭐⭐ (生产环境推荐)
**版本**: v2.3.1
**最后更新**: 2026-04-08

---

## 🎯 Level 3 设计理念

**Level 3 是 EKET 的完整形态，提供生产级的分布式协作能力。**

核心特性：
- ✅ **Redis Pub/Sub**: 实时消息队列，低延迟通信
- ✅ **SQLite 持久化**: WAL 模式，数据可靠存储
- ✅ **分布式协作**: 多 Master/Slaver 跨机器协作
- ✅ **性能优化**: P95 延迟 < 5ms (Redis), < 10ms (SQLite)
- ✅ **优雅降级**: 故障时自动降级到 Level 2 或 Level 1

---

## 📊 Level 1/2/3 功能对比

| 功能类别 | Level 1 (Shell) | Level 2 (Node.js) | Level 3 (满血版) |
|---------|-----------------|-------------------|------------------|
| **消息队列** | 文件队列 (JSON) | 优化文件队列 + 去重 | Redis Pub/Sub + 文件降级 |
| **持久化存储** | 文件系统 | 文件系统 + 原子操作 | SQLite WAL 模式 |
| **实时通信** | 轮询 (10s) | 轮询 (5s) | Pub/Sub (< 100ms) |
| **并发支持** | 低 (~10 任务) | 中 (~100 任务) | 高 (~1000 任务) |
| **分布式** | ❌ 单机 | ❌ 单机 | ✅ 跨机器 |
| **心跳监控** | 文件 (60s) | Redis (30s) | Redis (10s) |
| **数据查询** | grep/awk | Node.js API | SQL 查询 |
| **性能 (P95)** | ~500ms | ~50ms | < 5ms |
| **启动时间** | 30s | 60s | 120s |
| **资源占用** | 最低 | 中等 | 较高 |

**选择建议**:
- **Level 1**: 快速原型、轻量环境、离线场景
- **Level 2**: 单机开发、中小规模项目
- **Level 3**: 生产环境、大规模协作、高并发需求

---

## 📋 前置要求

### 必需依赖

```bash
# 1. Node.js >= 18.0.0
node --version
# v18.0.0 或更高

# 2. npm >= 9.0.0
npm --version
# 9.0.0 或更高

# 3. Git >= 2.30.0
git --version
# git version 2.30.0 或更高

# 4. Redis >= 6.0 (本地或远程)
redis-cli --version
# redis-cli 6.0 或更高

# 5. Docker (可选，用于快速启动 Redis)
docker --version
# Docker version 20.0 或更高
```

### 可选依赖

- **远程 Redis**: 用于跨机器分布式协作
- **监控工具**: Prometheus + Grafana
- **日志聚合**: ELK Stack

---

## 🚀 快速启动 (5 分钟)

### 方式 1: Docker 一键启动 (推荐)

```bash
# 1. 克隆仓库
git clone https://github.com/godlockin/eket.git
cd eket

# 2. 启动 Redis (Docker)
./scripts/docker-redis.sh start

# 输出示例:
# [INFO] Starting Redis container...
# [INFO] Redis is running on localhost:6379
# [INFO] To stop: ./scripts/docker-redis.sh stop

# 3. 安装 Node.js 依赖
cd node
npm install

# 4. 构建项目
npm run build

# 5. 启动 Level 3 实例
export EKET_REDIS_HOST=localhost
export EKET_REDIS_PORT=6379
node dist/index.js instance:start --mode full-stack

# 输出示例:
# ========================================
# EKET 实例启动 v2.3.1
# ========================================
# [INFO] 运行级别: Level 3 (Full Stack)
# [INFO] Redis: ✅ 连接成功 (localhost:6379)
# [INFO] SQLite: ✅ 就绪 (~/.eket/data/sqlite/eket.db)
# [INFO] 角色: 自动检测中...
# [INFO] Master 已就绪
# [INFO] 实例 ID: master-full-20260408-001
```

### 方式 2: 本地 Redis 安装

#### macOS (Homebrew)

```bash
# 安装 Redis
brew install redis

# 启动 Redis 服务
brew services start redis

# 验证连接
redis-cli ping
# PONG
```

#### Linux (Ubuntu/Debian)

```bash
# 安装 Redis
sudo apt update
sudo apt install redis-server

# 启动服务
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 验证连接
redis-cli ping
# PONG
```

#### Linux (CentOS/RHEL)

```bash
# 安装 Redis
sudo yum install redis

# 启动服务
sudo systemctl start redis
sudo systemctl enable redis

# 验证连接
redis-cli ping
# PONG
```

---

## 🔧 环境配置

### 环境变量

复制 `.env.example` 为 `.env`，配置 Level 3 参数：

```bash
# Redis 配置 (本地)
EKET_REDIS_HOST=localhost
EKET_REDIS_PORT=6379
EKET_REDIS_PASSWORD=          # 可选

# Redis 配置 (远程 - 分布式场景)
EKET_REMOTE_REDIS_HOST=redis.example.com
EKET_REMOTE_REDIS_PORT=6379
EKET_REMOTE_REDIS_PASSWORD=your_secure_password

# SQLite 配置
EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db
EKET_SQLITE_WAL_MODE=true     # 推荐启用 WAL

# 日志配置
EKET_LOG_LEVEL=info           # debug|info|warn|error
EKET_LOG_DIR=./logs

# 性能配置
EKET_REDIS_CONNECTION_POOL_SIZE=10
EKET_REDIS_COMMAND_TIMEOUT=5000  # ms
EKET_SQLITE_BUSY_TIMEOUT=5000    # ms

# 监控配置
EKET_MEMORY_WARNING_THRESHOLD=0.75
EKET_DISK_WARNING_THRESHOLD=0.85
```

### 配置验证

```bash
# 运行系统诊断
node dist/index.js system:doctor

# 输出示例:
# ========================================
# EKET 系统诊断 v2.3.1
# ========================================
#
# [✓] Node.js: v20.11.0
# [✓] npm: v10.2.4
# [✓] Redis: 连接成功 (localhost:6379)
#     - 版本: 7.2.4
#     - 内存使用: 2.5 MB / 512 MB
#     - 已存储 keys: 0
# [✓] SQLite: 就绪
#     - 路径: /Users/user/.eket/data/sqlite/eket.db
#     - 大小: 24 KB
#     - WAL 模式: 已启用
# [✓] 磁盘空间: 45% 已使用 (安全)
# [✓] 内存: 62% 已使用 (正常)
#
# 系统健康状态: ✅ 良好 (Level 3 就绪)
```

---

## 💬 Redis 消息队列

### 架构设计

Level 3 使用 Redis Pub/Sub 实现实时消息传递：

```
Master ──publish──> Redis Channel ──subscribe──> Slaver 1
                          │
                          ├──subscribe──> Slaver 2
                          │
                          └──subscribe──> Slaver N
```

**频道设计**:
- `eket:tasks`: 任务分配和状态更新
- `eket:broadcast`: 全局广播消息
- `eket:heartbeats`: 心跳和健康检查
- `eket:slaver:{id}`: Slaver 专用频道

### 消息格式

```json
{
  "id": "msg_20260408_001",
  "from": "master-full-20260408-001",
  "to": "slaver-backend-001",
  "channel": "eket:tasks",
  "type": "assign_task",
  "timestamp": 1712556000000,
  "ttl": 300,
  "payload": {
    "task_id": "TASK-042",
    "epic": "EPIC-010",
    "title": "实现用户认证模块",
    "priority": "high",
    "estimated_hours": 8
  }
}
```

### 发送消息

```bash
# 使用 CLI 发送任务
node dist/index.js redis:publish \
  --channel "eket:tasks" \
  --message '{"type":"assign_task","task_id":"TASK-042"}'

# 输出:
# [INFO] 消息已发送到频道: eket:tasks
# [INFO] 订阅者数量: 3
```

### 订阅消息

```bash
# 订阅特定频道
node dist/index.js redis:subscribe --channel "eket:tasks"

# 输出:
# [INFO] 订阅频道: eket:tasks
# [INFO] 等待消息...
# [2026-04-08 15:30:00] 收到消息:
# {
#   "type": "assign_task",
#   "task_id": "TASK-042"
# }
```

### 性能基准

基于 `node/benchmarks/results/round4-benchmark-results.json` (1000 次迭代):

| 操作 | P50 | P95 | P99 | 目标 | 状态 |
|------|-----|-----|-----|------|------|
| **Redis Write** | 0.37ms | 0.96ms | 2.35ms | <5ms | ✅ |
| **Redis Read** | 0.30ms | 0.53ms | 0.73ms | <5ms | ✅ |

**并发性能** (P50):
- 1 并发: 0.47ms
- 10 并发: 1.04ms
- 100 并发: 5.61ms
- 500 并发: 15.97ms

**结论**: Level 3 Redis 在 100 并发以下表现优异，适合绝大多数生产场景。

---

## 💾 SQLite 持久化存储

### WAL 模式优化

Level 3 默认启用 Write-Ahead Logging (WAL) 模式：

```sql
-- 查看 WAL 状态
PRAGMA journal_mode;
-- wal

-- WAL 配置优化
PRAGMA wal_autocheckpoint=1000;  -- 每 1000 页自动 checkpoint
PRAGMA synchronous=NORMAL;       -- 平衡安全性和性能
```

**WAL 优势**:
- ✅ 读写并发: 读操作不阻塞写操作
- ✅ 高性能: P95 插入 < 0.05ms, 查询 < 0.01ms
- ✅ 崩溃恢复: 自动从 WAL 文件恢复

### 数据模型

#### 1. Retrospective 存储

```typescript
// 插入 Retrospective
node dist/index.js sqlite:insert-retro \
  --task-id "TASK-042" \
  --type "implementation" \
  --content "实现了 JWT 认证中间件"

// 查询 Retrospective
node dist/index.js sqlite:list-retros --limit 10

// 搜索 Retrospective
node dist/index.js sqlite:search "认证"
```

**数据结构**:
```sql
CREATE TABLE retrospectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'implementation', 'testing', 'review'
  content TEXT NOT NULL,
  metadata TEXT,       -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE INDEX idx_task_id ON retrospectives(task_id);
CREATE INDEX idx_created_at ON retrospectives(created_at);
```

#### 2. 知识库管理

```bash
# 添加知识条目
node dist/index.js knowledge:add \
  --type "pattern" \
  --title "React Hooks 最佳实践" \
  --content "使用 useCallback 避免不必要的重渲染..."

# 查询知识库
node dist/index.js knowledge:search "React Hooks"

# 统计报告
node dist/index.js sqlite:report
```

### 性能基准

基于 Round 4 benchmark (1000 次迭代):

| 操作 | P50 | P95 | P99 | 目标 | 状态 |
|------|-----|-----|-----|------|------|
| **SQLite Insert** | 0.03ms | 0.04ms | 0.10ms | <10ms | ✅ |
| **SQLite Select** | 0.00ms | 0.00ms | 0.02ms | <10ms | ✅ |

**结论**: SQLite WAL 模式在单机环境下性能远超 Redis，适合持久化存储。

---

## 🌐 分布式协作

### 多机器部署

Level 3 支持 Master 和 Slaver 运行在不同机器上：

#### 机器 A: Master

```bash
# 配置环境
export EKET_REDIS_HOST=redis.prod.example.com
export EKET_REDIS_PASSWORD=your_secure_password

# 启动 Master
node dist/index.js instance:start --role master --mode full-stack

# 输出:
# [INFO] Master 已就绪 (master-prod-001)
# [INFO] 等待 Slaver 注册...
```

#### 机器 B: Slaver 1

```bash
# 配置环境 (相同的 Redis)
export EKET_REDIS_HOST=redis.prod.example.com
export EKET_REDIS_PASSWORD=your_secure_password

# 启动 Slaver
node dist/index.js instance:start --role slaver --profile backend_dev

# 输出:
# [INFO] Slaver 已注册 (slaver-backend-001)
# [INFO] 连接到 Master: master-prod-001
# [INFO] 等待任务分配...
```

#### 机器 C: Slaver 2

```bash
# 启动另一个 Slaver
node dist/index.js instance:start --role slaver --profile frontend_dev

# 输出:
# [INFO] Slaver 已注册 (slaver-frontend-001)
```

### 心跳监控

Level 3 使用 Redis 实现高频心跳 (10s 间隔):

```bash
# 查看活跃 Slaver
node dist/index.js redis:list-slavers

# 输出:
# ========================================
# 活跃 Slaver 列表
# ========================================
# 1. slaver-backend-001
#    - 角色: backend_dev
#    - 状态: available
#    - 最后心跳: 5秒前
#    - 任务数: 2
#
# 2. slaver-frontend-001
#    - 角色: frontend_dev
#    - 状态: busy
#    - 最后心跳: 3秒前
#    - 任务数: 1
#
# 总计: 2 个活跃 Slaver
```

---

## 📈 性能优化

### 1. Redis 连接池

```typescript
// node/src/core/redis-client.ts 配置
const pool = new RedisConnectionPool({
  host: process.env.EKET_REDIS_HOST,
  port: parseInt(process.env.EKET_REDIS_PORT || '6379'),
  poolSize: 10,  // 连接池大小
  maxRetries: 3,
  retryDelay: 1000,
});
```

**调优建议**:
- **低并发** (<10 Slaver): `poolSize = 5`
- **中并发** (10-50 Slaver): `poolSize = 10`
- **高并发** (>50 Slaver): `poolSize = 20`

### 2. SQLite 优化

```sql
-- 设置缓存大小 (MB)
PRAGMA cache_size = -64000;  -- 64 MB

-- 设置 mmap 大小 (加速读取)
PRAGMA mmap_size = 268435456;  -- 256 MB

-- 禁用同步 (高风险，仅开发环境)
-- PRAGMA synchronous = OFF;  -- ⚠️ 不推荐生产环境
```

### 3. 监控指标

```bash
# 启动 Web 监控面板
node dist/index.js web:dashboard --port 3000

# 访问: http://localhost:3000
```

**关键指标**:
- Redis 连接数
- 消息队列长度
- SQLite 数据库大小
- 内存使用率
- CPU 使用率
- 任务处理延迟

---

## 🛡️ 降级策略

### 三级降级路径

Level 3 在故障时自动降级：

```
Level 3 (Redis + SQLite)
    ↓ Redis 不可用
Level 2 (文件队列 + SQLite)
    ↓ SQLite 不可用
Level 1 (纯文件系统)
```

### 降级触发条件

```typescript
// 自动降级逻辑
if (!redisAvailable) {
  logger.warn('Redis 不可用，降级到 Level 2');
  useFileQueue();
}

if (!sqliteAvailable) {
  logger.warn('SQLite 不可用，降级到 Level 1');
  useFileStorage();
}
```

### 手动降级

```bash
# 强制降级到 Level 2
export EKET_FORCE_LEVEL=2
node dist/index.js instance:start

# 强制降级到 Level 1
export EKET_FORCE_LEVEL=1
./scripts/eket-start.sh --role master
```

### 故障恢复

```bash
# 1. 检查系统状态
node dist/index.js system:doctor

# 2. 修复 Redis 连接
# - 检查 Redis 服务状态
sudo systemctl status redis

# - 重启 Redis (如需要)
sudo systemctl restart redis

# 3. 修复 SQLite 数据库
# - 检查文件权限
ls -lh ~/.eket/data/sqlite/eket.db

# - 运行数据库检查
sqlite3 ~/.eket/data/sqlite/eket.db "PRAGMA integrity_check;"

# 4. 重启 EKET 实例
node dist/index.js instance:start --mode full-stack
```

---

## 🔍 故障排查

### 问题 1: Redis 连接失败

**症状**:
```
[ERROR] Redis connection failed: ECONNREFUSED localhost:6379
[WARN] 降级到 Level 2 (文件队列)
```

**解决方案**:
```bash
# 检查 Redis 服务
redis-cli ping
# 如果返回 "Could not connect"

# 启动 Redis (Docker)
./scripts/docker-redis.sh start

# 或启动本地 Redis
sudo systemctl start redis
```

### 问题 2: SQLite 数据库锁定

**症状**:
```
[ERROR] database is locked (5)
```

**解决方案**:
```bash
# 检查是否有其他进程占用
lsof ~/.eket/data/sqlite/eket.db

# 如果确认无其他进程，删除 WAL 和 SHM 文件
rm ~/.eket/data/sqlite/eket.db-wal
rm ~/.eket/data/sqlite/eket.db-shm

# 重启实例
node dist/index.js instance:start
```

### 问题 3: 内存占用过高

**症状**:
```
[WARN] Memory usage: 85% (高于阈值 75%)
```

**解决方案**:
```bash
# 1. 减少 Redis 连接池大小
export EKET_REDIS_CONNECTION_POOL_SIZE=5

# 2. 减少 SQLite 缓存
sqlite3 ~/.eket/data/sqlite/eket.db "PRAGMA cache_size = -32000;"

# 3. 清理旧数据
node dist/index.js cleanup:old-data --days 30

# 4. 重启实例
node dist/index.js instance:start
```

---

## 🏗️ 生产环境最佳实践

### 1. 高可用部署

```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: always

  eket-master:
    build: .
    environment:
      - EKET_REDIS_HOST=redis
      - EKET_REDIS_PORT=6379
      - EKET_LOG_LEVEL=info
    depends_on:
      - redis
    restart: always

volumes:
  redis-data:
```

### 2. 监控和告警

```bash
# 启动监控服务
node dist/index.js web:dashboard --port 3000 &
node dist/index.js hooks:start --port 8899 &

# 配置 Prometheus (可选)
# 参考: docs/deployment/prometheus.md
```

### 3. 日志管理

```bash
# 日志轮转配置
# /etc/logrotate.d/eket
/path/to/eket/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### 4. 备份策略

```bash
# 备份 SQLite 数据库
sqlite3 ~/.eket/data/sqlite/eket.db ".backup /backup/eket-$(date +%Y%m%d).db"

# 备份 Redis (使用 RDB)
redis-cli BGSAVE

# 定期清理旧备份
find /backup -name "eket-*.db" -mtime +30 -delete
```

### 5. 安全加固

```bash
# Redis 安全配置
# /etc/redis/redis.conf
requirepass your_strong_password
bind 127.0.0.1  # 仅本地访问
protected-mode yes

# SQLite 文件权限
chmod 600 ~/.eket/data/sqlite/eket.db

# 环境变量保护
# 不要将 .env 提交到 Git
echo ".env" >> .gitignore
```

---

## 📚 进阶主题

### 1. 自定义消息处理器

```typescript
// 参考: node/src/core/message-queue.ts
import { MessageQueue } from './core/message-queue.js';

const queue = new MessageQueue({
  redisHost: 'localhost',
  redisPort: 6379,
});

queue.subscribe('custom:channel', async (message) => {
  console.log('收到自定义消息:', message);
  // 自定义处理逻辑
});
```

### 2. 扩展知识库

```typescript
// 参考: node/src/core/knowledge-base.ts
import { KnowledgeBase } from './core/knowledge-base.js';

const kb = new KnowledgeBase();

await kb.addEntry({
  type: 'pattern',
  title: '自定义设计模式',
  content: '...',
  tags: ['design', 'custom'],
});
```

### 3. 性能基准测试

```bash
# 运行完整基准测试
cd node
node benchmarks/simple-benchmark.js

# 查看结果
cat benchmarks/results/round4-benchmark-results.json
```

---

## 🔗 相关资源

### 文档
- [Level 1 Shell 模式指南](./SHELL-MODE.md)
- [Level 2 Node.js 模式指南](./NODEJS-MODE.md)
- [三级架构设计](../architecture/THREE-LEVEL-ARCHITECTURE.md)
- [降级策略详解](../architecture/DEGRADATION-STRATEGY.md)

### 代码参考
- `node/src/core/redis-client.ts`: Redis 客户端实现
- `node/src/core/sqlite-client.ts`: SQLite 客户端实现
- `node/src/core/message-queue.ts`: 消息队列实现
- `node/src/core/connection-manager.ts`: 四级连接降级

### 性能数据
- `node/benchmarks/results/round4-benchmark-results.json`: Round 4 性能基准
- `docs/validation/LEVEL1-SHELL-VALIDATION-REPORT.md`: Level 1 验证报告

---

## ❓ 常见问题

**Q: Level 3 相比 Level 2 的性能提升有多少？**
A: Redis 消息队列延迟降低 90% (P95: 50ms → 0.96ms)，SQLite 查询速度提升 80% (P95: 0.02ms vs 文件读取 ~0.1ms)。

**Q: 如何选择 Local Redis 还是 Remote Redis？**
A: 单机开发使用 Local Redis，生产环境或跨机器协作使用 Remote Redis。

**Q: SQLite 是否适合高并发写入？**
A: SQLite WAL 模式支持读写并发，但仅限单机。如需跨机器高并发写入，建议使用 PostgreSQL/MySQL。

**Q: 降级后数据会丢失吗？**
A: 不会。Level 3 → Level 2 降级时，Redis 队列消息会写入文件队列；Level 2 → Level 1 降级时，SQLite 数据保留在文件系统。

**Q: 如何监控 Level 3 性能？**
A: 使用 `node dist/index.js web:dashboard` 启动 Web 监控面板，或集成 Prometheus + Grafana。

---

**文档版本**: v2.3.1
**维护者**: EKET Framework Team
**最后更新**: 2026-04-08
**反馈**: 查看 [docs/](../) 目录或运行 `/eket-help`
