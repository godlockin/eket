# EKET Node.js CLI

**版本**: 0.7.0
**描述**: EKET Framework CLI - Node.js 高级功能实现

---

## 目录结构

```
node/
├── package.json              # NPM 配置和依赖
├── tsconfig.json             # TypeScript 配置
├── src/
│   ├── index.ts              # CLI 入口文件
│   ├── types/
│   │   └── index.ts          # TypeScript 类型定义
│   ├── core/
│   │   ├── redis-client.ts   # Redis 客户端模块
│   │   └── sqlite-client.ts  # SQLite 客户端模块
│   ├── commands/             # CLI 命令实现（待扩展）
│   └── utils/                # 工具函数（待扩展）
└── dist/                     # 编译后的 JavaScript（构建生成）
```

---

## 快速开始

### 1. 安装依赖

```bash
# 运行安装脚本
./scripts/enable-advanced.sh

# 或手动安装
cd node/
npm install
npm run build
```

### 2. 验证安装

```bash
# 检查 Node.js 模块可用性
node node/dist/index.js check

# 系统诊断
node node/dist/index.js doctor
```

### 3. 使用命令

```bash
# 通过混合适配器（推荐）
./lib/adapters/hybrid-adapter.sh redis:check
./lib/adapters/hybrid-adapter.sh sqlite:report

# 或直接调用
node node/dist/index.js redis:list-slavers
node node/dist/index.js sqlite:list-retros
```

---

## 可用命令

### Redis 相关

| 命令 | 功能 |
|------|------|
| `redis:check` | 检查 Redis 连接状态 |
| `redis:list-slavers` | 列出所有活跃 Slaver |

### SQLite 相关

| 命令 | 功能 |
|------|------|
| `sqlite:check` | 检查 SQLite 数据库状态 |
| `sqlite:list-retros` | 列出所有 Retrospective |
| `sqlite:search <keyword>` | 搜索 Retrospective |
| `sqlite:report` | 生成统计报告 |

### 系统命令

| 命令 | 功能 |
|------|------|
| `check` | 检查 Node.js 模块可用性 |
| `doctor` | 诊断系统状态 |

---

## 环境配置

### Redis 配置

通过环境变量配置 Redis 连接：

```bash
export EKET_REDIS_HOST=localhost
export EKET_REDIS_PORT=6379
export EKET_REDIS_PASSWORD=your_password  # 可选
```

### SQLite 配置

SQLite 数据库默认位置：

```
~/.eket/data/sqlite/eket.db
```

---

## 降级策略

EKET Node.js CLI 实现了三级降级策略：

### Level 1: Node.js 实现（高级功能）

- Redis 客户端（Slaver 心跳监控）
- SQLite 客户端（数据持久化）
- 复杂 CLI 命令

### Level 2: Shell 实现（基础功能）

- Docker 容器管理
- 基础脚本功能

### Level 3: 文件队列（离线模式）

当 Node.js 和 Shell 实现都不可用时，命令被写入队列文件，待系统恢复后执行。

---

## 开发指南

### 添加新命令

1. 在 `src/commands/` 创建命令文件：

```typescript
// src/commands/example.ts
import { Command } from 'commander';

export function registerExample(program: Command) {
  program
    .command('example')
    .description('示例命令')
    .option('-n, --name <name>', '名称')
    .action((options) => {
      console.log(`Hello, ${options.name || 'World'}!`);
    });
}
```

2. 在 `src/index.ts` 中注册：

```typescript
import { registerExample } from './commands/example.js';
registerExample(program);
```

3. 重新构建：

```bash
npm run build
```

### TypeScript 类型定义

所有类型定义在 `src/types/index.ts`，包括：

- Job 相关类型
- Redis 相关类型
- SQLite 相关类型
- Message Queue 相关类型
- CLI 相关类型
- Agent 相关类型
- Error 相关类型

---

## 依赖说明

### 核心依赖

| 包 | 用途 |
|------|------|
| `ioredis` | Redis 客户端 |
| `better-sqlite3` | SQLite ORM |
| `commander` | CLI 框架 |
| `zod` | 运行时类型验证 |

### 开发依赖

| 包 | 用途 |
|------|------|
| `typescript` | TypeScript 编译器 |
| `ts-node` | TypeScript 运行时 |
| `eslint` | 代码检查 |
| `jest` | 测试框架 |

---

## 故障排除

### 问题 1: "Node.js 模块未找到"

**解决方案**:
```bash
./scripts/enable-advanced.sh
```

### 问题 2: "Redis 连接失败"

**解决方案**:
```bash
# 检查 Redis 容器是否运行
./scripts/docker-redis.sh status

# 启动 Redis
./scripts/docker-redis.sh start
```

### 问题 3: "SQLite 数据库不存在"

**解决方案**:
```bash
# 初始化数据库
./scripts/docker-sqlite.sh init
```

---

## 测试

```bash
# 运行单元测试
npm test

# 运行 lint
npm run lint

# 清理构建产物
npm run clean
```

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-24
