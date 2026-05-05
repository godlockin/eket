# TASK-267: Webhook 测试覆盖：dispatch集成测试 + HMAC测试向量 + retry计算验证

## 元数据
- **类型**: test
- **优先级**: P2
- **状态**: todo
- **预估**: 0.5d
- **expertise**: rust
- **来源**: PR Review TASK-254（2026-05-05）

## 背景

TASK-254 的 webhook.rs 缺少：
- `dispatch_event` 实际投递路径的集成测试
- HMAC-SHA256 与已知测试向量的验证
- retry 延迟计算的边界值测试
- 并发 DB 访问测试

## 需求

### 测试清单

```rust
// 1. HMAC 测试向量（与已知工具对比）
#[test]
fn test_sign_payload_known_vector() { ... }

// 2. dispatch_event 集成测试（mockito 模拟 HTTP 端点）
#[tokio::test]
async fn test_dispatch_delivers_to_registered_url() { ... }

// 3. retry 延迟计算边界值
#[test]
fn test_retry_delay_boundaries() {
    assert_eq!(retry_delay(0),  Duration::from_secs(60));
    assert_eq!(retry_delay(11), Duration::from_secs(2u64.pow(11) * 60));
    assert_eq!(retry_delay(12), retry_delay(11)); // capped at MAX_ATTEMPTS-1
}

// 4. mark_retry → get_due_retries 往返
#[tokio::test]
async fn test_retry_roundtrip() { ... }
```

依赖：`mockito = "1"` 添加到 dev-dependencies。

## 验收标准

- [ ] HMAC 测试向量与 `openssl dgst -sha256 -hmac` 输出一致
- [ ] dispatch 集成测试覆盖成功/4xx/5xx/超时四种场景
- [ ] retry 延迟边界值测试覆盖 attempt 0/11/12
- [ ] `cargo test -p eket-core -- webhook` 全绿（含新增测试）

## 依赖

- **blocked_by**: []
