# EKET Framework 故障排查指南

**版本**: 2.0.0
**最后更新**: 2026-04-02

---

## 目录

1. [常见问题列表](#常见问题列表)
2. [诊断步骤](#诊断步骤)
3. [解决方案](#解决方案)
4. [获取帮助](#获取帮助)

---

## 常见问题列表

### 启动问题

| 问题 ID | 问题描述 | 严重程度 |
|---------|----------|----------|
| START-001 | 实例启动失败 | P0 |
| START-002 | Master 选举卡住 | P0 |
| START-003 | 端口被占用 | P1 |
| START-004 | 环境变量未设置 | P2 |

### 连接问题

| 问题 ID | 问题描述 | 严重程度 |
|---------|----------|----------|
| CONN-001 | Redis 连接失败 | P0 |
| CONN-002 | SQLite 连接失败 | P1 |
| CONN-003 | 文件系统权限错误 | P1 |
| CONN-004 | 连接降级频繁 | P2 |

### 任务问题

| 问题 ID | 问题描述 | 严重程度 |
|---------|----------|----------|
| TASK-001 | 任务无法领取 | P0 |
| TASK-002 | 任务处理停滞 | P0 |
| TASK-003 | 任务状态不更新 | P1 |
| TASK-004 | 多实例领取同一任务 | P0 |

### 性能问题

| 问题 ID | 问题描述 | 严重程度 |
|---------|----------|----------|
| PERF-001 | 响应缓慢 | P1 |
| PERF-002 | 内存泄漏 | P0 |
| PERF-003 | CPU 使用率高 | P1 |
| PERF-004 | 磁盘 IO 瓶颈 | P2 |

### 消息队列问题

| 问题 ID | 问题描述 | 严重程度 |
|---------|----------|----------|
| MQ-001 | 消息丢失 | P0 |
| MQ-002 | 消息重复 | P1 |
| MQ-003 | 队列积压 | P1 |
| MQ-004 | 消息顺序错乱 | P2 |

---

## 诊断步骤

### 通用诊断流程

```
1. 收集信息
   │
   ├── 查看错误消息
   ├── 收集日志
   └── 记录复现步骤
   │
   ↓
2. 定位问题
   │
   ├── 确定问题类别
   ├── 确定影响范围
   └── 确定发生频率
   │
   ↓
3. 分析问题
   │
   ├── 查看相关日志
   ├── 检查配置
   └── 使用诊断工具
   │
   ↓
4. 应用修复
   │
   ├── 实施解决方案
   ├── 验证修复效果
   └── 记录解决过程
```

### 信息收集清单

#### 1. 系统信息

```bash
# 操作系统信息
uname -a

# Node.js 版本
node --version
npm --version

# 系统资源
free -h
df -h
uptime
```

#### 2. 应用信息

```bash
# 进程信息
ps aux | grep node

# 监听端口
netstat -tlnp | grep node

# 打开文件数
lsof -p <pid> | wc -l
```

#### 3. 日志信息

```bash
# 最近的错误
tail -100 eket.log | grep -i error

# 最近的警告
tail -100 eket.log | grep -i warn

# 特定模块日志
tail -100 eket.log | grep "ConnectionManager"
```

#### 4. 配置信息

```bash
# 环境变量
env | grep EKET

# 配置文件
cat .eket/config/config.yml
```

---

## 解决方案

### 启动问题

#### START-001: 实例启动失败

**症状**:
```
Error: Failed to start instance
```

**可能原因**:
1. 端口被占用
2. 配置文件缺失
3. 权限不足

**诊断步骤**:
```bash
# 1. 检查端口占用
lsof -i :3000

# 2. 检查配置文件
ls -la .eket/config/

# 3. 检查权限
ls -la .eket/
```

**解决方案**:
```bash
# 方案 1: 释放端口
kill $(lsof -t -i :3000)

# 方案 2: 创建配置目录
mkdir -p .eket/config
cp template/.eket/config/config.yml .eket/config/

# 方案 3: 修复权限
chmod -R 755 .eket/
```

---

#### START-002: Master 选举卡住

**症状**:
```
[MasterElection] Lock acquired, waiting for declaration period...
（长时间无后续输出）
```

**可能原因**:
1. 锁文件残留
2. 时钟不同步
3. 网络分区

**诊断步骤**:
```bash
# 1. 检查锁文件
ls -la .eket/state/master_lock/
cat .eket/state/master_lock/lock

# 2. 检查 Master 标记
cat confluence/.eket_master_marker

# 3. 检查系统时间
date
```

**解决方案**:
```bash
# 方案 1: 清理锁文件
rm -rf .eket/state/master_lock/
rm confluence/.eket_master_marker

# 方案 2: 同步时间
sudo ntpdate -s time.nist.gov

# 方案 3: 重启实例
pkill -f "node.*eket"
sleep 2
node dist/index.js start-instance
```

---

#### START-003: 端口被占用

**症状**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**诊断步骤**:
```bash
# 查找占用端口的进程
lsof -i :3000
netstat -tlnp | grep 3000
```

**解决方案**:
```bash
# 方案 1: 停止占用进程
kill $(lsof -t -i :3000)

# 方案 2: 使用不同端口
node dist/index.js web:dashboard --port 3001
```

---

#### START-004: 环境变量未设置

**症状**:
```
Warning: EKET_API_KEY not set, using default
```

**诊断步骤**:
```bash
# 检查环境变量
env | grep EKET
```

**解决方案**:
```bash
# 方案 1: 设置环境变量
export EKET_API_KEY=your-secure-key

# 方案 2: 创建.env 文件
cat > .env << EOF
EKET_API_KEY=your-secure-key
EKET_LOCAL_REDIS_HOST=localhost
EKET_LOCAL_REDIS_PORT=6379
EOF
```

---

### 连接问题

#### CONN-001: Redis 连接失败

**症状**:
```
[ConnectionManager] Connected to SQLite (fallback)
```

**可能原因**:
1. Redis 服务未启动
2. 连接配置错误
3. 网络问题

**诊断步骤**:
```bash
# 1. 检查 Redis 服务
redis-cli ping
systemctl status redis

# 2. 检查配置
echo $EKET_LOCAL_REDIS_HOST
echo $EKET_LOCAL_REDIS_PORT

# 3. 检查网络
telnet $EKET_LOCAL_REDIS_HOST $EKET_LOCAL_REDIS_PORT
```

**解决方案**:
```bash
# 方案 1: 启动 Redis
systemctl start redis
# 或
docker run -d --name redis -p 6379:6379 redis:latest

# 方案 2: 修正配置
export EKET_LOCAL_REDIS_HOST=localhost
export EKET_LOCAL_REDIS_PORT=6379

# 方案 3: 接受降级
# 系统在 SQLite 或文件模式下仍可正常工作
```

---

#### CONN-002: SQLite 连接失败

**症状**:
```
[ConnectionManager] Using file system (final fallback)
```

**诊断步骤**:
```bash
# 1. 检查 SQLite 文件
ls -la ~/.eket/data/sqlite/

# 2. 检查权限
ls -la ~/.eket/data/

# 3. 检查磁盘空间
df -h
```

**解决方案**:
```bash
# 方案 1: 创建目录
mkdir -p ~/.eket/data/sqlite/

# 方案 2: 修复权限
chmod 755 ~/.eket/data/sqlite/

# 方案 3: 清理空间
rm -f ~/.eket/data/sqlite/eket.db-old
```

---

#### CONN-003: 文件系统权限错误

**症状**:
```
Error: EACCES: permission denied
```

**诊断步骤**:
```bash
# 检查目录权限
ls -la .eket/data/
```

**解决方案**:
```bash
# 修复权限
chmod -R 755 .eket/data/
chown -R $(whoami) .eket/data/
```

---

#### CONN-004: 连接降级频繁

**症状**:
```
[ConnectionManager] Connected to local Redis (fallback)
[ConnectionManager] Upgraded to remote Redis
[ConnectionManager] Connected to local Redis (fallback)
```

**可能原因**:
1. 远程 Redis 不稳定
2. 网络抖动
3. 配置问题

**诊断步骤**:
```bash
# 1. 检查 Redis 稳定性
redis-cli INFO

# 2. 检查网络延迟
ping -c 10 $EKET_REMOTE_REDIS_HOST

# 3. 查看降级频率
grep "fallback" eket.log | wc -l
```

**解决方案**:
```bash
# 方案 1: 修复 Redis 集群
# 联系运维团队检查 Redis 集群

# 方案 2: 增加超时
export EKET_REDIS_TIMEOUT=10000

# 方案 3: 使用本地 Redis
export EKET_LOCAL_REDIS_HOST=localhost
```

---

### 任务问题

#### TASK-001: 任务无法领取

**症状**:
```
Task claim failed: TASK_ALREADY_CLAIMED
```

**诊断步骤**:
```bash
# 1. 检查任务状态
/eket-status

# 2. 查看任务分配
curl -s http://localhost:3000/api/tasks | jq '.data.tasks'

# 3. 检查锁状态
ls -la .eket/state/locks/
```

**解决方案**:
```bash
# 方案 1: 等待任务释放
# 任务有超时机制，超时后会自动释放

# 方案 2: 清理锁
rm -rf .eket/state/locks/

# 方案 3: 重新分配任务
node dist/index.js claim --force <task-id>
```

---

#### TASK-002: 任务处理停滞

**症状**:
```
Task in_progress for > 30 minutes
```

**诊断步骤**:
```bash
# 1. 检查实例状态
/eket-status

# 2. 查看实例心跳
tail -f eket.log | grep Heartbeat

# 3. 检查断路器状态
grep "CircuitBreaker" eket.log
```

**解决方案**:
```bash
# 方案 1: 重启停滞实例
pkill -f "node.*eket"
node dist/index.js start-instance

# 方案 2: 重新分配任务
node dist/index.js claim --reassign <task-id>

# 方案 3: 检查外部依赖
# 如果是 API 调用失败，检查 API 可用性
```

---

### 性能问题

#### PERF-001: 响应缓慢

**症状**:
```
API response time > 5s
```

**诊断步骤**:
```bash
# 1. 检查系统负载
top -bn1 | head -5

# 2. 检查内存使用
free -h

# 3. 检查磁盘 IO
iostat -x 1 5
```

**解决方案**:
```bash
# 方案 1: 增加资源
# 增加 CPU 或内存

# 方案 2: 优化查询
# 检查是否有慢查询

# 方案 3: 清理缓存
rm -rf ~/.eket/cache/
```

---

#### PERF-002: 内存泄漏

**症状**:
```
RSS memory continuously increasing
```

**诊断步骤**:
```bash
# 1. 监控内存使用
ps aux | grep node

# 2. 生成堆快照
kill -USR2 <pid>

# 3. 分析堆快照
node --inspect dist/index.js
```

**解决方案**:
```bash
# 方案 1: 重启实例
pkill -f "node.*eket"
node dist/index.js start-instance

# 方案 2: 设置内存限制
NODE_OPTIONS="--max-old-space-size=2048" node dist/index.js

# 方案 3: 修复代码
# 检查事件监听器泄漏、未清理的定时器等
```

---

### 消息队列问题

#### MQ-001: 消息丢失

**症状**:
```
Message sent but not received
```

**诊断步骤**:
```bash
# 1. 检查队列状态
ls -la .eket/data/queue/pending/

# 2. 查看处理日志
grep "Message processed" eket.log

# 3. 检查校验和
# 文件队列有校验和验证
```

**解决方案**:
```bash
# 方案 1: 检查已处理队列
cat .eket/data/queue/processed/processed.json | jq

# 方案 2: 恢复消息
# 从备份恢复
cp ~/.eket/backups/eket-queue-*.tar.gz .eket/data/queue/
tar -xzf eket-queue-*.tar.gz

# 方案 3: 重新发送
node dist/index.js send-message --retry <message-id>
```

---

#### MQ-002: 消息重复

**症状**:
```
Duplicate message detected
```

**诊断步骤**:
```bash
# 1. 检查去重机制
cat .eket/data/queue/processed/processed.json | jq '.messages | length'

# 2. 查看消息 ID
grep "DUPLICATE_MESSAGE" eket.log
```

**解决方案**:
```bash
# 方案 1: 清理去重缓存
rm .eket/data/queue/processed/processed.json

# 方案 2: 增加去重时间
# 修改配置中的 maxAge 参数

# 方案 3: 检查生产者
# 确保生产者有幂等性保证
```

---

## 获取帮助

### 内部资源

| 资源 | 说明 |
|------|------|
| [API 参考](../api/README.md) | API 端点和错误码文档 |
| [运维手册](../ops/runbook.md) | 启动/停止和监控指南 |
| [架构决策](../adr/) | 架构设计决策记录 |

### 诊断工具

```bash
# 系统诊断
./lib/adapters/hybrid-adapter.sh doctor

# Redis 检查
./lib/adapters/hybrid-adapter.sh redis:check

# SQLite 检查
./lib/adapters/hybrid-adapter.sh sqlite:check

# 生成报告
./lib/adapters/hybrid-adapter.sh sqlite:report
```

### 日志位置

| 日志类型 | 位置 |
|----------|------|
| 应用日志 | `./logs/eket.log` |
| 错误日志 | `./logs/error.log` |
| 访问日志 | `./logs/access.log` |
| 审计日志 | `./logs/audit.log` |

### 上报流程

```
1. 收集诊断信息
   │
   ↓
2. 查阅本文档
   │
   ↓
3. 尝试解决方案
   │
   ↓
4. 如果未解决，提交 Issue
   - 问题描述
   - 复现步骤
   - 日志片段
   - 环境信息
```

---

## 附录：错误码快速参考

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| `CONNECTION_FAILED` | 所有连接级别失败 | 检查配置，确保至少有一种连接可用 |
| `REDIS_NOT_CONNECTED` | Redis 连接失败 | 启动 Redis 或接受降级 |
| `SQLITE_NOT_CONNECTED` | SQLite 连接失败 | 检查权限和磁盘空间 |
| `TASK_NOT_FOUND` | 任务不存在 | 检查任务 ID 是否正确 |
| `TASK_ALREADY_CLAIMED` | 任务已被领取 | 等待或重新分配 |
| `CIRCUIT_OPEN` | 断路器打开 | 等待恢复或检查下游服务 |
| `MAX_RETRIES_EXCEEDED` | 超过最大重试次数 | 检查根本原因 |
| `MASTER_ALREADY_EXISTS` | Master 已存在 | 等待选举完成 |
| `ELECTION_FAILED` | 选举失败 | 清理锁文件后重试 |

---

**文档维护**: EKET Framework Team
**反馈**: 请提交 Issue 到项目仓库
