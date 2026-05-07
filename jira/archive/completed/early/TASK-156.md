# TASK-156: SQLite Schema 版本迁移

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: done
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

当前所有表使用 `CREATE TABLE IF NOT EXISTS`，无版本控制。随着 schema 演进，无法安全增加字段、修改类型，线上升级时数据库可能静默失效。

## 验收标准

- [ ] `schema_version` 表：`(version INTEGER, applied_at TEXT)`
- [ ] `MigrationRunner::run()` 启动时自动检测当前版本并执行缺失 migration
- [ ] migration 文件：`migrations/0001_initial.sql`, `0002_add_skill_field.sql` ...
- [ ] 支持 `eket db:migrate --dry-run` 查看待执行 migration
- [ ] 支持 `eket db:status` 显示当前版本
- [ ] 回滚：每个 migration 有对应 down.sql

## 负责人
待认领（推荐：Rust 工程师 + 后端工程师）
