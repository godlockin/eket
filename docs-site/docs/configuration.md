---
sidebar_position: 6
---

# 配置参考

EKET 的配置选项和环境变量。

## 环境变量

复制 `.env.example` 为 `.env` 进行配置。

### 核心配置

| 变量 | 说明 | 默认值 | 必需 |
|------|------|--------|------|
| `OPENCLAW_API_KEY` | OpenCLAW Gateway API Key | 无 | 否 |
| `EKET_REDIS_HOST` | Redis 主机 | `localhost` | 否 |
| `EKET_REDIS_PORT` | Redis 端口 | `6379` | 否 |
| `EKET_SQLITE_PATH` | SQLite 数据库路径 | `~/.eket/data/sqlite/eket.db` | 否 |

### 日志配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_LOG_LEVEL` | 日志级别 | `info` |
| `EKET_LOG_DIR` | 日志目录 | `./logs` |

### 高级配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_REMOTE_REDIS_HOST` | 远程 Redis（连接管理器） | 无 |
| `EKET_MEMORY_WARNING_THRESHOLD` | 内存告警阈值 | `0.75` |

## 实例配置

实例配置文件位于 `.eket/state/instance_config.yml`。

### 配置项

```yaml
# 实例角色
role: master  # 或 slaver

# Slaver profile（仅 Slaver 角色）
profile: frontend_dev

# 项目根目录
project_root: /path/to/project

# 自动模式
auto_mode: true  # 自动领取任务
```

## 思维模板配置

思维模板位于 `.eket/templates/` 目录。

| 文件 | 说明 |
|------|------|
| `master-workflow.md` | Master 思维模板 |
| `slaver-workflow.md` | Slaver 思维模板 |

模板变量：
- `{{start_time}}` - 启动时间
- `{{instance_id}}` - 实例 ID
- `{{agent_type}}` - Agent 类型（Slaver）
- `{{task_id}}` - 任务 ID（Slaver）
