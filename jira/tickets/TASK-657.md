# TASK-657: 正则预编译优化 (Linus P1)

**EPIC**: EPIC-017  
**状态**: todo  
**优先级**: P1  
**预估**: 0.5d  
**依赖**: 无  
**层级**: L1 Rust  
**来源**: Linus Review

---

## 问题描述

`executor.rs:24-58` 的 `mask_sensitive()` 每次调用都编译 6 个正则：

```rust
fn mask_sensitive(s: &str) -> String {
    let patterns = [...];
    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {  // 每次调用都编译
```

正则编译是昂贵操作。

## 验收标准

- [ ] 用 `lazy_static!` 或 `once_cell` 预编译正则
- [ ] 基准测试：1000 次调用前后对比

## 实现方案

```rust
use once_cell::sync::Lazy;
use regex::Regex;

static SENSITIVE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)(api[_-]?key|apikey)\s*[=:]\s*['\"]?[\w\-]+").unwrap(),
        Regex::new(r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"]?[^\s'\"]+").unwrap(),
        // ... 其他 patterns
    ]
});

fn mask_sensitive(s: &str) -> String {
    let mut result = s.to_string();
    for re in SENSITIVE_PATTERNS.iter() {
        result = re.replace_all(&result, "[REDACTED]").to_string();
    }
    result
}
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-02 | 创建 ticket (Linus Review P1) | Master |
