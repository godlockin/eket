# TASK-265: Webhook retry poller：background tokio task 扫描 next_retry_at

## 元数据
- **类型**: bugfix
- **优先级**: P1
**状态**: done
- **预估**: 1d
- **expertise**: rust
- **来源**: PR Review TASK-254（2026-05-05）

## 背景

TASK-254 实现了指数退避重试的"记账"逻辑（`mark_retry` 写 `next_retry_at` 到 DB），但**没有任何执行者**去读取并触发到期的重试。结果：失败后永远不会重试，指数退避是死逻辑。

## 需求

Server 启动时 spawn background tokio task，每 60s 扫描到期记录：

```rust
pub async fn start_retry_poller(store: Arc<WebhookStore>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            let _ = poll_due_retries(&store).await;
        }
    });
}
```

DB 查询：`WHERE next_retry_at <= now AND completed_at IS NULL AND failed_at IS NULL AND attempt < 12 LIMIT 100`

同时修复：
- 多 URL 串行发送 → `tokio::spawn` per delivery 并行
- `attempt.min(20)` → `attempt.min(MAX_ATTEMPTS - 1)`
- `webhook:retry <id>` 手动重试 reset attempt = 0

## 验收标准

- [ ] Server 启动 60s 内自动重试 `next_retry_at <= now` 的记录
- [ ] `eket webhook:retry <id>` attempt 重置为 0
- [ ] `attempt.min(MAX_ATTEMPTS - 1)` 上限统一
- [ ] 多 webhook URL 并行投递
- [ ] 进程重启后未完成 retry 不丢失
- [ ] `cargo test -p eket-core -- webhook_retry` 全绿

## 依赖

可与 TASK-264 并行

## 分析记录

**领取时间**: 2026-05-05T14:09:02.794005+00:00
**执行者**: slaver_1776695133821_534ccf79

TODO: 填写分析结论

## Summary

> 自动生成摘要（rule-based）

| 项 | 内容 |
|---|---|
| Ticket | TASK-265: Webhook retry poller：background tokio task 扫描 next_retry_at |
| 测试结果 | — |
| PR | — |
| 知识沉淀 | — |
