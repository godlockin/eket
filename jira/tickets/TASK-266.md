# TASK-266: Webhook 安全加固：URL校验(SSRF防护) + secret泄漏防护 + serde修复

## 元数据
- **类型**: bugfix
- **优先级**: P2
**状态**: in_progress
- **预估**: 0.5d
- **expertise**: rust,security
- **来源**: PR Review TASK-254（2026-05-05）

## 背景

PR Review 发现三个安全/一致性问题：
1. `add_url` 无 URL 校验，可注册内网地址（SSRF 风险）
2. `list_urls()` 返回含解密 secret 的完整 `WebhookUrl` struct，序列化即泄漏
3. `WebhookEvent` serde `rename_all = "snake_case"` 产生 `task_created`，但 DB 和 `as_str()` 用点分隔 `task.created`，不一致

## 需求

### 1. URL 校验

```rust
fn validate_webhook_url(url: &str) -> Result<()> {
    let parsed = Url::parse(url)?;
    // 必须 https（或允许 http 但 warn）
    // 拒绝 localhost / 127.x / 10.x / 172.16-31.x / 192.168.x / 169.254.x
    // 拒绝非 80/443 端口（可配置白名单）
}
```

### 2. secret 泄漏防护

新增 `WebhookUrlPublic` 只读结构体（无 secret 字段），`list_urls()` 返回此类型。原 `WebhookUrl` 含 secret 仅内部使用。

### 3. serde 修复

`WebhookEvent` 去掉 `rename_all`，改为手动 `#[serde(rename = "task.created")]` 与 `as_str()` 保持一致。

## 验收标准

- [ ] `eket webhook:add http://169.254.169.254/test` 报错拒绝
- [ ] `eket webhook:list` 输出中 secret 显示为 `***`（已有）且序列化不含原文
- [ ] `WebhookEvent` serde 序列化与 `as_str()` 输出一致（均为点分隔）
- [ ] `cargo test -p eket-core -- webhook_security` 全绿

## 依赖

可与 TASK-264/265 并行

## 分析记录

**领取时间**: 2026-05-05T13:55:36.955980+00:00
**执行者**: slaver_1776695133821_534ccf79

TODO: 填写分析结论
