# TASK-191: 修复选举降级后无法向上恢复——Redis恢复后双Master共存

**优先级**: P1
**类型**: Bug
**模块**: eket-core / election.rs:95
**来源**: 红队质疑 JeffDean

## 问题描述

Redis宕机→实例A通过SQLite赢Master→Redis恢复。无任何机制触发重选，实例B重启走Redis路径赢得Redis-Master，两个Master共存且无epoch区分哪个权威。

## 验收标准

- [ ] 引入 `ElectionEpoch: u64`，每次选举+1，携带在所有消息中
- [ ] Redis恢复探测：非Redis-master实例定期（30s）重试Redis选举
- [ ] Redis选举胜出时广播 `MasterChanged{epoch, new_master_id}` 事件，低epoch让位
- [ ] `ElectionLevel` enum 加优先级排序：Redis > SQLite > File
- [ ] 单元测试：SQLite-master在Redis可用后触发重选并让位
