# TASK-655: Shell Injection 防护 (Linus P0)

**EPIC**: EPIC-017  
**状态**: todo  
**优先级**: P0  
**预估**: 0.5d  
**依赖**: 无  
**层级**: L1 Rust  
**来源**: Linus Review (BLOCKING)

---

## 问题描述

`executor.rs:249-251` 直接把用户脚本传给 shell 执行，无任何过滤：

```rust
let mut cmd = Command::new(&self.config.shell);
cmd.arg("-c").arg(script);
```

DAG YAML 可能来自外部输入，存在 shell injection 风险。

## 验收标准

- [ ] 添加脚本白名单/黑名单校验
- [ ] 禁止危险字符：`|`, `;`, `$(`, `` ` ``, `>`, `<`, `&`
- [ ] 或：限制为预定义命令集 (allowlist)
- [ ] 单元测试覆盖注入场景

## 实现方案

```rust
fn validate_script(script: &str) -> Result<(), ScriptValidationError> {
    let dangerous = ['|', ';', '`', '$', '>', '<', '&'];
    if script.chars().any(|c| dangerous.contains(&c)) {
        return Err(ScriptValidationError::DangerousCharacter);
    }
    // 或使用 allowlist
    let allowed_prefixes = ["eket ", "npm ", "cargo ", "git "];
    if !allowed_prefixes.iter().any(|p| script.starts_with(p)) {
        return Err(ScriptValidationError::NotInAllowlist);
    }
    Ok(())
}
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-02 | 创建 ticket (Linus Review P0 BLOCKING) | Master |
