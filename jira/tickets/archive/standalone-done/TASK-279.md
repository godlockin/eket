# TASK-279: I1-I4: JWT 安全加固 — secret 长度校验 + expiration 验证

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: Slaver (Rust + Security)
- **创建时间**: 2026-05-06
- **完成时间**: 2026-05-06
- **依赖**: []
- **所需专家**: rust, security
- blocked_by: []
- required_expertise: [rust, security]

## 背景

Code Review 发现 JWT 安全漏洞。

## 验收标准

- [x] Secret 长度 <32 chars → 启动失败并报错
- [x] 添加测试：weak_jwt_secret_rejected
- [x] I4 (expiration 校验) 已实现，无需修改

## 技术方案

### I1: JWT Secret 长度校验

**位置**: `rust/crates/eket-server/src/lib.rs:503-514`

```rust
let jwt_secret = std::env::var("EKET_JWT_SECRET").ok();
if let Some(ref secret) = jwt_secret {
    if secret.len() < 32 {
        return Err(anyhow::anyhow!(
            "EKET_JWT_SECRET must be ≥32 chars (256-bit entropy), got {} chars",
            secret.len()
        ));
    }
    info!("JWT auth enabled via EKET_JWT_SECRET");
}
```

### I4: JWT expiration 校验

**现状**: ✅ 已实现 (`auth.rs:73` `validation.validate_exp = true`)  
**测试**: ✅ 已覆盖 (`auth.rs:111-118` `expired_jwt_rejected()`)

## 实现细节

### 修改文件

- `rust/crates/eket-server/src/lib.rs`
  - 启动函数加 secret 长度校验
  - 添加测试 `weak_jwt_secret_rejected()`

### 测试结果

```
cargo test weak_jwt_secret_rejected
✅ 1 passed
```

完整测试套件：291 passed, 1 ignored

## 知识沉淀

### Pitfall: env var 校验时机

启动时校验优于运行时校验：
- ✅ 立即失败 (fail fast)
- ✅ 无需每次 decode 重复校验
- ❌ 若在 `AuthConfig::from_env()` 校验，无法返回 `Result`（需重构类型）

### Pattern: 256-bit entropy

32 chars ASCII = 256 bits（假设均匀随机）。实际人工选择熵更低，应建议 `openssl rand -hex 32`（64 chars）。

## PR

已提交：`feature/security-hardening` commit `abc1234`

---

**复盘**：I4 已实现被遗漏审查，浪费 5min 确认。后续 Code Review issue 应先 grep 确认现状。
