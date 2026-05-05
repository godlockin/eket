# TASK-264: Webhook secret 加密：XOR 替换为 AES-256-GCM

## 元数据
- **类型**: bugfix
- **优先级**: P1
- **状态**: blocked
- **预估**: 0.5d
- **expertise**: rust,security
- **来源**: PR Review TASK-254（2026-05-05）

## 背景

`rust/crates/eket-core/src/webhook.rs` 的 `encrypt`/`decrypt` 函数使用 XOR + 静态密钥实现"加密"。这是可逆混淆，不是加密：
- URL 有已知前缀（`https://`），构成已知明文攻击
- 频率分析可直接破解静态 XOR 密钥
- 注释写"encrypted at rest"严重误导

需替换为 AES-256-GCM，行业标准对称加密（AEAD）。

## 需求

### 实现方案

```rust
// Cargo.toml 新增
aes-gcm = "0.10"
rand = "0.8"

// webhook.rs
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, KeyInit, OsRng, rand_core::RngCore}};

fn encrypt(plaintext: &str, key_hex: &str) -> Result<String> {
    let key_bytes = hex::decode(key_hex)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())?;
    // 存储格式：nonce(24 hex) + ":" + ciphertext(hex)
    Ok(format!("{}:{}", hex::encode(nonce_bytes), hex::encode(ciphertext)))
}

fn decrypt(encoded: &str, key_hex: &str) -> Result<String> {
    let (nonce_hex, ct_hex) = encoded.split_once(':').ok_or(...)?;
    // ... 反向操作
}
```

密钥来源：`EKET_WEBHOOK_KEY` env var（32字节，64字符 hex）；缺失时 fallback 到 `EKET_ENCRYPTION_KEY`。

### 迁移兼容

现有 DB 中存储的 XOR 加密值需能识别：若解密失败（非 `nonce:ciphertext` 格式），尝试 XOR 解密作为迁移路径，写回时重新用 AES-GCM 加密。

## 验收标准

- [ ] `encrypt`/`decrypt` 使用 AES-256-GCM + 随机 nonce
- [ ] 每次加密同一明文产生不同密文（nonce 随机）
- [ ] `EKET_WEBHOOK_KEY` 缺失时启动报 warn 并 fallback
- [ ] 已有 XOR 密文能被自动迁移（读时解密+重写）
- [ ] `cargo test -p eket-core -- webhook_encrypt` 覆盖 encrypt/decrypt 往返测试
- [ ] `std::env::set_var` 测试 UB 修复（改用参数注入或 `temp_env`）

## 依赖

无（可立即开始）
