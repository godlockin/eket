# TASK-138: [Rust] Phase 5 集成 — Node.js Dashboard 对接 + 端到端验证

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P2
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-133, TASK-130, TASK-129]

## 背景

Phase 5：Node.js Dashboard 数据请求全部代理到 Rust axum server（:9877）。
`server-start.ts` 改为先启动 `eket server`，再启动 Node web-server。
完成后删除 Node.js 中被 Rust 替代的模块。

## 验收标准

- [ ] `node/src/commands/server-start.ts` 修改：spawn `eket server &` 后再启动 Express
- [ ] `node/src/api/web-server.ts` 所有 `/api/v1/*` 请求代理到 `http://localhost:9877`（http-proxy-middleware）
- [ ] 端到端 smoke test：
  - [ ] `eket server &` 启动成功，`GET /health` 返回 200
  - [ ] `eket slaver:register --role backend --skills rust` 注册成功
  - [ ] `eket task:create "测试 ticket" --priority P1` 创建成功
  - [ ] `eket master:heartbeat` 识别就绪 ticket 并分发
  - [ ] `eket slaver:poll` 收到 TaskAssign，触发 claim
  - [ ] `eket task:complete TASK-NNN` 更新状态，Master 收到 TaskResult
  - [ ] Dashboard `GET /api/v1/tasks` 显示正确数据
- [ ] 与 TS 版本 JSON 输出 schema 100% 兼容（关键字段一致）
- [ ] 性能基准：`eket task:claim` < 50ms（vs TS ~500ms）

## 技术要点

- http-proxy-middleware v3（Node.js 现有依赖或新增）
- Rust server 启动失败时 Node 降级到直接读文件（fallback to FALLBACK.md 方案）
- 删除 Node.js 模块清单：master-election.ts, agent-pool.ts, event-bus.ts（Rust 已替代）
