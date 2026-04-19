# EKET 备份恢复操作手册

**版本**: 2.0.0
**最后更新**: 2026-04-02
**文档类型**: 操作手册 / Runbook

---

## 1. 快速参考

| 操作 | 命令 | 预计时间 |
|------|------|----------|
| SQLite 备份 | `./scripts/backup-sqlite.sh` | < 1 分钟 |
| SQLite 恢复 | `./scripts/backup-sqlite.sh restore` | < 5 分钟 |
| Redis 备份 | 自动（RDB + AOF） | - |
| Redis 恢复 | 见第 3 节 | < 5 分钟 |
| processed.json 恢复 | 自动恢复 | < 1 分钟 |

---

## 2. SQLite 数据库恢复

### 2.1 查看备份列表

```bash
cd /path/to/eket

# 列出所有备份
./scripts/backup-sqlite.sh list

# 输出示例：
# ========================================
# EKET SQLite 备份列表
# ========================================
#   eket_backup_20260402_120000.db.gz
#     大小：1.2M  日期：2026-04-02 12:00:00  ✓ 已验证
#   eket_backup_20260402_110000.db.gz
#     大小：1.1M  日期：2026-04-02 11:00:00  ✓ 已验证
```

### 2.2 从最新备份恢复

```bash
# 从最新备份恢复（默认行为）
./scripts/backup-sqlite.sh restore
```

### 2.3 从指定备份恢复

```bash
# 从特定备份文件恢复
./scripts/backup-sqlite.sh restore eket_backup_20260402_100000.db.gz

# 或使用完整路径
./scripts/backup-sqlite.sh restore /path/to/eket_backup_20260402_100000.db.gz
```

### 2.4 验证恢复结果

```bash
# 检查 SQLite 数据库
sqlite3 .eket/data/sqlite/eket.db ".tables"

# 应该看到：
# confluence_files    jira_tickets    retrospectives    slaver_processes

# 查询数据
sqlite3 .eket/data/sqlite/eket.db "SELECT COUNT(*) FROM jira_tickets;"
```

### 2.5 手动恢复步骤

如果自动恢复脚本失败，执行手动恢复：

```bash
# 1. 停止相关服务
pkill -f eket  # 如果有运行的实例

# 2. 备份当前数据库（如果存在）
mv .eket/data/sqlite/eket.db .eket/data/sqlite/eket.db.corrupted

# 3. 解压备份文件
gunzip -c .eket/data/backups/sqlite/eket_backup_20260402_120000.db.gz \
  > .eket/data/sqlite/eket.db

# 4. 验证数据库
sqlite3 .eket/data/sqlite/eket.db "PRAGMA integrity_check;"

# 5. 重启服务
./scripts/eket-start.sh
```

---

## 3. Redis 数据恢复

### 3.1 Redis 持久化文件位置

```
.eket/data/redis/
├── dump.rdb          # RDB 快照文件
├── appendonly.aof    # AOF 日志文件
└── redis.conf        # Redis 配置文件
```

### 3.2 从 RDB 快照恢复

```bash
# 1. 停止 Redis 容器
./scripts/docker-redis.sh stop

# 2. 复制备份的 RDB 文件
cp /backup/dump.rdb .eket/data/redis/dump.rdb

# 3. （可选）删除 AOF 文件，仅使用 RDB 恢复
rm .eket/data/redis/appendonly.aof

# 4. 重启 Redis 容器
./scripts/docker-redis.sh start

# 5. 验证数据
redis-cli -p 6380 -a eket_redis_2026 KEYS "*"
```

### 3.3 从 AOF 日志恢复

```bash
# 1. 停止 Redis 容器
./scripts/docker-redis.sh stop

# 2. 复制备份的 AOF 文件
cp /backup/appendonly.aof .eket/data/redis/appendonly.aof

# 3. 重启 Redis 容器（会自动重放 AOF）
./scripts/docker-redis.sh start
```

### 3.4 使用 Redis Tools 恢复

```bash
# 检查 RDB 文件完整性
rdb-cli check .eket/data/redis/dump.rdb

# 使用 redis-check-rdb
redis-check-rdb .eket/data/redis/dump.rdb

# 使用 redis-check-aof
redis-check-aof --fix .eket/data/redis/appendonly.aof
```

---

## 4. processed.json 恢复

### 4.1 自动恢复机制

`processed.json` 的双备份机制会在文件损坏时自动触发恢复：

```typescript
// FileQueueManager 自动执行：
// 1. 尝试加载 processed.json
// 2. 如果损坏，从 processed.json.bak 恢复
// 3. 如果备份也损坏，重置为空集合
```

### 4.2 手动恢复 processed.json

```bash
cd .eket/data/queue/

# 1. 检查文件状态
ls -la processed.json*

# 2. 从备份恢复
cp processed.json.bak processed.json

# 3. 验证 JSON 格式
cat processed.json | jq .

# 4. 如果备份也损坏，创建空文件
echo '{"ids": [], "updated": "'$(date -Iseconds)'"}' > processed.json
```

### 4.3 从归档恢复历史数据

```bash
# 查看归档目录
ls -la .eket/data/queue-archive/

# 恢复特定消息文件
cp .eket/data/queue-archive/<message-file> .eket/data/queue/
```

---

## 5. 完整灾难恢复流程

### 5.1 场景：系统完全崩溃

**恢复步骤**:

```bash
# 步骤 1: 评估损坏情况
echo "=== 检查 SQLite ==="
ls -la .eket/data/sqlite/

echo "=== 检查 Redis ==="
./scripts/docker-redis.sh status

echo "=== 检查消息队列 ==="
ls -la .eket/data/queue/

echo "=== 检查备份 ==="
./scripts/backup-sqlite.sh list
```

```bash
# 步骤 2: 恢复 SQLite 数据库
./scripts/backup-sqlite.sh restore

# 步骤 3: 恢复 Redis 数据
./scripts/docker-redis.sh stop
# 复制 RDB/AOF 备份
./scripts/docker-redis.sh start

# 步骤 4: 恢复 processed.json
cd .eket/data/queue/
cp processed.json.bak processed.json

# 步骤 5: 验证恢复
./scripts/backup-sqlite.sh stats
./scripts/docker-redis.sh status
```

### 5.2 场景：备份服务器恢复

当主服务器完全丢失，需要从备份服务器恢复：

```bash
# 1. 从备份服务器下载备份
scp backup-server:/backups/eket/latest.db.gz .eket/data/backups/sqlite/

# 2. 恢复 SQLite
./scripts/backup-sqlite.sh restore latest.db.gz

# 3. 恢复 Redis
scp backup-server:/backups/eket/dump.rdb .eket/data/redis/
./scripts/docker-redis.sh restart

# 4. 验证
./scripts/backup-sqlite.sh verify latest.db.gz
```

---

## 6. 定期恢复测试

### 6.1 每月恢复测试检查清单

- [ ] SQLite 备份恢复测试
- [ ] Redis RDB 恢复测试
- [ ] processed.json 恢复测试
- [ ] 验证恢复后数据完整性
- [ ] 记录恢复时间（验证 RTO < 15 分钟）
- [ ] 更新恢复文档

### 6.2 恢复测试脚本

```bash
#!/bin/bash
# tests/disaster-recovery/dr-test.sh

set -e

echo "=== EKET 灾难恢复测试 ==="

# 创建测试数据
sqlite3 .eket/data/sqlite/eket.db "INSERT INTO jira_tickets (ticket_id, title, status) VALUES ('DR-TEST-001', 'Disaster Recovery Test', 'test');"

# 执行备份
./scripts/backup-sqlite.sh backup

# 删除数据
sqlite3 .eket/data/sqlite/eket.db "DELETE FROM jira_tickets WHERE ticket_id = 'DR-TEST-001';"

# 恢复数据
./scripts/backup-sqlite.sh restore

# 验证
result=$(sqlite3 .eket/data/sqlite/eket.db "SELECT COUNT(*) FROM jira_tickets WHERE ticket_id = 'DR-TEST-001';")

if [ "$result" = "1" ]; then
  echo "✓ 恢复测试通过"
  exit 0
else
  echo "✗ 恢复测试失败"
  exit 1
fi
```

---

## 7. 故障排查

### 7.1 SQLite 恢复失败

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| "数据库已锁定" | 有进程正在访问 | 停止所有 eket 实例后重试 |
| "校验和不匹配" | 备份文件损坏 | 尝试上一个备份 |
| "磁盘空间不足" | 备份目录已满 | 清理过期备份或扩容 |

### 7.2 Redis 恢复失败

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| "MISCONF RDB 错误" | RDB 文件损坏 | 使用 AOF 恢复或上一个 RDB |
| "容器启动失败" | 配置错误 | 检查 redis.conf 和日志 |
| "数据丢失" | 持久化未生效 | 检查 save 和 appendonly 配置 |

### 7.3 processed.json 恢复失败

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| "JSON 解析失败" | 文件损坏 | 从.bak 备份恢复 |
| "权限拒绝" | 文件权限错误 | `chmod 644 processed.json` |

---

## 8. 备份监控

### 8.1 备份健康检查脚本

```bash
#!/bin/bash
# scripts/check-backup-health.sh

BACKUP_DIR=".eket/data/backups/sqlite"
MAX_AGE_HOURS=2

# 检查最新备份时间
latest=$(ls -1t "$BACKUP_DIR"/eket_backup_*.db.gz 2>/dev/null | head -1)

if [ -z "$latest" ]; then
  echo "CRITICAL: 无备份存在"
  exit 2
fi

# 检查备份年龄
age_hours=$(( ($(date +%s) - $(stat -f %m "$latest" 2>/dev/null || stat -c %Y "$latest")) / 3600 ))

if [ "$age_hours" -gt "$MAX_AGE_HOURS" ]; then
  echo "WARNING: 最新备份 $age_hours 小时前"
  exit 1
fi

echo "OK: 最新备份 $age_hours 小时前"
exit 0
```

### 8.2 集成监控系统

将备份检查集成到现有监控系统：

```bash
# 添加到心跳监控
./scripts/heartbeat-monitor.sh --include-backup-check
```

---

## 9. 附录

### 9.1 备份文件结构

```
.eket/
├── data/
│   ├── backups/
│   │   └── sqlite/
│   │       ├── eket_backup_YYYYMMDD_HHMMSS.db.gz
│   │       └── eket_backup_YYYYMMDD_HHMMSS.db.gz.sha256
│   ├── redis/
│   │   ├── dump.rdb
│   │   └── appendonly.aof
│   ├── queue/
│   │   ├── processed.json
│   │   └── processed.json.bak
│   └── queue-archive/
```

### 9.2 相关文档

- `docs/backup-restore-policy.md` - 备份策略文档
- `scripts/backup-sqlite.sh` - SQLite 备份脚本
- `scripts/docker-redis.sh` - Redis 容器管理

---

**维护者**: EKET Framework Team
**审核状态**: 已审核
**下次演练日期**: 2026-05-02
