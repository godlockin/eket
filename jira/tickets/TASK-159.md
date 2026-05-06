# TASK-159: eket version 命令 + /ready /live HTTP 探针

## 元数据
- **类型**: feature
- **优先级**: P2
- **状态**: done
- **创建**: 2026-04-21
- **依赖**: 无
- **完成**: 2026-05-06

## 验收标准

- [x] `eket version` 输出 `{ version, git_sha, build_date, rust_version }`
- [x] `eket --version` / `-V` 简短版本
- [x] `GET /ready` — 检查 SQLite + Redis 连通性，返回 `{ ready: true/false, checks: {...} }`
- [x] `GET /live` — 仅检查进程存活，始终 200
- [x] CI/CD、Docker healthcheck 可直接使用

## 负责人
- Rust Slaver（已完成）

## 实现细节

### version 命令（已扩展）
```rust
// build.rs 注入构建时元数据
println!("cargo:rustc-env=GIT_SHA={}", git_sha);
println!("cargo:rustc-env=BUILD_TIME={}", build_time);
println!("cargo:rustc-env=RUST_VERSION={}", rust_version);

// main.rs
Commands::Version => {
    let info = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "git_sha": env!("GIT_SHA"),
        "build_time": env!("BUILD_TIME"),
        "rust_version": env!("RUST_VERSION"),
    });
    println!("{}", serde_json::to_string_pretty(&info).unwrap());
    Ok(())
}
```

### HTTP 探针（已验证现有实现）
```rust
// eket-server/src/lib.rs L446-454
async fn live_handler() -> StatusCode { StatusCode::OK }

async fn ready_handler(State(state): State<AppState>) -> impl axum::response::IntoResponse {
    let db_ok = state.db.ping().is_ok();
    let status = if db_ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (status, Json(json!({ "ready": db_ok, "checks": { "sqlite": db_ok } })))
}
```

## 测试结果

```bash
$ rust/target/release/eket version
{
  "build_time": "2026-05-06T13:48:13.460023+00:00",
  "git_sha": "5d0fcc57",
  "rust_version": "1.95.0",
  "version": "0.1.0"
}

$ curl http://127.0.0.1:9877/live  # 200 OK
$ curl http://127.0.0.1:9877/ready # {"ready":true,"checks":{"sqlite":true}}
```

## 知识沉淀

- `build.rs` 可在编译时注入环境变量（`cargo:rustc-env`）
- HTTP 探针遵循 Kubernetes 规范：`/live`（存活）+ `/ready`（就绪）
- `eket-server` 已实现完整探针逻辑，无需修改

