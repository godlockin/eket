# TASK-123: [Rust] instance-registry — 实例注册/发现/心跳

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: []

## 背景

Rust 重构缺少实例注册中心。TS `instance-registry.ts`(24KB) 负责：
- Slaver 上线注册到 SQLite/Redis
- Master 发现可用 Slaver 列表
- 心跳续约（每30s），TTL=90s 超时标 offline
- 执行状态存档（execution_checkpoints）
- 按角色/技能筛选实例

## 验收标准

- [ ] `rust/crates/eket-core/src/registry.rs` 实现 `InstanceRegistry`
- [ ] `register(instance)` → SQLite upsert + Redis HSET（Redis 不可用时降级到仅 SQLite）
- [ ] `heartbeat(instance_id)` → 更新 last_seen，TTL=90s
- [ ] `discover(role_filter)` → 返回在线实例列表（last_seen < 90s）
- [ ] `mark_offline(instance_id)` → 标记下线
- [ ] `save_execution_state(ticket_id, slaver_id, state_json)` → upsert execution_checkpoints
- [ ] `get_execution_state(ticket_id)` → 读取断点续传状态
- [ ] 单元测试 ≥ 6 条，覆盖：注册、发现、心跳续约、TTL 超时、角色筛选、断点续传

## 技术要点

- SQLite schema：`slaver_instances(id, role, skills_json, status, last_seen, metadata_json)`
- Redis key：`eket:instance:{id}` HASH，TTL=90s
- 降级：Redis 不可用时仅用 SQLite（last_seen 字段判活）
- `skills` 存 JSON 数组，筛选时反序列化比较
