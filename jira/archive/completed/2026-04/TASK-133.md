# TASK-133: [Rust] eket-server axum HTTP API — /api/v1/* 基础路由

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-123, TASK-124, TASK-126]

## 背景

Node.js Dashboard 需要通过 HTTP 查询 Rust 内部状态。
axum server 监听 `localhost:9877`，提供 `/api/v1/*` REST API。
`eket-server` crate 目前是空壳。

## 验收标准

- [ ] `rust/crates/eket-server/src/main.rs` 启动 axum server，bind `0.0.0.0:9877`（可 env 覆盖）
- [ ] `GET /api/v1/tasks` → 返回所有 ticket 列表（从 tickets 目录扫描 + DAG 状态）
- [ ] `GET /api/v1/tasks/:id` → 单个 ticket 详情
- [ ] `PATCH /api/v1/tasks/:id/status` body: `{ "status": "done"|"in_progress"|"failed" }` → 更新 ticket 状态
- [ ] `GET /api/v1/agents` → 从 InstanceRegistry 返回在线实例列表
- [ ] `GET /api/v1/agents/:id` → 单个实例详情
- [ ] `GET /api/v1/dag` → 完整 DAG（nodes + edges）
- [ ] `GET /health` → `{ "status": "ok", "uptime_secs" }`
- [ ] CORS 允许 localhost 来源（Node.js Dashboard 跨域）
- [ ] 集成测试 ≥ 5 条：各路由 200/404 响应、CORS header

## 技术要点

- axum 0.7 + tower-http CORS（workspace deps 已有）
- `AppState { db: Arc<SqliteClient>, registry: Arc<InstanceRegistry>, dag_dir: PathBuf }`
- 所有路由 handler 为 async fn，错误统一返回 `{ "error": "..." }` JSON + 4xx/5xx
- `CLI eket server` 命令启动此服务（在 eket-cli 加 `server` 子命令）
