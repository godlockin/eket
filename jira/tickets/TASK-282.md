# TASK-282: Runtime DB 降级 — Handler 层返回 503

## 元数据
- **状态**: backlog
- **类型**: feature
- **优先级**: P2
- **负责人**: 待认领
- **创建时间**: 2026-05-06
- **依赖**: [TASK-281]
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]
- parent_task: EPIC-042 (Code Review Issues)

## 背景

TASK-281 验证了启动时 DB 不可用会导致服务器拒绝启动（fail-closed）。
但运行时 DB 故障（连接池耗尽、磁盘满、网络分区）时，handler 直接返回 500 Internal Error，
未提供有意义的降级响应。

## 需求

**期望行为**：
- Handler 检测到 DB 连接失败 → 返回 503 Service Unavailable
- 健康检查端点 `/health` 报告 DB 状态（healthy/degraded/down）
- Circuit breaker：连续 N 次 DB 失败后暂停查询，避免雪崩

## 验收标准

- [ ] Handler 层统一错误处理：
  ```rust
  fn handle_db_error(e: sqlx::Error) -> (StatusCode, Json<Value>) {
      match e {
          sqlx::Error::PoolTimedOut | sqlx::Error::PoolClosed => {
              (StatusCode::SERVICE_UNAVAILABLE, json!({"error": "db_unavailable"}))
          }
          _ => (StatusCode::INTERNAL_SERVER_ERROR, json!({"error": "internal"}))
      }
  }
  ```

- [ ] 健康检查增强：
  ```rust
  GET /health
  {
    "status": "degraded",  // healthy | degraded | down
    "components": {
      "db": { "status": "down", "latency_ms": null },
      "auth": { "status": "healthy" }
    }
  }
  ```

- [ ] 集成测试（取消 `tests/auth_degradation.rs` 中的 `#[ignore]`）：
  ```rust
  #[tokio::test]
  async fn runtime_db_failure_returns_503() {
      // 1. 启动服务器（DB 正常）
      // 2. 关闭 DB 连接池
      // 3. GET /api/v1/tasks with auth
      // 4. 断言：503 Service Unavailable
  }
  ```

- [ ] Circuit breaker（可选，P3）：
  - 连续 5 次 DB 错误 → 半开状态（拒绝新请求 30s）
  - 30s 后重试，成功则恢复

## 技术方案

### 实现位置

- `rust/crates/eket-server/src/lib.rs`: 
  - 新增 `handle_db_error()` 辅助函数
  - 更新所有 handler 的 `.map_err(internal_error)` → `.map_err(handle_db_error)`
  
- `rust/crates/eket-server/src/health.rs`:
  - 新增健康检查模块
  - 定期 ping DB (`SELECT 1`)
  - 缓存 DB 状态（避免每次请求都查）

### 依赖项

- `sqlx`: 已有（用于错误类型匹配）
- `tokio::time`: 已有（健康检查定时器）

## 优先级理由

- P2 而非 P1：启动时 fail-closed 已实现（TASK-281），运行时降级影响可用性但不影响安全性
- 用户可通过 `/health` 监控 + 重启服务来 workaround
- Circuit breaker 可延后至 P3（生产环境验证需求后再实现）

## 参考

- TASK-281: Auth 降级测试（启动时 DB 故障）
- Axum error handling: https://docs.rs/axum/latest/axum/error_handling/index.html
- Circuit breaker pattern: https://martinfowler.com/bliki/CircuitBreaker.html
