# TASK-254: HTTP Webhook Job — 指数退避重试 + webhook_events 可追溯表

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: todo
- **预估**: 1d
- **expertise**: rust,backend
- **来源**: DocuSeal 借鉴研究（2026-05-05）
- **参考**: https://github.com/docusealco/docuseal/blob/master/app/jobs/send_form_completed_webhook_request_job.rb

## 背景

EKET 当前 `EventBus` 是内存 broadcast（`tokio::sync::broadcast`），无法对外通知外部系统。当 Master 完成任务派发、Slaver 完成任务、EPIC 里程碑达成时，外部系统（CI/CD、第三方 SaaS、监控平台）无法感知。

DocuSeal 的 Webhook Job 设计值得直接借鉴：
- `MAX_ATTEMPTS = 12`，延迟公式 `2^attempt` minutes（最长 ~68 天）
- 每次发送记录 attempt 序号 + HTTP status → `webhook_events` 表（可追溯、可手动重触发）
- 失败后外部告警上报

## 需求

### 1. WebhookUrl 数据模型

```rust
// eket.db 新增表
struct WebhookUrl {
    id: i64,
    account_id: Option<String>,  // 多租户预留
    url: String,                 // 加密存储
    secret: Option<String>,      // HMAC 签名密钥，加密存储
    events: Vec<String>,         // JSON，订阅事件列表
    created_at: DateTime,
}

// 支持的事件类型（初版）
enum WebhookEvent {
    TaskCreated,
    TaskClaimed,
    TaskCompleted,
    TaskDeclined,
    EpicCompleted,
    SlaverRegistered,
    SlaverOffline,
}
```

### 2. WebhookEvents 追踪表

```rust
struct WebhookEventRecord {
    id: i64,
    webhook_url_id: i64,
    event_type: String,
    payload: serde_json::Value,
    attempt: u8,
    http_status: Option<u16>,
    next_retry_at: Option<DateTime>,
    created_at: DateTime,
    completed_at: Option<DateTime>,
    failed_at: Option<DateTime>,
}
```

### 3. Webhook 发送 Job

```rust
// rust/crates/eket-core/src/webhook.rs
const MAX_ATTEMPTS: u8 = 12;

// 延迟公式：2^attempt 分钟
// attempt 0 → 1min, 1 → 2min, 2 → 4min ... 11 → ~34h
fn retry_delay(attempt: u8) -> Duration {
    Duration::from_secs(2u64.pow(attempt as u32) * 60)
}
```

- HTTP POST，Content-Type: application/json
- Header `X-Eket-Signature: HMAC-SHA256(secret, payload)` （接收方可验证）
- Header `X-Eket-Event: task.completed`
- Header `X-Eket-Attempt: 3`
- 响应 ≥ 400 或超时 → 按退避延迟重新入队
- 达到 MAX_ATTEMPTS → 标记 `failed_at`，写告警日志

### 4. CLI 命令

```bash
eket webhook:add <URL> --events task.completed,epic.completed --secret <KEY>
eket webhook:list
eket webhook:remove <ID>
eket webhook:retry <event-record-id>   # 手动重触发失败事件
eket webhook:events [--status failed]  # 查看 webhook_events 记录
```

## 验收标准

- [ ] `eket task:complete TASK-NNN` 后触发所有订阅 `task.completed` 的 webhook
- [ ] 接收方收到请求包含正确 HMAC-SHA256 签名
- [ ] HTTP 500 响应后自动按 `2^attempt` 延迟重试，最多 12 次
- [ ] `eket webhook:events --status failed` 能列出失败记录
- [ ] `eket webhook:retry <id>` 手动重触发成功
- [ ] `cargo test -p eket-core -- webhook` 全绿

## 技术要点

- tokio + reqwest（async HTTP client）
- HMAC-SHA256：`hmac` crate
- 重试调度：`tokio::time::sleep` + SQLite `next_retry_at` 持久化（进程重启后仍能恢复）
- 加密存储 secret：AES-256-GCM，密钥来自 `EKET_ENCRYPTION_KEY` env var
