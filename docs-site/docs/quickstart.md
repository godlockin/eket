---
sidebar_position: 2
---

# 快速开始

5 分钟上手 EKET Framework。

## 前置要求

- Node.js >= 18.0
- npm 或 yarn
- (可选) Redis - 用于 Level 2/3 架构

## 安装

```bash
# 克隆项目
git clone https://github.com/godlockin/eket.git
cd eket/node

# 安装依赖
npm install
```

## 配置

复制环境变量示例文件：

```bash
cp ../.env.example ../.env
```

关键配置：

```bash
# Redis 配置（Level 2）
EKET_REDIS_HOST=localhost
EKET_REDIS_PORT=6379

# SQLite 配置（Level 3）
EKET_SQLITE_PATH=~/.eket/data/sqlite/eket.db

# 日志配置
EKET_LOG_LEVEL=info
```

## 启动实例

### AI 自动模式

```bash
# 启动 AI 自动实例（自动领取任务）
node dist/index.js instance:start --auto
```

### 人工模式

```bash
# 列出可用角色
node dist/index.js instance:start --list-roles

# 启动指定角色实例
node dist/index.js instance:start --human --role frontend_dev
```

### 交互式启动

```bash
# 使用交互式向导
node dist/index.js instance:start --human
```

## 验证安装

```bash
# 系统诊断
node dist/index.js system:doctor

# Redis 连接检查
node dist/index.js redis:check

# SQLite 检查
node dist/index.js sqlite:check
```

## 下一步

- 阅读 [架构设计](architecture.md) 了解三级架构
- 查看 [CLI 命令参考](cli-reference.md) 了解所有命令
- 阅读 [Master/Slaver 工作流](master-slaver.md) 了解协作模式
