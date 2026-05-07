# TASK-192: timestamp解析失败不应fallback到Utc::now()

**状态**: done

**优先级**: P2
**类型**: Bug
**模块**: eket-core / registry.rs:264
**来源**: 红队质疑 JeffDean

## 问题描述

`unwrap_or_else(|_| Utc::now())` 让DB中corrupted timestamp的实例永远显示为"刚刚活跃"，heartbeat monitor永不标记其offline，僵尸实例永续。

## 验收标准

- [ ] 解析失败时返回 `Err(EketError::DataCorruption(...))`，不fallback
- [ ] 上层查询处理：跳过corrupted行并记录 `warn!` 日志，不crash
- [ ] 单元测试：corrupted timestamp行被跳过+日志记录
