---
sidebar_position: 7
---

# 部署指南

使用 Docker Compose 一键部署 EKET。

## 前置要求

- Docker >= 20.10
- Docker Compose >= 2.0

## 快速部署

```bash
# 克隆项目
git clone https://github.com/godlockin/eket.git
cd eket

# 一键启动
docker-compose up -d
```

## 验证部署

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f eket

# 检查 Redis 连接
docker-compose exec redis redis-cli ping
```

期望输出：
```
NAME              STATUS
eket-redis        Up (healthy)
eket-instance     Up
```

## 配置

### 环境变量

创建 `.env` 文件：

```bash
# Redis 配置
EKET_REDIS_HOST=redis
EKET_REDIS_PORT=6379

# SQLite 配置
EKET_SQLITE_PATH=/app/data/eket.db

# 日志配置
EKET_LOG_LEVEL=info

# OpenCLAW API Key（可选）
OPENCLAW_API_KEY=your-api-key-here
```

### 端口映射

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | Web Dashboard | 任务看板 |
| 8899 | Hook Server | Agent 生命周期事件 |
| 8080 | OpenCLAW Gateway | API 网关 |

## 数据持久化

数据卷：
- `redis_data`: Redis 数据
- `eket_data`: SQLite 数据库和日志

备份：
```bash
docker-compose run --rm eket tar -czf /tmp/backup.tar.gz /app/data
docker cp eket-instance:/tmp/backup.tar.gz ./backup.tar.gz
```

## 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除数据卷
docker-compose down -v
```

## 生产环境部署

### 健康检查

```bash
# 检查服务健康状态
docker-compose ps --format json | jq '.[].Health'
```

### 日志聚合

```bash
# JSON 结构化日志
docker-compose logs --tail 100 eket | jq '.'
```

### 监控

访问 Web Dashboard: http://localhost:3000
