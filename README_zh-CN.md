# EKET Framework

**EKET (Elite Knowledge & Engineering Team) - 人机特种部队协作协议 | Version 2.3.0**
**最后更新**: 2026-04-16

[English](README.md) | [中文说明](README_zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bash](https://img.shields.io/badge/Bash-4.0+-green.svg)](https://www.gnu.org/software/bash/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)

> **EKET (Elite Knowledge & Engineering Team)** 是一套**人机特种部队协作协议** — 既非个人工具，也非大型团队平台。
>
> 目标编制：**1–5 名人类**负责指明方向、做出决策、审查产出 — 加上 **N 个 AI Slaver** 大规模并行执行。人类 Slaver 和 AI Slaver 遵循完全相同的协议：认领 ticket、交付成果、接受 Review。协议本身不区分执行者是人还是 AI。
>
> 💡 **核心理念：人类判断力 × AI 执行密度**。当 Agent 承担执行量时，你只需极少数人类。EKET 将任务状态、消息总线和记忆引擎全部沉淀至本地文件系统和 Git — 三个物理分离的仓库（confluence / jira / code）。采用”纯 Shell → Node.js → Redis+SQLite”的三级渐进架构（Graceful Degradation），根据基础设施可用性自动降级，确保即便没有云服务，也能可靠地完成多智能体软件交付。

## 🎯 愿景与使命 (Vision & Mission)

- **愿景 (Vision)**：为人机特种部队团队提供协作协议：1–5 名人类指明方向，N 个 AI Agent 大规模执行。无论 Slaver 是人类还是 AI，同一套协议均适用 — 认领 ticket、交付、接受 Review，流程完全一致。
- **使命 (Mission)**：让 AI Agent 成为生产级协作者，而非玩具。通过严格的角色隔离（Master 掌控方向，Slaver 负责执行）、文件系统原生状态持久化，以及从 Rust → Shell 的优雅降级，EKET 确保即使没有云基础设施，也能可靠地进行多智能体软件交付。

## 🌟 核心理念与特性

- 🤖 **特种部队模型**：1–5 名人类提供方向和最终判断，N 个 AI Slaver 并行执行 ticket。人类 Slaver 与 AI Slaver 可互换 — 相同的 ticket schema、相同的 mailbox 协议、相同的 PR Review 关卡。Master 可以是人类或 AI。
- 🗂️ **三仓库物理分离**：`repo-confluence/`（知识库、架构文档、Skills）、`repo-jira/`（ticket 生命周期、任务状态、验收标准）和 `repo-code/`（实际代码交付物）是三个独立的 Git 仓库，拥有独立权限。当前 monorepo 是框架模板 — 真实部署时需物理拆分。各仓库间通过 mailbox 文件、文件队列和 SSE 通信。
- ⚙️ **工业级开发规范约束**：内置严格的工程标准 — Feature 分支流转、TDD、写代码前必输出 Analysis Report、强制 PR Review — 防止幻觉累加，保障输出质量。
- 🧠 **内置多级持久化记忆引擎**：分层记忆管理（短期会话缓存、长期项目经验字典、Confluence 全局架构知识库），越用越懂你的项目。
- 🛡️ **极其强悍的弹性生命力（三级运行态）**：
  - **Level 1 (纯 Shell)**：零依赖极速起步，能在任意受限机器上纯净运行。
  - **Level 2 (Node.js)**：自带 Web Dashboard、文件防拆错队列机制，面向大多数本地开发场景。
  - **Level 3 (混合全栈)**：接入 Redis/SQLite 激活高可用状态，面对高并发多角色 Agent 的集群级生产场景。

---

## 🚀 30 秒快速启动 (Level 1 - Shell 模式)

**零依赖，纯 Bash，立即可用！**

```bash
# 1. 克隆仓库
git clone https://github.com/godlockin/eket.git
cd eket

# 2. 启动 Master
./scripts/eket-start.sh --role master

# 3. (新终端) 启动 Slaver
./scripts/eket-start.sh --role slaver --profile backend_dev

# 完成！开始协作 🎉
```

**前置要求**：
- ✅ Bash >= 4.0
- ✅ Git >= 2.30
- ❌ 不需要 Node.js
- ❌ 不需要 Redis
- ❌ 不需要任何安装

---

## 📚 三级架构 - 渐进增强设计

EKET 采用**渐进式三级架构**，确保在不同环境下都能稳定运行：

### Level 1: Shell + 文档 (基础版) ⭐⭐⭐⭐⭐

**目标**：所有核心功能可用，零配置启动

```bash
# 30 秒启动，无需安装任何依赖
./scripts/eket-start.sh --role master
```

**功能**：
- ✅ Master-Slaver 协作
- ✅ 任务分配和认领
- ✅ 文件队列消息传递
- ✅ 心跳监控
- ✅ 状态跟踪

**依赖**：Bash 4.0+, Git 2.30+

**适用场景**：快速试用、最小化部署、纯 Shell 环境

---

### Level 2: Node.js + 文件队列 (增强版) ⭐⭐⭐⭐

**目标**：更高效、更专业、更丰富

```bash
# 安装和构建
cd node && npm install && npm run build

# 启动 (自动使用 Node.js 模式)
node dist/index.js instance:start --role master

# Web Dashboard
node dist/index.js web:dashboard --port 3000
```

**相比 Level 1 增加**：
- ✅ TypeScript 类型安全
- ✅ 丰富的 CLI 命令
- ✅ 优化的文件队列（去重、归档、校验）
- ✅ 断路器和重试机制
- ✅ LRU 内存缓存
- ✅ Web Dashboard
- ✅ OpenCLAW Gateway

**依赖**：Node.js 18+, npm 9+

**适用场景**：本地开发、团队协作、需要更好性能

---

### Level 3: Redis + SQLite (满血版) ⭐⭐⭐

**目标**：生产级、高并发、分布式

```bash
# 启动 Redis (Docker 推荐)
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine

# 启动 (自动检测 Redis，使用满血模式)
node dist/index.js instance:start --role master
```

**相比 Level 2 增加**：
- ✅ Redis Pub/Sub 实时消息
- ✅ Redis 连接池和主从切换
- ✅ SQLite 持久化存储 (WAL 模式)
- ✅ 三级 Master 选举
- ✅ 分布式缓存 (LRU + Redis)
- ✅ 知识库系统
- ✅ 事务支持

**依赖**：Level 2 + Redis 6.0+, SQLite 3.35+, Docker (可选)

**适用场景**：生产环境、高并发、分布式部署

---

## 🔄 运行时自动降级

系统在运行时根据依赖可用性自动降级，确保稳定运行：

```
Level 3 (Redis + SQLite)
  ↓ Redis 不可用
Level 2 (Node.js + 文件队列)
  ↓ Node.js 不可用
Level 1 (Shell + 文件队列)
  ↓ 所有失败
优雅退出 + 错误日志
```

**检查当前运行级别**：
```bash
./lib/adapters/hybrid-adapter.sh check

# 输出示例：
# [INFO] Node.js: ✅ 可用
# [INFO] Redis: ❌ 不可用
# [INFO] Shell: ✅ 可用
# [INFO] 当前运行级别: Level 2 (Node.js + 文件队列)
```

---

## 🎯 核心理念

> **一切皆 Task** —— 从需求分析到代码合并，所有工作都是 Task，只是难度和持续时间不同。

每个 Agent 是独立的 Instance，主动承接符合自己角色的任务。

---

## 🏗️ Master-Slaver 架构

```
┌─────────────────────────────────────────────────────────┐
│                    Master Node (长期存活)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ 监控服务    │  │ PR 审核     │  │ 任务调度    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │  Slaver 1  │  │  Slaver 2  │  │  Slaver N  │
  │ (Frontend) │  │ (Backend)  │  │  (QA)      │
  └────────────┘  └────────────┘  └────────────┘
```

---

## 📋 常用命令

### Level 1 (Shell)

```bash
# 启动 Master/Slaver
./scripts/eket-start.sh --role master
./scripts/eket-start.sh --role slaver --profile backend_dev

# 心跳监控
./scripts/heartbeat-monitor.sh

# 生成统计报告
./scripts/generate-stats.sh

# Docker 服务管理
./scripts/docker-redis.sh      # 启动/停止 Redis
./scripts/docker-sqlite.sh     # SQLite 管理

# 查看帮助
./lib/adapters/hybrid-adapter.sh --help
```

### Level 2/3 (Node.js)

```bash
# 构建
cd node && npm run build

# 系统诊断
node dist/index.js system:doctor

# 实例管理
node dist/index.js instance:start --auto
node dist/index.js instance:start --human --role frontend_dev

# Redis 操作 (Level 3)
node dist/index.js redis:check
node dist/index.js redis:list-slavers

# SQLite 操作 (Level 3)
node dist/index.js sqlite:check
node dist/index.js sqlite:list-retros
node dist/index.js sqlite:search "<keyword>"

# Web 服务
node dist/index.js web:dashboard --port 3000
node dist/index.js hooks:start --port 8899
node dist/index.js gateway:start --port 8080  # OpenCLAW Gateway

# 性能测试 (Level 3)
node benchmarks/simple-benchmark.js
```

---

## 📊 功能对比

| 功能 | Level 1 | Level 2 | Level 3 |
|------|:-------:|:-------:|:-------:|
| **Master-Slaver 协作** | ✅ | ✅ | ✅ |
| **任务分配认领** | ✅ | ✅ | ✅ |
| **心跳监控** | ✅ | ✅ | ✅ |
| **消息传递** | 文件队列 | 优化文件队列 | Redis Pub/Sub |
| **消息去重归档** | ❌ | ✅ | ✅ |
| **断路器重试** | ❌ | ✅ | ✅ |
| **LRU 缓存** | ❌ | 内存 | 内存 + Redis |
| **Master 选举** | 文件锁 | 文件锁 | Redis + SQLite + 文件 |
| **知识库** | ❌ | ❌ | ✅ |
| **Web Dashboard** | ❌ | ✅ | ✅ |
| **OpenCLAW 集成** | ❌ | ✅ | ✅ |
| **分布式部署** | ❌ | ❌ | ✅ |
| **启动时间** | 30秒 | 1-2分钟 | 2-3分钟 |
| **内存占用** | <10MB | 50-100MB | 100-200MB |

---

## 📖 文档导航

### 快速入门
- **[30秒启动](docs/guides/QUICK-START.md)** - Level 1 Shell 模式快速启动
- **[三级架构详解](docs/architecture/THREE-LEVEL-ARCHITECTURE.md)** - 架构设计和选择指南
- **[降级策略](docs/architecture/DEGRADATION-STRATEGY.md)** - 自动降级机制

### Level 1 文档 (Shell + 文档)
- **[Shell 模式指南](docs/guides/SHELL-MODE.md)** - 纯 Shell 使用指南
- **[文件队列详解](docs/architecture/FILE-QUEUE.md)** - 文件队列消息机制
- **[Shell 脚本参考](docs/guides/SHELL-SCRIPTS.md)** - 所有 Shell 脚本说明

### Level 2 文档 (Node.js)
- **[Node.js 模式指南](docs/guides/NODEJS-MODE.md)** - Node.js 功能和 CLI
- **[CLI 命令参考](docs/guides/CLI-COMMANDS.md)** - 完整命令列表
- **[Web Dashboard](docs/api/WEB-DASHBOARD.md)** - 仪表板使用

### Level 3 文档 (满血版)
- **[满血模式指南](docs/guides/FULL-STACK-MODE.md)** - Redis + SQLite 配置
- **[性能优化](docs/performance/OPTIMIZATION.md)** - 性能调优指南
- **[分布式部署](docs/guides/DISTRIBUTED-DEPLOYMENT.md)** - 多节点部署

### 架构设计
- **[Master-Slaver 架构](docs/architecture/MASTER-SLAVER.md)** - 核心架构设计
- **[连接管理器](docs/architecture/CONNECTION-MANAGER.md)** - 四级降级逻辑
- **[消息队列](docs/architecture/MESSAGE-QUEUE.md)** - Redis Pub/Sub + 文件队列

### 开发指南
- **[贡献指南](CONTRIBUTING.md)** - 如何贡献代码
- **[测试指南](docs/guides/TESTING.md)** - 测试框架和用例
- **[开发流程](docs/guides/DEVELOPMENT.md)** - 开发最佳实践

---

## 🎓 使用场景推荐

### 场景 1: 快速试用 EKET
**推荐**: **Level 1** (Shell)
```bash
git clone https://github.com/godlockin/eket.git && cd eket
./scripts/eket-start.sh --role master
```
**为什么**: 零配置，30 秒体验完整功能

---

### 场景 2: 本地开发项目
**推荐**: **Level 2** (Node.js + 文件队列)
```bash
cd node && npm install && npm run build
node dist/index.js instance:start --role master
node dist/index.js web:dashboard --port 3000
```
**为什么**: 丰富功能，无需外部依赖，有 Web 界面

---

### 场景 3: 团队协作
**推荐**: **Level 3** (Redis + SQLite)
```bash
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine
node dist/index.js instance:start --role master
```
**为什么**: 实时消息，支持多 Slaver 并发

---

### 场景 4: 生产环境
**推荐**: **Level 3** + 高可用
```bash
# Redis 主从配置
# SQLite 定期备份
# 多 Master 选举
# 完整监控告警
```
**为什么**: 分布式支持，高可用保障

---

## 🛠️ 环境变量

```bash
# 通用配置
export EKET_LOG_LEVEL=info          # debug | info | warn | error
export EKET_LOG_DIR=./logs

# Level 3 Redis 配置
export EKET_REDIS_HOST=localhost
export EKET_REDIS_PORT=6379
export EKET_REMOTE_REDIS_HOST=      # 远程 Redis (主从)

# Level 3 SQLite 配置
export EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db

# Level 3 性能配置
export EKET_MEMORY_WARNING_THRESHOLD=0.75
export EKET_MEMORY_CRITICAL_THRESHOLD=0.9
```

---

## 📊 性能基准 (Level 3)

**Round 4 验证数据** (2026-04-08, Docker Redis):

| 操作 | P95 延迟 | 目标 | 结果 |
|------|----------|------|------|
| Redis Write | 0.96ms | <5ms | ✅ |
| Redis Read | 0.53ms | <5ms | ✅ |
| SQLite Insert (WAL) | 0.04ms | <10ms | ✅ |
| SQLite Select | 0.00ms | <10ms | ✅ |
| File Queue Enqueue | 1.30ms | <20ms | ✅ |
| File Queue Dequeue | 1.09ms | <20ms | ✅ |

**运行基准测试**:
```bash
node node/benchmarks/simple-benchmark.js
```

详细报告：[性能测试报告](docs/performance/TASK-015-completion-report.md)

---

## 🤝 贡献

欢迎贡献代码、文档或 Issue！请阅读 [贡献指南](CONTRIBUTING.md)。

---

## 📜 许可证

[MIT License](LICENSE)

---

## 🔗 相关链接

- **GitHub**: https://github.com/godlockin/eket
- **文档**: [docs/](docs/)
- **Issues**: https://github.com/godlockin/eket/issues
- **Discord**: (待建立)

---

## 🎯 版本历史

- **v2.3.0** (2026-04-08) - Round 3 自举完成，测试通过率 87%，性能验证
- **v2.2.0** (2026-04-07) - Round 2 大规模优化，35,775+ 行代码
- **v2.1.1** (2026-04-06) - Round 1 自举系统首次运行
- **v2.0.0** (2026-04-05) - Node.js 混合架构，三级降级

详见：[CHANGELOG.md](CHANGELOG.md)

---

**开始你的 EKET 之旅吧！** 🚀

```bash
git clone https://github.com/godlockin/eket.git && cd eket
./scripts/eket-start.sh --role master
```
