# EKET Node.js CLI

**版本**: 2.0.0
**描述**: EKET Framework CLI — TypeScript/Node.js 实现

---

## 快速开始

```bash
cd node/
npm install
npm run build
node dist/index.js system:doctor   # 验证安装
```

---

## 可用命令

### 系统

| 命令 | 功能 |
|------|------|
| `system:check` | 检查 Node.js 模块可用性 |
| `system:doctor` | 诊断系统整体状态 |

### Redis

| 命令 | 功能 |
|------|------|
| `redis:check` | 检查 Redis 连接状态 |
| `redis:list-slavers` | 列出所有活跃 Slaver |

### SQLite

| 命令 | 功能 |
|------|------|
| `sqlite:check` | 检查 SQLite 数据库状态 |
| `sqlite:list-retros` | 列出所有 Retrospective |
| `sqlite:search <keyword>` | 搜索 Retrospective |
| `sqlite:report` | 生成统计报告 |

### 项目与实例

| 命令 | 功能 |
|------|------|
| `project:init` | 项目初始化向导 |
| `instance:start` | 启动 Agent 实例 |
| `heartbeat:start <slaverId>` | 启动 Slaver 心跳上报 |
| `heartbeat:status` | 查看心跳状态 |
| `queue:test` | 测试消息队列连通性 |

### 高级功能

| 命令 | 功能 |
|------|------|
| `web:dashboard` | 启动 Web 监控面板（默认 port 3000） |
| `hooks:start` | 启动 HTTP Hook 服务器 |
| `pool:status` | 查看 Agent Pool 状态 |
| `pool:select` | 从 Pool 中选取 Agent |
| `gateway:start` | 启动 API Gateway |

---

## 目录结构

```
node/
├── src/
│   ├── index.ts              # CLI 入口
│   ├── types/index.ts        # TypeScript 类型定义
│   ├── core/                 # 核心模块
│   │   ├── redis-client.ts         # Redis 客户端
│   │   ├── sqlite-client.ts        # SQLite 客户端
│   │   ├── connection-manager.ts   # 四级降级连接管理
│   │   ├── master-election.ts      # Master 选举（三级分布式锁）
│   │   ├── master-context.ts       # Master 认知连续性
│   │   ├── context-snapshot.ts     # 任务上下文快照
│   │   ├── message-queue.ts        # 消息队列
│   │   ├── workflow-engine.ts      # 工作流引擎（含判断点）
│   │   ├── knowledge-base.ts       # 知识库（含默会知识类型）
│   │   ├── circuit-breaker.ts      # 断路器
│   │   ├── cache-layer.ts          # LRU 缓存层
│   │   ├── agent-pool.ts           # Agent Pool 管理
│   │   └── ...                     # 其他核心模块
│   ├── commands/             # CLI 命令实现
│   ├── api/                  # HTTP API & WebSocket
│   └── utils/                # 工具函数
└── tests/                    # 测试套件（~800 个测试用例）
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `EKET_REMOTE_REDIS_HOST` | — | 远程 Redis 主机（可选） |
| `EKET_LOCAL_REDIS_HOST` | `localhost` | 本地 Redis 主机 |
| `EKET_LOCAL_REDIS_PORT` | `6379` | 本地 Redis 端口 |
| `EKET_SQLITE_PATH` | `~/.eket/data/sqlite/eket.db` | SQLite 数据库路径 |
| `EKET_FILE_QUEUE_DIR` | `./.eket/data/queue` | 文件队列目录 |
| `EKET_API_KEY` | — | API 认证密钥（必须通过环境变量设置） |

---

## 连接降级策略

```
Remote Redis → Local Redis → SQLite → File Queue
```

`ConnectionManager` 自动选择最高可用级别，支持在高级别连接恢复时自动升级。

---

## 开发

```bash
npm run build    # TypeScript 编译
npm test         # 运行测试套件
npm run lint     # ESLint 检查
npm run format   # Prettier 格式化
```

### 添加新命令

1. 在 `src/commands/` 新建命令文件（返回 `Result<T>`，不抛异常）
2. 在 `src/index.ts` 注册命令
3. 重新构建：`npm run build`

---

## 核心依赖

| 包 | 用途 |
|------|------|
| `ioredis` | Redis 客户端 |
| `better-sqlite3` | SQLite |
| `commander` | CLI 框架 |
| `express` | HTTP API 服务器 |
| `ws` | WebSocket |
| `zod` | 运行时类型验证 |
