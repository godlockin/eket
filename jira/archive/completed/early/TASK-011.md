# TASK-011: SQLite Manager 完整迁移

**负责人**: Slaver A (SQLite Architect)
**优先级**: P1
**预估**: 4-5 小时
**目标**: 完成剩余 15 个文件迁移到 SQLiteManager
**状态**: done
**completed_at**: 2026-04-14T00:00:00Z
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 迁移清单 (优先核心 8 个)
- src/core/sqlite-client.ts, sqlite-async-client.ts
- src/core/event-bus.ts, workflow-engine.ts, knowledge-base.ts
- src/commands/sqlite.ts, instance.ts, task.ts
- (可选) src/api/web-dashboard.ts, openclaw-gateway.ts
- (可选) src/utils/sqlite-helper.ts, tests/

## 策略
- 保持向后兼容 (@deprecated)
- 每个模块迁移后立即测试
- 优先核心模块，API 可延后 v2.4.0

## 产出
- 迁移 8-15 个文件
- 代码重复消除验证
- `docs/architecture/TASK-011-sqlite-migration-completion.md`

## 验收标准
- 核心 8 个文件迁移完成
- 测试通过无回归
- 代码重复减少 ~300 行
