# Level 1: Shell 模式使用指南

**目标**: 纯 Bash 环境下的 EKET 完整功能
**优先级**: ⭐⭐⭐⭐⭐ (最高 - 必须 100% 可用)
**版本**: v2.3.0
**最后更新**: 2026-04-08

---

## 🎯 Level 1 设计理念

**Level 1 是 EKET 的基础层，确保即使在最小化环境下也能完整运行。**

核心原则：
- ✅ **零依赖**: 仅需 Bash 4.0+ 和 Git 2.30+
- ✅ **快速启动**: 30 秒内完成部署
- ✅ **完整功能**: 所有核心 Master-Slaver 协作功能可用
- ✅ **优雅降级**: 作为 Level 2/3 的最终降级目标

---

## 📋 前置要求

```bash
# 检查 Bash 版本 (需要 >= 4.0)
bash --version
# GNU bash, version 4.0 or higher

# 检查 Git 版本 (需要 >= 2.30)
git --version
# git version 2.30 or higher
```

**不需要**：
- ❌ Node.js
- ❌ npm
- ❌ Redis
- ❌ SQLite
- ❌ Docker
- ❌ 任何编程语言运行时

---

## 🚀 30 秒快速启动

### 1. 克隆仓库

```bash
git clone https://github.com/godlockin/eket.git
cd eket
```

### 2. 启动 Master

```bash
./scripts/eket-start.sh --role master
```

**输出示例**：
```
========================================
EKET 实例启动 v0.9.3
========================================

[INFO] 检测到角色: master
[INFO] 初始化 Master 模式...
[INFO] 创建运行时目录: .eket/
[INFO] 启动心跳服务...
[INFO] Master 已就绪
[INFO] 实例 ID: master-20260408-001
```

### 3. 启动 Slaver (新终端)

```bash
./scripts/eket-start.sh --role slaver --profile backend_dev
```

**输出示例**：
```
========================================
EKET 实例启动 v0.9.3
========================================

[INFO] 检测到角色: slaver
[INFO] 配置文件: backend_dev
[INFO] 初始化 Slaver 模式...
[INFO] 连接到 Master...
[INFO] Slaver 已就绪，等待任务...
[INFO] 实例 ID: slaver-20260408-001
```

---

## 📁 运行时目录结构

Level 1 使用文件系统作为状态存储：

```
.eket/
├── data/
│   └── queue/
│       ├── pending/        # 待处理消息
│       ├── processing/     # 处理中消息
│       ├── processed.json  # 已处理消息记录
│       └── failed/         # 失败消息
├── inboxes/
│   ├── master/            # Master 收件箱
│   │   └── *.json         # 消息文件
│   └── slaver-{id}/       # Slaver 收件箱
│       └── *.json         # 任务消息
├── heartbeats/
│   ├── master.json        # Master 心跳
│   └── slaver-{id}.json   # Slaver 心跳
└── state/
    ├── tasks.json         # 任务状态
    └── instances.json     # 实例注册表
```

---

## 🔧 核心 Shell 脚本

### 主要脚本

| 脚本 | 功能 | 优先级 |
|------|------|--------|
| `scripts/eket-start.sh` | 启动 Master/Slaver | P0 ⭐⭐⭐⭐⭐ |
| `scripts/heartbeat-monitor.sh` | 心跳监控 | P0 ⭐⭐⭐⭐⭐ |
| `scripts/generate-stats.sh` | 统计报告 | P0 ⭐⭐⭐⭐⭐ |
| `lib/adapters/hybrid-adapter.sh` | 命令路由 | P0 ⭐⭐⭐⭐⭐ |

### 辅助脚本

| 脚本 | 功能 | 优先级 |
|------|------|--------|
| `scripts/cleanup-idle-agents.sh` | 清理空闲 Agent | P1 |
| `scripts/broadcast-task-reset.sh` | 广播任务重置 | P1 |
| `scripts/docker-redis.sh` | Docker Redis 管理 | P2 |
| `scripts/checkpoint-validator.sh` | 检查点验证 | P1 |

---

## 📨 文件队列消息机制

### 消息格式

所有消息使用 JSON 格式，存储为独立文件：

```json
{
  "id": "msg_20260408_001",
  "from": "master",
  "to": "slaver-001",
  "type": "task_assign",
  "timestamp": 1712566800,
  "payload": {
    "task_id": "TASK-001",
    "description": "实现用户登录功能",
    "priority": "high"
  }
}
```

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `task_assign` | Master → Slaver | 任务分配 |
| `task_claim` | Slaver → Master | 认领任务 |
| `task_update` | Slaver → Master | 任务进度更新 |
| `task_complete` | Slaver → Master | 任务完成 |
| `heartbeat` | Both → Both | 心跳信号 |

### 发送消息

```bash
# 创建消息文件
cat > .eket/inboxes/slaver-001/msg_001.json <<EOF
{
  "id": "msg_001",
  "from": "master",
  "to": "slaver-001",
  "type": "task_assign",
  "timestamp": $(date +%s),
  "payload": {
    "task_id": "TASK-001"
  }
}
EOF
```

### 读取消息

```bash
# 检查收件箱
ls .eket/inboxes/master/*.json

# 读取消息内容
cat .eket/inboxes/master/msg_002.json

# 处理完成后移动到 processed
mv .eket/inboxes/master/msg_002.json .eket/data/queue/processed/
```

---

## 🔄 工作流程示例

### 完整的任务分配流程

#### 1. Master 分配任务

```bash
# Master 创建任务消息
cat > .eket/inboxes/slaver-001/task_001.json <<EOF
{
  "id": "task_001",
  "from": "master",
  "to": "slaver-001",
  "type": "task_assign",
  "timestamp": $(date +%s),
  "payload": {
    "task_id": "TASK-001",
    "description": "Fix login bug",
    "files": ["src/auth/login.js"],
    "priority": "high"
  }
}
EOF

echo "[Master] 任务已分配给 slaver-001"
```

#### 2. Slaver 认领任务

```bash
# Slaver 读取收件箱
TASK_FILE=$(ls .eket/inboxes/slaver-001/*.json | head -1)
TASK_DATA=$(cat "$TASK_FILE")

echo "[Slaver] 收到任务: $TASK_DATA"

# Slaver 发送认领确认
cat > .eket/inboxes/master/claim_001.json <<EOF
{
  "id": "claim_001",
  "from": "slaver-001",
  "to": "master",
  "type": "task_claim",
  "timestamp": $(date +%s),
  "payload": {
    "task_id": "TASK-001",
    "status": "in_progress"
  }
}
EOF

# 移动任务到处理中
mv "$TASK_FILE" .eket/data/queue/processing/

echo "[Slaver] 任务认领完成，开始执行"
```

#### 3. Slaver 完成任务

```bash
# Slaver 完成任务后发送消息
cat > .eket/inboxes/master/complete_001.json <<EOF
{
  "id": "complete_001",
  "from": "slaver-001",
  "to": "master",
  "type": "task_complete",
  "timestamp": $(date +%s),
  "payload": {
    "task_id": "TASK-001",
    "status": "done",
    "result": {
      "commit": "abc123",
      "files_changed": 3,
      "tests_passed": true
    }
  }
}
EOF

# 归档任务
mv .eket/data/queue/processing/task_001.json .eket/data/queue/processed/

echo "[Slaver] 任务完成，结果已发送"
```

#### 4. Master 确认完成

```bash
# Master 读取完成消息
COMPLETE_FILE=$(ls .eket/inboxes/master/complete_*.json | head -1)
COMPLETE_DATA=$(cat "$COMPLETE_FILE")

echo "[Master] 任务完成确认: $COMPLETE_DATA"

# 更新任务状态
# (更新 .eket/state/tasks.json)

# 归档消息
mv "$COMPLETE_FILE" .eket/data/queue/processed/

echo "[Master] 任务流程完成"
```

---

## 💓 心跳监控

### 启动心跳监控

```bash
# 后台启动心跳监控
./scripts/heartbeat-monitor.sh &

# 或前台运行
./scripts/heartbeat-monitor.sh
```

### 心跳文件格式

```json
{
  "instance_id": "slaver-001",
  "role": "slaver",
  "profile": "backend_dev",
  "last_heartbeat": 1712566800,
  "status": "active",
  "current_task": "TASK-001"
}
```

### 检查心跳状态

```bash
# 查看所有心跳
ls -lh .eket/heartbeats/

# 读取心跳内容
cat .eket/heartbeats/slaver-001.json

# 检查过期心跳 (>60秒)
find .eket/heartbeats -name '*.json' -mmin +1
```

---

## 📊 生成统计报告

### 运行统计脚本

```bash
./scripts/generate-stats.sh
```

**输出示例**：
```
========================================
EKET 统计报告
生成时间: 2026-04-08 14:30:00
========================================

实例状态:
- Master: 1 个 (active)
- Slaver: 3 个 (2 active, 1 idle)

任务统计:
- 总任务数: 25
- 进行中: 5
- 已完成: 18
- 失败: 2

消息队列:
- 待处理: 3
- 处理中: 5
- 已处理: 120

心跳状态:
- 正常: 3
- 过期: 1 (slaver-003)
```

---

## 🛠️ 常见操作

### 清理空闲 Agent

```bash
./scripts/cleanup-idle-agents.sh
```

### 广播任务重置

```bash
./scripts/broadcast-task-reset.sh TASK-001
```

### 查看运行时数据大小

```bash
du -sh .eket/
```

### 清理所有运行时数据

```bash
rm -rf .eket/
# 警告: 会删除所有状态数据
```

### 备份运行时状态

```bash
tar -czf eket-backup-$(date +%Y%m%d).tar.gz .eket/
```

---

## 🔧 Hybrid Adapter 命令路由

`hybrid-adapter.sh` 是 Level 1 的核心路由器，自动选择 Shell 或 Node.js 实现：

### 使用示例

```bash
# 系统检查 (优先 Node.js，降级到 Shell)
./lib/adapters/hybrid-adapter.sh check

# 启动实例 (Shell 实现)
./lib/adapters/hybrid-adapter.sh start --role master

# Docker Redis 管理 (Shell 脚本)
./lib/adapters/hybrid-adapter.sh docker-redis
```

### 降级逻辑

```bash
# Adapter 自动判断:
if [[ Node.js 可用 && dist/index.js 存在 ]]; then
  # 使用 Node.js 实现 (Level 2/3)
  node dist/index.js $command
else
  # 降级到 Shell 实现 (Level 1)
  bash scripts/$command.sh
fi
```

---

## 📊 性能特性

### Level 1 性能数据

**文件队列操作**：
- Enqueue (写入): ~0.5ms (P50)
- Dequeue (读取): ~0.4ms (P50)
- 峰值吞吐: ~2000 msg/s (单进程)

**文件系统占用**：
- 每个消息: ~500 bytes (JSON)
- 100 个任务: ~50KB
- 1000 条消息: ~500KB

**启动时间**：
- Master 启动: <1 秒
- Slaver 启动: <1 秒
- 心跳监控: <0.5 秒

---

## ⚠️ 限制和注意事项

### 已知限制

1. **单机部署**: Level 1 不支持分布式，仅适用于单机或本地开发
2. **文件锁限制**: 并发性能受文件系统限制
3. **无实时通知**: 需要轮询收件箱，不支持实时 Pub/Sub
4. **无事务支持**: 文件操作非原子性，可能出现竞争

### 最佳实践

1. **定期清理**: 定期清理 `.eket/data/queue/processed/` 避免磁盘占满
2. **心跳监控**: 始终运行心跳监控检测故障
3. **消息去重**: 手动检查重复消息（Level 2/3 自动去重）
4. **备份状态**: 重要状态定期备份

---

## 🎓 进阶使用

### 自定义消息处理

创建自己的消息处理脚本：

```bash
#!/bin/bash
# custom-message-handler.sh

INBOX_DIR=".eket/inboxes/master"

while true; do
  # 检查新消息
  for msg_file in "$INBOX_DIR"/*.json; do
    if [ -f "$msg_file" ]; then
      # 读取消息
      msg_data=$(cat "$msg_file")
      msg_type=$(echo "$msg_data" | jq -r '.type')

      # 处理消息
      case "$msg_type" in
        "custom_event")
          echo "[自定义处理] 收到 custom_event"
          # 你的处理逻辑
          ;;
        *)
          echo "[跳过] 未知消息类型: $msg_type"
          ;;
      esac

      # 归档消息
      mv "$msg_file" .eket/data/queue/processed/
    fi
  done

  sleep 1
done
```

### 集成到 CI/CD

```bash
# .github/workflows/eket.yml
name: EKET CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Start EKET Master
        run: |
          ./scripts/eket-start.sh --role master &
          sleep 2
      - name: Run Tests
        run: ./scripts/run-tests.sh
```

---

## 🔗 升级到 Level 2/3

当你需要更强大的功能时，可以无缝升级：

### 升级到 Level 2 (Node.js)

```bash
# 1. 安装 Node.js
# (下载 Node.js 18+ from nodejs.org)

# 2. 安装依赖
cd node && npm install && npm run build

# 3. 运行 (Hybrid Adapter 自动检测)
./lib/adapters/hybrid-adapter.sh check
# 输出: [INFO] 当前运行级别: Level 2 (Node.js + 文件队列)
```

### 升级到 Level 3 (满血版)

```bash
# 1. 启动 Redis
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine

# 2. 运行 (自动检测 Redis)
node dist/index.js system:check
# 输出: [INFO] 当前运行级别: Level 3 (满血版)
```

**数据迁移**: 所有 `.eket/` 文件系统数据在升级后仍然有效，系统会自动迁移到 Redis/SQLite。

---

## 📚 相关文档

- **[三级架构详解](../architecture/THREE-LEVEL-ARCHITECTURE.md)** - 完整架构设计
- **[降级策略](../architecture/DEGRADATION-STRATEGY.md)** - 自动降级机制
- **[文件队列详解](../architecture/FILE-QUEUE.md)** - 队列实现细节
- **[Level 2 指南](./NODEJS-MODE.md)** - Node.js 模式升级
- **[Level 3 指南](./FULL-STACK-MODE.md)** - 满血版部署

---

## ❓ 故障排查

### 问题 1: 实例无法启动

```bash
# 检查 Bash 版本
bash --version

# 检查脚本权限
chmod +x scripts/*.sh

# 查看日志
cat .eket/logs/eket-start.log
```

### 问题 2: 消息未送达

```bash
# 检查收件箱目录
ls -la .eket/inboxes/

# 检查文件权限
chmod -R 755 .eket/

# 手动发送测试消息
echo '{"id":"test","from":"test","to":"master","type":"ping"}' \
  > .eket/inboxes/master/test.json
```

### 问题 3: 心跳过期

```bash
# 重启心跳监控
pkill -f heartbeat-monitor
./scripts/heartbeat-monitor.sh &

# 手动更新心跳
cat > .eket/heartbeats/slaver-001.json <<EOF
{
  "instance_id": "slaver-001",
  "last_heartbeat": $(date +%s),
  "status": "active"
}
EOF
```

---

**Level 1 Shell 模式 - 简单、稳定、可靠！**

开始使用：
```bash
git clone https://github.com/godlockin/eket.git && cd eket
./scripts/eket-start.sh --role master
```

---

**版本**: v2.3.0
**最后更新**: 2026-04-08
**维护者**: EKET Framework Team
