---
id: TASK-054
title: "fix(master-election): 修复三处选举核心 Bug"
priority: P0
status: ready
assignee: backend_dev
dispatched_by: master
created_at: 2026-04-18
---

## 背景

review 发现 master-election.ts 存在三处会导致整个选举机制失效的 Bug，需一并修复。

## 问题清单

### Bug-1: relinquish() 不删除 marker 文件

- 位置：`node/src/core/master-election.ts` → `relinquish()` 方法
- 现象：`relinquish()` 清理了 Redis/SQLite/文件锁，但未删除 `confluence/.eket_master_marker`
- 影响：backup 调用 `promoteToMaster()` → 发现 marker 存在 → 返回 `MASTER_ALREADY_EXISTS` → **backup 永远无法晋升，集群失去 Master 后无法恢复**
- 修复：`relinquish()` 末尾加 `fs.rmSync(markerPath, { force: true })`

### Bug-2: SQLite `master_declaration` 表从未创建

- 位置：`electWithSqlite()` 初始化段（L309 建了 `master_lock` 表，未建 `master_declaration`）
- 现象：L560 执行 `SELECT value FROM master_declaration WHERE id = 1` → 抛 "no such table" → 被 catch 吃掉 → SQLite 冲突检测**静默失效**
- 修复：在 SQLite 初始化时同步创建 `master_declaration` 表，或移除无效的 declarationPeriod('sqlite') 调用

### Bug-3: Redis key prefix 双重叠加

- 位置：`MASTER_LOCK_KEY = 'eket:master:lock'` 与 `RedisClient keyPrefix: 'eket:'`
- 现象：实际写入 key 为 `eket:eket:master:lock`，心跳/声明 key 不匹配
- 影响：Redis 模式下所有选举 key 错位，**整个 Redis 选举链路失效**
- 修复：去掉常量中的 `eket:` 前缀（改为 `master:lock`），统一由 keyPrefix 负责命名空间

## 验收标准

- [ ] Bug-1：新增 `master-election.relinquish-marker.test.ts` 或在现有测试中验证 relinquish 后 marker 文件消失
- [ ] Bug-2：SQLite 初始化后 `master_declaration` 表存在；declarationPeriod('sqlite') 可正常执行
- [ ] Bug-3：确认所有常量 key 不含 `eket:` 前缀；Redis 中实际 key 前缀只有一层
- [ ] `npm test` 全绿
- [ ] `npm run build` 无错误

## 技术方案

Slaver 自行阅读 `node/src/core/master-election.ts` 后制定，Master 不干预实现细节。
