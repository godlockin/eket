---
sidebar_position: 5
---

# CLI 命令参考

完整的 EKET CLI 命令文档。

## 系统命令

```bash
# 系统诊断
node dist/index.js system:doctor

# 系统检查
node dist/index.js system:check
```

## 实例管理

```bash
# 启动实例（AI 自动模式）
node dist/index.js instance:start --auto

# 启动实例（人工模式）
node dist/index.js instance:start --human --role <role>

# 列出可用角色
node dist/index.js instance:start --list-roles

# 设置实例角色
node dist/index.js instance:set-role <role>
```

### 可用角色

| 角色 | 说明 |
|------|------|
| `frontend_dev` | 前端开发 |
| `backend_dev` | 后端开发 |
| `qa_engineer` | 测试工程师 |
| `devops_engineer` | DevOps 工程师 |

## 任务管理

```bash
# 项目初始化
node dist/index.js project:init

# 领取任务
node dist/index.js task:claim [id]
```

## Redis 命令

```bash
# Redis 连接检查
node dist/index.js redis:check

# 列出 Slaver 实例
node dist/index.js redis:list-slavers
```

## SQLite 命令

```bash
# SQLite 检查
node dist/index.js sqlite:check

# 列出回顾记录
node dist/index.js sqlite:list-retros

# 搜索关键词
node dist/index.js sqlite:search "<keyword>"

# 生成报告
node dist/index.js sqlite:report
```

## 服务命令

```bash
# Web 仪表盘
node dist/index.js web:dashboard --port 3000

# Hook 服务器
node dist/index.js hooks:start --port 8899

# OpenCLAW API 网关
node dist/index.js gateway:start --port 8080
```

## Agent Pool

```bash
# Pool 状态
node dist/index.js pool:status

# 选择 Agent（按角色）
node dist/index.js pool:select -r <role>
```

## 开发模式

```bash
# 使用 ts-node 运行（无需构建）
npm run dev -- <command>
```
