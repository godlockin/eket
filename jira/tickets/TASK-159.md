# TASK-159: eket version 命令 + /ready /live HTTP 探针

## 元数据
- **类型**: feature
- **优先级**: P2
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 验收标准

- [ ] `eket version` 输出 `{ version, git_sha, build_date, rust_version }`
- [ ] `eket --version` / `-V` 简短版本
- [ ] `GET /ready` — 检查 SQLite + Redis 连通性，返回 `{ ready: true/false, checks: {...} }`
- [ ] `GET /live` — 仅检查进程存活，始终 200
- [ ] CI/CD、Docker healthcheck 可直接使用

## 负责人
待认领（推荐：Rust 工程师 + DevOps）
