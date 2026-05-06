# TASK-260: Webhook secret 加密：XOR 替换为 AES-256-GCM

## 元数据
- **状态**: duplicate
- **类型**: feature
- **优先级**: P1
- **负责人**: slaver_1776695133821_534ccf79
- **创建时间**: 2026-05-05
- **完成时间**: 2026-05-06
- **依赖**: []
- **所需专家**: rust, security
- blocked_by: []
- required_expertise: [rust, security]
- **duplicate_of**: TASK-259

## 背景

Webhook secret 需从 XOR 升级到 AES-256-GCM。

## 验收标准

- [x] 已在 TASK-259 实现（commit `e17b55057`）
- [x] 使用 `aes-gcm` crate (v0.10)
- [x] 实现 `encrypt_with_key()` 和 `decrypt_with_key()` 函数
- [x] 格式：`hex(nonce):hex(ciphertext)`（12-byte nonce + AES-256-GCM 密文）
- [x] 向后兼容 XOR 解密（migration fallback）

## 技术方案

### 已实现方案（TASK-259）

**文件**: `rust/crates/eket-core/src/webhook.rs` (L177-266)

**加密实现**:
```rust
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

fn encrypt_with_key(plaintext: &str, key: Option<&[u8; 32]>) -> String {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    match cipher.encrypt(nonce, plaintext.as_bytes()) {
        Ok(ciphertext) => format!("{}:{}", hex::encode(nonce_bytes), hex::encode(ciphertext)),
        Err(_) => plaintext.to_string(), // fallback
    }
}
```

**解密实现**（含 XOR migration）:
```rust
fn decrypt_with_key(ciphertext: &str, key: Option<&[u8; 32]>) -> String {
    // Try AES-GCM format: "hex_nonce:hex_ciphertext"
    if let Some((nonce_hex, ct_hex)) = ciphertext.split_once(':') {
        if let (Ok(nonce_bytes), Ok(ct_bytes)) = (hex::decode(nonce_hex), hex::decode(ct_hex)) {
            if nonce_bytes.len() == 12 {
                let cipher = Aes256Gcm::new(key.into());
                if let Ok(plain) = cipher.decrypt(Nonce::from_slice(&nonce_bytes), ct_bytes.as_ref()) {
                    return String::from_utf8(plain).unwrap_or_default();
                }
            }
        }
    }
    
    // Migration fallback: try legacy XOR
    if let Ok(bytes) = hex::decode(ciphertext) {
        let key_str = std::env::var("EKET_WEBHOOK_KEY").unwrap_or_default();
        let key_bytes = key_str.as_bytes();
        let dec: Vec<u8> = bytes.iter().enumerate()
            .map(|(i, b)| b ^ key_bytes[i % key_bytes.len()])
            .collect();
        if let Ok(s) = String::from_utf8(dec) {
            return s;
        }
    }
    
    ciphertext.to_string() // plaintext fallback
}
```

**依赖**: `aes-gcm = "0.10"` in `rust/crates/eket-core/Cargo.toml`

## 分析记录

**领取时间**: 2026-05-06T14:00:00+08:00
**执行者**: slaver_1776695133821_534ccf79

**结论**: TASK-260 与 TASK-259 重复。TASK-259 已于 2026-05-05 实现完成（commit `e17b55057`），包含：
- AES-256-GCM 加密（`aes_gcm` crate）
- 12-byte nonce + 密文格式
- XOR 向后兼容（migration fallback）
- 密钥加载（`EKET_WEBHOOK_KEY` / `EKET_ENCRYPTION_KEY`）

**测试验证**:
```bash
cd rust && grep -rn "aes_gcm\|Aes256Gcm" crates/eket-core/src/webhook.rs
# L185-188: use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
# L196: let cipher = Aes256Gcm::new(key.into());
# L234: let cipher = Aes256Gcm::new(key.into());
```

**关联实现**:
- TASK-259: AES-256-GCM 基础实现 (done)
- TASK-262: SSRF 防护 + secret 泄漏防护 (done)
- TASK-263: Webhook 测试覆盖 (done)

TASK-260 标记为 `duplicate`，不需要额外开发。
