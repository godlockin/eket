# EKET Framework 运维手册

**版本**: 2.0.0
**最后更新**: 2026-04-02

---

## 目录

1. [启动/停止流程](#启动停止流程)
2. [监控指标](#监控指标)
3. [故障排查](#故障排查)
4. [日常运维任务](#日常运维任务)

---

## 启动/停止流程

### 启动前检查清单

#### 1. 环境检查

```bash
# 检查 Node.js 版本
node --version  # 应该 >= v18.0.0

# 检查 npm 版本
npm --version   # 应该 >= 9.0.0

# 检查磁盘空间
df -h  # 确保有足够空间

# 检查内存
free -h  # 建议至少 2GB 可用
```

#### 2. 依赖服务检查

```bash
# 检查 Redis（如果使用）
redis-cli ping  # 应该返回 PONG

# 检查 Docker（如果使用 Docker Redis）
docker ps | grep redis

# 检查 SQLite 文件权限
ls -la ~/.eket/data/sqlite/
```

#### 3. 配置文件检查

```bash
# 检查环境变量
echo $EKET_REMOTE_REDIS_HOST
echo $EKET_LOCAL_REDIS_HOST
echo $EKET_SQLITE_PATH
echo $EKET_FILE_QUEUE_DIR
echo $EKET_API_KEY
```

### 启动流程

#### 方式 1: 直接启动

```bash
cd /path/to/eket/node

# 编译（如果是首次启动或代码有更新）
npm run build

# 启动实例
node dist/index.js start-instance
```

#### 方式 2: 使用启动脚本

```bash
# 进入项目目录
cd /path/to/project

# 启动 Agent 实例
/eket-start

# 启用自动模式（Slaver 自动领取任务）
/eket-start -a
```

#### 方式 3: 后台运行

```bash
# 使用 nohup
nohup node dist/index.js start-instance > eket.log 2>&1 &

# 使用 screen
screen -S eket
node dist/index.js start-instance
# Ctrl+A, D 分离会话

# 使用 tmux
tmux new -s eket
node dist/index.js start-instance
# Ctrl+B, D 分离会话
```

#### 方式 4: Docker 部署

```bash
# 构建镜像
docker build -t eket:latest .

# 运行容器
docker run -d \
  --name eket \
  -e EKET_LOCAL_REDIS_HOST=redis \
  -e EKET_API_KEY=your-api-key \
  -v /path/to/data:/.eket/data \
  eket:latest
```

### 停止流程

#### 优雅停止

```bash
# 找到进程 ID
ps aux | grep eket

# 发送 SIGTERM 信号（优雅停止）
kill <pid>

# 或使用 pkill
pkill -f "node.*start-instance"
```

#### 强制停止

```bash
# 仅在优雅停止失败时使用
kill -9 <pid>
```

#### 清理资源

```bash
# 清理临时文件
rm -rf /tmp/eket-*

# 清理锁文件（如果有）
rm -rf .eket/state/master_lock/
```

### 重启流程

```bash
# 1. 停止现有进程
pkill -f "node.*start-instance"

# 2. 等待进程完全退出
sleep 2

# 3. 清理锁文件（如果需要）
rm -rf .eket/state/master_lock/

# 4. 重新启动
node dist/index.js start-instance
```

---

## 监控指标

### 系统级指标

| 指标 | 健康阈值 | 告警阈值 | 检查命令 |
|------|----------|----------|----------|
| CPU 使用率 | < 70% | > 90% | `top -bn1 | grep "Cpu(s)"` |
| 内存使用率 | < 80% | > 95% | `free -h` |
| 磁盘使用率 | < 80% | > 90% | `df -h` |
| 打开文件数 | < 80% | > 95% | `lsof -p <pid> \| wc -l` |

### 应用级指标

#### 1. 连接级别

```bash
# 查看当前连接级别（通过日志）
tail -f eket.log | grep "ConnectionManager"

# 期望输出：
# [ConnectionManager] Connected to remote Redis
# 或
# [ConnectionManager] Connected to local Redis (fallback)
# 或
# [ConnectionManager] Connected to SQLite (fallback)
# 或
# [ConnectionManager] Using file system (final fallback)
```

**连接级别说明**:
| 级别 | 说明 | 状态 |
|------|------|------|
| Level 1 | 远程 Redis | 正常 |
| Level 2 | 本地 Redis | 降级 |
| Level 3 | SQLite | 降级 |
| Level 4 | 文件系统 | 严重降级 |

#### 2. Master 状态

```bash
# 检查 Master 标记文件
cat confluence/.eket_master_marker

# 查看 Master 选举日志
tail -f eket.log | grep "MasterElection"

# 期望输出：
# [MasterElection] instance_xxx starting election...
# [MasterElection] Lock acquired, waiting for declaration period...
```

#### 3. 实例状态

```bash
# 查看实例状态
/eket-status

# 查看心跳日志
tail -f eket.log | grep "Heartbeat"
```

#### 4. 任务统计

通过 Web Dashboard API 获取：

```bash
curl -s http://localhost:3000/api/stats | jq '.data'

# 输出示例：
# {
#   "totalInstances": 5,
#   "activeInstances": 2,
#   "idleInstances": 2,
#   "offlineInstances": 1,
#   "totalTasks": 50,
#   "inProgressTasks": 5,
#   "completedTasksToday": 12,
#   "successRate": 98.5
# }
```

### Web Dashboard

#### 启动 Dashboard

```bash
# 启动 Web 监控面板
node dist/index.js web:dashboard --port 3000

# 或指定主机
node dist/index.js web:dashboard --port 3000 --host 0.0.0.0
```

#### 访问 Dashboard

打开浏览器访问：`http://localhost:3000`

**监控面板功能**:
- 系统状态（连接级别、服务健康）
- 实例列表（状态、角色、负载）
- 任务进度（进行中、待处理）
- 统计数据（成功率、完成率）

### 告警配置

#### 预定义告警规则

| 告警 | 级别 | 触发条件 | 通知渠道 |
|------|------|----------|----------|
| Instance 离线 | Warning | 心跳超时 60 秒 | Slack/邮件 |
| 任务阻塞 | Warning | 任务停滞 30 分钟 | Slack/邮件 |
| 系统降级 | Error | 降级到 SQLite/文件 | Slack/邮件/钉钉 |
| Master 冲突 | Critical | 检测到多 Master | 电话/短信 |

#### 配置告警

```typescript
// 告警配置（在 config.yml 中）
alerting:
  enabled: true
  channels:
    slack:
      webhook: https://hooks.slack.com/xxx
    email:
      smtp: smtp.example.com
      from: alerts@example.com
      to: team@example.com
  rules:
    - name: instance_offline
      condition: heartbeat_timeout > 60
      level: warning
    - name: system_degraded
      condition: connection_level >= 3
      level: error
```

---

## 故障排查

### 常见问题诊断流程

```
问题报告
    │
    ↓
查看日志 → 定位模块
    │
    ↓
检查配置 → 验证设置
    │
    ↓
诊断工具 → 收集信息
    │
    ↓
应用修复 → 验证结果
```

### 故障排查表

| 问题 | 可能原因 | 诊断步骤 | 解决方案 |
|------|----------|----------|----------|
| 实例启动失败 | 端口占用、配置错误 | 1. 检查日志<br>2. 检查端口<br>3. 验证配置 | 1. 释放端口<br>2. 修正配置<br>3. 重启 |
| Redis 连接失败 | 服务宕机、网络问题 | 1. ping Redis<br>2. 检查网络<br>3. 查看降级日志 | 1. 重启 Redis<br>2. 检查防火墙<br>3. 接受降级 |
| Master 选举失败 | 锁冲突、时钟不同步 | 1. 检查锁文件<br>2. 查看选举日志<br>3. 检查时钟 | 1. 清理锁文件<br>2. 等待选举完成<br>3. 同步时钟 |
| 任务处理停滞 | 实例离线、死锁 | 1. 检查实例状态<br>2. 查看任务日志<br>3. 检查锁状态 | 1. 重启实例<br>2. 重新分配任务<br>3. 清理锁 |
| 磁盘空间不足 | 日志/队列积累 | 1. 检查磁盘使用<br>2. 查找大文件 | 1. 清理日志<br>2. 归档队列<br>3. 扩容 |

### 诊断工具

#### 系统诊断

```bash
# 运行系统诊断
./lib/adapters/hybrid-adapter.sh doctor

# 检查 Redis 连接
./lib/adapters/hybrid-adapter.sh redis:check

# 检查 SQLite 数据库
./lib/adapters/hybrid-adapter.sh sqlite:check

# 列出活跃 Slaver
./lib/adapters/hybrid-adapter.sh redis:list-slavers
```

#### 日志分析

```bash
# 查看最近的错误
tail -f eket.log | grep -i error

# 查看警告
tail -f eket.log | grep -i warn

# 查看特定模块日志
tail -f eket.log | grep "CircuitBreaker"

# 搜索特定时间段日志
grep "2026-04-02 10:" eket.log
```

#### 性能分析

```bash
# 查看进程资源使用
ps aux | grep node

# 查看打开文件数
lsof -p <pid> | wc -l

# 查看网络连接
netstat -anp | grep <port>
```

### 应急处理

#### Master 失效

```bash
# 1. 确认 Master 状态
cat confluence/.eket_master_marker

# 2. 如果 Master 实例已下线，等待自动选举（最多 30 秒）

# 3. 如果选举卡住，手动清理锁
rm -rf .eket/state/master_lock/
rm confluence/.eket_master_marker

# 4. 重启实例触发新选举
node dist/index.js start-instance
```

#### 系统降级

```bash
# 1. 确认当前级别
tail -f eket.log | grep "ConnectionManager"

# 2. 如果是 Redis 问题，尝试恢复
# Redis: systemctl restart redis

# 3. 如果无法恢复，接受降级并监控
# 系统在降级模式下仍可正常工作

# 4. 记录降级时间和原因
echo "$(date): System degraded to SQLite" >> ops-log.txt
```

#### 磁盘空间告急

```bash
# 1. 查看磁盘使用
df -h

# 2. 查找大文件
du -ah | sort -rh | head -20

# 3. 清理日志（保留最近 7 天）
find . -name "*.log" -mtime +7 -delete

# 4. 归档队列
# 文件队列会自动归档到 archive/目录

# 5. 清理临时文件
rm -rf /tmp/eket-*
```

---

## 日常运维任务

### 每日检查

```bash
# 1. 检查系统状态
curl -s http://localhost:3000/api/status | jq '.data.level'

# 2. 检查实例状态
/eket-status

# 3. 查看错误日志
grep -i "error\|fatal" eket.log | tail -20

# 4. 检查磁盘空间
df -h
```

### 每周任务

```bash
# 1. 清理旧日志（保留 30 天）
find . -name "*.log" -mtime +30 -delete

# 2. 归档处理的消息队列
# 自动归档，检查 archive/目录大小

# 3. 生成统计报告
./lib/adapters/hybrid-adapter.sh sqlite:report

# 4. 检查告警历史
grep "ALERT" eket.log | sort | uniq -c
```

### 每月任务

```bash
# 1. 备份 SQLite 数据库
cp ~/.eket/data/sqlite/eket.db ~/.eket/backups/eket-$(date +%Y%m).db

# 2. 备份配置文件
tar -czf eket-config-$(date +%Y%m).tar.gz .eket/config/

# 3. 审查性能指标
# 通过 Dashboard 或 API 导出历史数据

# 4. 更新依赖（如有安全更新）
cd node
npm audit
npm update
```

### 备份策略

```bash
#!/bin/bash
# backup-eket.sh

BACKUP_DIR=~/.eket/backups
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份 SQLite
cp ~/.eket/data/sqlite/eket.db $BACKUP_DIR/eket-db-$DATE.db

# 备份配置
tar -czf $BACKUP_DIR/eket-config-$DATE.tar.gz .eket/config/

# 备份队列（可选）
tar -czf $BACKUP_DIR/eket-queue-$DATE.tar.gz .eket/data/queue/

# 清理 30 天前的备份
find $BACKUP_DIR -mtime +30 -delete

echo "Backup completed: $DATE"
```

### 日志轮转

```bash
#!/bin/bash
# log-rotate.sh

LOG_DIR=./logs
MAX_SIZE=10485760  # 10MB
MAX_FILES=30

# 检查日志大小
for log in $LOG_DIR/*.log; do
  size=$(stat -c%s "$log" 2>/dev/null || echo 0)
  if [ "$size" -gt "$MAX_SIZE" ]; then
    # 轮转日志
    mv "$log" "$log.$(date +%Y%m%d_%H%M%S)"
    touch "$log"
  fi
done

# 清理旧日志
find $LOG_DIR -name "*.log.*" -mtime +$MAX_FILES -delete
```

---

## 相关文档

- [API 参考](../api/README.md)
- [故障排查指南](../troubleshooting/common-issues.md)
- [连接管理器](../../node/src/core/connection-manager.ts)
- [Master 选举](../../node/src/core/master-election.ts)

---

**文档维护**: EKET Framework Team
**反馈**: 请提交 Issue 到项目仓库
