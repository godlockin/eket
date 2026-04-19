# EKET 备份恢复策略文档

**版本**: 2.0.0
**最后更新**: 2026-04-02
**文档状态**: 生产就绪

---

## 1. 概述

本文档定义 EKET 框架的备份恢复策略，确保数据持久性和灾难恢复能力。

### 1.1 备份目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **RPO (Recovery Point Objective)** | < 1 小时 | 最大可接受数据丢失时间 |
| **RTO (Recovery Time Objective)** | < 15 分钟 | 最大可接受恢复时间 |
| **备份保留期** | 7 天 | 历史备份保留时长 |
| **备份频率** | 每小时 | 自动备份间隔 |

### 1.2 备份范围

| 数据类型 | 备份方式 | 频率 | 保留策略 |
|----------|----------|------|----------|
| SQLite 数据库 | 定时备份脚本 + 压缩存储 | 每小时 | 7 天 / 168 个备份 |
| Redis 数据 | RDB 快照 + AOF 日志 | 每 15 分钟 + 实时 | 持久化存储 |
| processed.json | 双备份 + 原子写入 | 实时 | 主文件 + 备份文件 |
| 文件队列 | 归档机制 | 1 小时后归档 | 24 小时 + 归档存储 |

---

## 2. SQLite 备份策略

### 2.1 自动备份配置

**脚本位置**: `scripts/backup-sqlite.sh`

**备份特性**:
- 每小时自动备份（通过 cron 或系统定时器）
- 使用 SQLite 在线备份模式（避免锁定）
- gzip 压缩存储（压缩级别 9）
- SHA-256 校验和验证
- 自动清理过期备份

**备份文件命名**:
```
eket_backup_YYYYMMDD_HHMMSS.db.gz
```

**备份目录结构**:
```
.eket/data/backups/sqlite/
├── eket_backup_20260402_120000.db.gz
├── eket_backup_20260402_120000.db.gz.sha256
├── eket_backup_20260402_110000.db.gz
├── eket_backup_20260402_110000.db.gz.sha256
└── ...
```

### 2.2 保留策略

| 条件 | 操作 |
|------|------|
| 备份时间 > 7 天 | 自动删除 |
| 备份数量 > 168 个 | 删除最早的备份 |

### 2.3  cron 配置示例

```bash
# 每小时备份 SQLite 数据库
0 * * * * /path/to/eket/scripts/backup-sqlite.sh backup >> /var/log/eket/backup.log 2>&1

# 每天凌晨清理过期备份
0 2 * * * /path/to/eket/scripts/backup-sqlite.sh cleanup >> /var/log/eket/backup.log 2>&1
```

---

## 3. Redis 备份策略

### 3.1 RDB + AOF 双持久化

**配置文件**: `scripts/docker-redis.sh`（自动生成 Redis 配置）

**RDB 快照配置**:
```redis
save 900 1        # 15 分钟内至少 1 次更改
save 300 10       # 5 分钟内至少 10 次更改
save 60 10000     # 1 分钟内至少 10000 次更改
dbfilename dump.rdb
dir /data
rdbcompression yes
rdbchecksum yes
```

**AOF 配置**:
```redis
appendonly yes
appendfsync everysec
appendfilename "appendonly.aof"
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
aof-use-rdb-preamble yes
```

### 3.2 持久化说明

| 策略 | 说明 | 数据安全性 | 性能影响 |
|------|------|------------|----------|
| RDB | 定时数据快照 | 可能丢失 15 分钟数据 | 低 |
| AOF | 记录每次写操作 | 最多丢失 1 秒数据 | 中 |
| RDB+AOF | 双重保护 | 最高 | 中 |

### 3.3 Redis 数据恢复

```bash
# 停止 Redis 容器
./scripts/docker-redis.sh stop

# RDB 恢复：将备份的 dump.rdb 复制到数据目录
cp /backup/dump.rdb .eket/data/redis/dump.rdb

# AOF 恢复：将备份的 appendonly.aof 复制到数据目录
cp /backup/appendonly.aof .eket/data/redis/appendonly.aof

# 重启容器
./scripts/docker-redis.sh start
```

---

## 4. processed.json 备份策略

### 4.1 双备份机制

**实现位置**: `node/src/core/file-queue-manager.ts`

**备份文件**:
- 主文件：`.eket/data/queue/processed.json`
- 冗余备份：`.eket/data/queue/processed.json.bak`

### 4.2 原子写入流程

```
1. 写入临时文件：processed.json.tmp.{timestamp}
       ↓
2. fsync 确保数据落盘
       ↓
3. 复制现有文件到备份（如果存在）
       ↓
4. 原子重命名临时文件到目标文件
       ↓
5. fsync 目录确保元数据落盘
       ↓
6. 同步冗余备份
```

### 4.3 故障恢复

当检测到文件损坏时：
1. 优先尝试加载主文件
2. 主文件损坏时，从 `.bak` 备份恢复
3. 备份也损坏时，重置为空集合并记录错误

---

## 5. 文件队列归档策略

### 5.1 归档配置

| 参数 | 值 | 说明 |
|------|-----|------|
| `maxAge` | 24 小时 | 消息最大保留时间 |
| `archiveAfter` | 1 小时 | 归档触发时间 |

### 5.2 归档流程

```
新消息 → queue/ 目录
    ↓
1 小时后 → 移动到 queue-archive/ 目录
    ↓
24 小时后 → 自动删除
```

---

## 6. 备份验证

### 6.1 SQLite 备份验证

```bash
# 验证最新备份
./scripts/backup-sqlite.sh verify <备份文件名>

# 列出所有备份及验证状态
./scripts/backup-sqlite.sh list

# 显示备份统计
./scripts/backup-sqlite.sh stats
```

### 6.2 验证内容

- SHA-256 校验和匹配
- gzip 压缩完整性
- SQLite 数据库可打开且可查询

---

## 7. 监控和告警

### 7.1 备份健康检查

| 检查项 | 频率 | 告警条件 |
|--------|------|----------|
| 最新备份时间 | 每小时 | > 2 小时无新备份 |
| 备份文件大小 | 每次备份 | 大小异常（< 1KB 或 > 1GB） |
| 校验和验证 | 每次备份 | 校验和不匹配 |
| 磁盘空间 | 每天 | 备份目录使用率 > 80% |

### 7.2 备份统计 API

```typescript
interface BackupStats {
  totalBackups: number;
  totalSize: string;
  oldestBackup: string;
  newestBackup: string;
  lastBackupTime: string;
  lastBackupStatus: 'success' | 'failed';
}
```

---

## 8. 灾难恢复流程

### 8.1 恢复优先级

| 优先级 | 数据类型 | RTO | 恢复步骤 |
|--------|----------|-----|----------|
| P0 | Redis 数据 | 5 分钟 | 重启容器，加载 RDB/AOF |
| P0 | SQLite 数据库 | 10 分钟 | 从最新备份恢复 |
| P1 | processed.json | 1 分钟 | 自动从备份恢复 |
| P2 | 文件队列归档 | 30 分钟 | 从归档目录恢复 |

### 8.2 完整恢复流程

详见 `docs/backup-restore-procedures.md`

---

## 9. 安全考虑

### 9.1 备份加密（未来增强）

- 备份文件使用 AES-256 加密
- 密钥管理系统集成
- 加密密钥与数据分离存储

### 9.2 访问控制

- 备份目录权限：`chmod 700`
- 备份文件权限：`chmod 600`
- 仅 root 和 eket 用户可访问

### 9.3 异地备份（未来增强）

- 每日备份同步到远程存储（S3/GCS）
- 增量备份减少带宽使用
- 异地恢复测试每季度执行

---

## 10. 附录

### 10.1 相关文档

- `docs/backup-restore-procedures.md` - 详细恢复步骤
- `scripts/backup-sqlite.sh` - SQLite 备份脚本
- `scripts/docker-redis.sh` - Redis 容器管理
- `node/src/core/file-queue-manager.ts` - 文件队列管理

### 10.2 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 2.0.0 | 2026-04-02 | 初始版本，完整备份恢复策略 |

---

**维护者**: EKET Framework Team
**审核状态**: 已审核
**下次审核日期**: 2026-07-02
