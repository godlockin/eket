# TASK-139: Hook Server Rust 化评估与方案

## 元数据
- **状态**: done
- **类型**: refactor / tech-design
- **优先级**: P1
- **创建时间**: 2026-04-21
- **依赖**: TASK-138 (Rust Phase 5 已完成)
- **相关**: TASK-140 (DAG middleware)

## 背景

Round 25 Rust 重构已把 task:claim/complete、stale-cleaner、event_bus、SSE/server 等核心搬到 Rust，
但 `node/src/hooks/http-hook-server.ts`（1000+ 行，受理 28 种 Agent 生命周期事件 +
PreToolUse 权限决策）**仍在 Node.js 进程内运行**。Rust 端 grep `hook|guardrail|pre.*tool` 零匹配。

之前 stash 中（来自 fix/docs-audit-cleanup 分支）已删除 `pre-tool-use.ts` 4 节点 DAG pipeline，
意味着即使 Hook server 还在 Node 端跑，**guardrail/security/env-config/audit 四节点的并行编排能力已丢失**。

## 验收标准

1. 输出《Hook Server 演进决策书》：保留 Node / 全 Rust 化 / 混合代理 三选一，附 ADR
2. 若选 Rust 化：在 `rust/crates/eket-hooks/`（或并入 eket-server）实现 `/hooks/{event}` 端点，
   支持至少 5 种核心事件（PreToolUse/PostToolUse/SessionStart/SessionEnd/UserPromptSubmit）
3. 若选保留 Node：明确"Node Hook + Rust Core"的边界文档，写入 `docs/architecture/hook-boundary.md`
4. PreToolUse 权限决策（PermissionChecker）的等价能力必须不丢失
5. 集成测试：从 Claude Code hook → 接收事件 → 决策返回 ≤ 100ms

## 技术提示

- 当前 hook server 入口：`node/src/hooks/http-hook-server.ts:1042` PermissionChecker
- Rust 已有 EventBus (`rust/crates/eket-engine/src/event_bus.rs`)，可作为底层事件广播
- 若 Rust 化，参考 axum 的 SSE/WebSocket 用法
