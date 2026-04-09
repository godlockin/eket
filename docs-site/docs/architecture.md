---
sidebar_position: 3
---

# 架构设计

EKET 采用渐进式三级架构设计。

## 三级架构

```
┌─────────────────────────────────────────────────────────────┐
│  Level 1: Shell + 文件队列 (基础版)                          │
│  - 零外部依赖                                                │
│  - 文件队列消息传递                                          │
│  - 适合本地开发和小项目                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓ 渐进增强
┌─────────────────────────────────────────────────────────────┐
│  Level 2: Node.js + Redis (增强版)                           │
│  - Redis Pub/Sub 消息队列                                    │
│  - 实时心跳检测                                              │
│  - 适合团队协作                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓ 完整功能
┌─────────────────────────────────────────────────────────────┐
│  Level 3: SQLite + 分布式 (满血版)                           │
│  - SQLite 持久化存储                                         │
│  - 分布式实例部署                                            │
│  - 生产级高并发                                              │
└─────────────────────────────────────────────────────────────┘
```

## 运行时降级

```
Level 3 (SQLite + 分布式)
    ↓ Redis 不可用
Level 2 (Redis + 文件队列)
    ↓ Node.js 不可用
Level 1 (Shell 脚本)
```

## 核心模块

| 模块 | 职责 |
|------|------|
| `master-election.ts` | 三级 Master 选举（Redis SETNX / SQLite / File mkdir） |
| `connection-manager.ts` | 四级降级连接（Remote Redis → Local Redis → SQLite → File） |
| `message-queue.ts` | 消息队列（Redis Pub/Sub + 文件降级） |
| `circuit-breaker.ts` | 断路器（closed/open/half_open） |
| `cache-layer.ts` | LRU 内存缓存 + Redis 二级缓存 |
| `mindset-loader.ts` | 思维模板加载与注入 |
| `instance-registry.ts` | 实例注册与心跳管理 |

## 目录结构

```
project-root/
├── node/                      # Node.js CLI
│   ├── src/
│   │   ├── commands/          # CLI 命令实现
│   │   ├── core/              # 核心业务逻辑
│   │   ├── utils/             # 工具库
│   │   └── integration/       # 外部集成
│   └── tests/                 # 单元测试
├── .eket/                     # EKET 运行时
│   ├── templates/             # 思维模板
│   │   ├── master-workflow.md
│   │   └── slaver-workflow.md
│   └── state/                 # 状态存储
├── docs-site/                 # 文档站点
└── scripts/                   # 运维脚本
```
