# EKET Framework v0.7 发布说明

**发布日期**: 2026-03-25
**版本**: 0.7.2 (最终版)

---

## 概述

EKET v0.7 是一个重大版本升级，引入了完整的 Node.js 混合架构，实现了高级功能模块，并进行了全面的代码质量提升。

---

## 主要特性

### 1. Node.js 混合架构

#### 核心模块

| 模块 | 功能 | 依赖 |
|------|------|------|
| `redis-client.ts` | Redis 客户端封装 | ioredis |
| `sqlite-client.ts` | SQLite 客户端封装 | better-sqlite3 |
| `message-queue.ts` | 混合消息队列 | ioredis / 文件队列 |
| `heartbeat-monitor.ts` | Slaver 心跳监控 | ioredis |
| `file-queue-manager.ts` | 文件队列持久化 | fs (Node.js 内置) |

#### 三级降级策略

```
┌─────────────────────────────────────────────────────────┐
│                   命令路由层                              │
├─────────────────────────────────────────────────────────┤
│  第一级：Node.js 高级功能                                 │
│  - Redis Pub/Sub 消息队列                                │
│  - Redis Hash 心跳存储                                   │
│  - SQLite 数据持久化                                     │
│                                                         │
│  ↓ (Redis 不可用)                                        │
│                                                         │
│  第二级：文件队列降级                                    │
│  - .eket/data/queue/*.json                              │
│  - 去重机制 (processed.json)                            │
│  - 过期清理 + 自动归档                                   │
│                                                         │
│  ↓ (Node.js 不可用)                                      │
│                                                         │
│  第三级：Shell 降级                                      │
│  - 基础文件操作                                          │
│  - Git 工作流                                            │
└─────────────────────────────────────────────────────────┘
```

---

### 2. Phase 2 核心功能

#### 2.1 项目初始化向导 (`init-wizard.ts`)

**功能**:
- 交互式配置三个 Git 仓库（confluence/jira/code_repo）
- 支持认证信息配置（用户名/Token）
- Redis 配置（可选）
- SQLite 配置（可选）
- 自动生成 `.eket/config.yml`

**使用方式**:
```bash
node node/dist/index.js init
```

#### 2.2 消息队列 (`message-queue.ts`)

**功能**:
- Redis 消息队列实现
- 文件队列降级模式
- 混合模式（自动降级）
- 支持订阅/发布模式

**使用方式**:
```typescript
const mq = createMessageQueue({ mode: 'auto' });
await mq.connect();
await mq.subscribe('task_updates', (message) => {
  console.log('收到消息:', message);
});
await mq.publish('test', createMessage(...));
```

#### 2.3 Slaver 心跳监控 (`heartbeat-monitor.ts`)

**功能**:
- `SlaverHeartbeatManager`: Slaver 端心跳发送
- `ActiveSlaverMonitor`: 监控端活跃状态检查
- 可配置心跳间隔和超时时间

**使用方式**:
```bash
# 启动心跳
node node/dist/index.js heartbeat:start slaver_001

# 查看状态
node node/dist/index.js heartbeat:status
```

---

### 3. Phase 3 高级功能

#### 3.1 PR 提交命令 (`submit-pr.ts`)

**功能**:
- 自动检测当前分支和目标分支
- 推送分支到远程仓库
- 创建 PR/MR（支持 GitHub/GitLab/Gitee）
- 添加 Reviewers（仅 GitHub）
- 启用自动合并（仅 GitHub）
- 发送 PR 通知到消息队列

**平台支持**:
| 平台 | PR 创建 | Reviewers | 自动合并 |
|------|--------|-----------|---------|
| GitHub | ✓ | ✓ | ✓ |
| GitLab | ✓ | ✗ | ✗ |
| Gitee | ✓ | ✗ | ✗ |

**使用方式**:
```bash
# 基础用法
node node/dist/index.js submit-pr

# 指定 PR 标题和描述
node node/dist/index.js submit-pr -t "feat: 用户登录" -d "实现 OAuth 2.0 登录功能"

# 添加 Reviewers
node node/dist/index.js submit-pr -r "alice,bob"

# 创建 Draft PR
node node/dist/index.js submit-pr --draft

# 启用自动合并
node node/dist/index.js submit-pr --auto-merge
```

#### 3.2 三仓库自动克隆 (`init-three-repos.sh`)

**增强功能**:
- 从 `.eket/config/config.yml` 读取配置
- 自动解析 YAML 配置
- 支持多平台（GitHub/GitLab/Gitee）
- 自动配置 Git submodule

**使用方式**:
```bash
# 在运行 init-wizard 后执行
./scripts/init-three-repos.sh
```

#### 3.3 文件队列持久化 (`file-queue-manager.ts`)

**功能**:
- 消息去重（基于 `processed.json`）
- 过期消息清理（默认 24 小时）
- 自动归档（默认 1 小时后）
- 定期清理（默认每小时）
- 历史导出

**配置**:
```typescript
const queue = createFileQueueManager({
  queueDir: './data/queue',
  archiveDir: './data/queue-archive',
  maxAge: 24 * 60 * 60 * 1000,      // 24 小时
  archiveAfter: 60 * 60 * 1000,     // 1 小时
});
```

---

## 完整 CLI 命令列表

### 系统命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `check` | 检查 Node.js 模块可用性 | `node node/dist/index.js check` |
| `doctor` | 诊断系统状态 | `node node/dist/index.js doctor` |

### Redis 命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `redis:check` | 检查 Redis 连接 | `node node/dist/index.js redis:check` |
| `redis:list-slavers` | 列出活跃 Slaver | `node node/dist/index.js redis:list-slavers` |

### SQLite 命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `sqlite:check` | 检查 SQLite 数据库 | `node node/dist/index.js sqlite:check` |
| `sqlite:list-retros` | 列出 Retrospective | `node node/dist/index.js sqlite:list-retros` |
| `sqlite:search <kw>` | 搜索 Retrospective | `node node/dist/index.js sqlite:search "性能"` |
| `sqlite:report` | 生成统计报告 | `node node/dist/index.js sqlite:report` |

### 任务管理命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `init` | 项目初始化向导 | `node node/dist/index.js init` |
| `claim [id]` | 领取任务 | `node node/dist/index.js claim FEAT-123` |
| `claim --auto` | 自动领取任务 | `node node/dist/index.js claim --auto` |
| `submit-pr` | 提交 PR | `node node/dist/index.js submit-pr -t "feat: 登录"` |

### 心跳监控命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `heartbeat:start <id>` | 启动心跳 | `node node/dist/index.js heartbeat:start slaver_001` |
| `heartbeat:status` | 查看心跳状态 | `node node/dist/index.js heartbeat:status` |

### 消息队列命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `mq:test` | 测试消息队列 | `node node/dist/index.js mq:test` |

---

## 代码质量提升 (v0.7.2)

### 类型安全

- 修复 ioredis ESM 兼容性问题
- 统一使用 `.js` 扩展名进行相对导入
- 添加显式类型注解和类型守卫

### 错误处理

- 使用 `EketError` 统一错误类型
- 添加错误码便于日志关联
- 改进错误上下文保留

### DRY 原则

- 创建 `yaml-parser.ts` 共享工具
- 消除重复的 `findProjectRoot()` 和 `parseSimpleYAML()` 函数
- 提取共用的类型定义

### 防御式编程

- 添加 null/undefined 检查
- 配置对象防御性拷贝
- 改进时间戳处理逻辑

### 不可变性

- `EketError` 属性改为 `readonly`
- 使用 `const` 默认，仅在必要时使用 `let`
- 返回新对象而非修改参数

---

## 目录结构

```
eket/
├── node/
│   ├── src/
│   │   ├── index.ts                      # CLI 入口
│   │   ├── types/
│   │   │   └── index.ts                  # 类型定义
│   │   ├── core/
│   │   │   ├── redis-client.ts           # Redis 客户端
│   │   │   ├── sqlite-client.ts          # SQLite 客户端
│   │   │   ├── message-queue.ts          # 消息队列
│   │   │   ├── heartbeat-monitor.ts      # 心跳监控
│   │   │   └── file-queue-manager.ts     # 文件队列
│   │   ├── commands/
│   │   │   ├── claim.ts                  # 任务领取
│   │   │   ├── claim-helpers.ts          # claim 辅助
│   │   │   ├── init-wizard.ts            # 初始化向导
│   │   │   └── submit-pr.ts              # PR 提交
│   │   └── utils/
│   │       ├── execFileNoThrow.ts        # 安全执行
│   │       ├── process-cleanup.ts        # 进程清理
│   │       └── yaml-parser.ts            # YAML 解析
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── init-project.sh                   # 项目初始化
│   ├── init-three-repos.sh               # 三仓库初始化
│   ├── enable-advanced.sh                # 启用高级功能
│   └── ...
├── lib/adapters/
│   └── hybrid-adapter.sh                 # 混合适配器
└── docs/
    ├── IMPLEMENTATION-v0.7-phase2.md     # Phase 2 文档
    ├── IMPLEMENTATION-v0.7-phase3.md     # Phase 3 文档
    └── v0.7-upgrade-guide.md             # 升级指南
```

---

## 安装和升级

### 新项目安装

```bash
# 1. 克隆模板
git clone https://github.com/your-org/eket-template.git my-project
cd my-project

# 2. 运行初始化向导
node node/dist/index.js init

# 3. 初始化三仓库
./scripts/init-three-repos.sh

# 4. 启用高级功能
./scripts/enable-advanced.sh
```

### 现有项目升级

详见 [docs/v0.7-upgrade-guide.md](docs/v0.7-upgrade-guide.md)

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` |
| `EKET_REDIS_PASSWORD` | Redis 密码 | - |

---

## 技术栈

### 运行时

- **Node.js**: >= 18.0.0
- **TypeScript**: 5.x
- **Target**: ES2022

### 依赖

```json
{
  "ioredis": "^5.x",
  "better-sqlite3": "^9.x",
  "commander": "^12.x"
}
```

### 开发

```json
{
  "@types/node": "^20.x",
  "typescript": "^5.x",
  "eslint": "^8.x"
}
```

---

## 变更日志

### v0.7.2 (2026-03-25)

**Refactor**:
- 类型安全修复和 ESM 兼容性改进
- 错误处理统一使用 `EketError`
- DRY 优化，创建 `yaml-parser.ts` 共享工具
- 防御式编程和不可变性改进

### v0.7.1 (2026-03-25)

**Feat**:
- PR 提交命令（支持 GitHub/GitLab/Gitee）
- 三仓库克隆增强（从 config.yml 读取）
- 文件队列持久化（去重、过期、归档）

### v0.7.0 (2026-03-24)

**Feat**:
- Node.js 混合架构实现
- Redis 客户端和 SQLite 客户端
- 消息队列和心跳监控
- 项目初始化向导
- 任务领取命令

---

## 贡献者

- EKET Framework Team
- Claude Opus 4.6 (代码质量改进)

---

**许可证**: MIT
**维护者**: EKET Framework Team
