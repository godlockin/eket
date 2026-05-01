# TASK-142: task:resume 降级策略 + 测试补完

## 元数据
- **状态**: backlog
- **类型**: feature / test
- **优先级**: P3
- **创建时间**: 2026-04-21

## 背景

base 版本 `node/src/commands/task-resume.ts` 含 `resumeWithFallback` 函数 +
`task-resume-fallback.test.ts`（82 行测试，覆盖 Redis 不可用时降级到 SQLite-only 删除 checkpoint）。

Rust 版 `rust/crates/eket-cli/src/commands/task_resume.rs`（114 行）：
- ✅ 基本 resume：`SqliteClient.get_checkpoint` → resumable / not_found / error
- ❌ 无 fallback 逻辑，grep `fallback|degrad` 零匹配
- 只有 2 个 #[test]，未覆盖 Redis 失效路径

**前置问题**：Rust 端是否完全去 Redis 化？
- 若是：fallback 概念可弃，但需明确写入 ADR 说明"SQLite-first，无 Redis 依赖"
- 若否：必须补 fallback 逻辑 + 测试

## 验收标准

1. ADR：明确 Redis 在 Rust EKET 中的角色（必需 / 可选 / 废弃）
2. 若 Redis 仍可选：补 `task_resume.rs` 的 Redis-fail 降级路径 + ≥ 3 单测
3. 若 Redis 废弃：在 `rust/docs/REDIS-DEPRECATION.md` 写明，并清理 deps
4. 至少 5 个 task_resume 单测：正常路径 / checkpoint 缺失 / DB 错误 / metadata 损坏 / 并发 resume

## 技术提示

- 原 TS fallback 实现：`git show e5ac393b:node/src/commands/task-resume.ts | sed -n '/resumeWithFallback/,/^}/p'`
- 原测试：`git show e5ac393b:node/tests/commands/task-resume-fallback.test.ts`
- Rust 测试位置：`rust/crates/eket-cli/src/commands/task_resume.rs:71` (#[cfg(test)] 模块内扩展)
