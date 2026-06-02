# TASK-655: Shell Injection 防护 (Linus P0)

**EPIC**: EPIC-017  
**状态**: done  
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

- [x] 添加脚本白名单/黑名单校验
- [x] 禁止危险字符：`|`, `;`, `$(`, `` ` ``, `>`, `<`, `&`
- [x] 或：限制为预定义命令集 (allowlist)
- [x] 单元测试覆盖注入场景

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

## 实现详情

### 两层防御机制

1. **Blocklist (默认启用)**: 禁止危险字符 `|`, `;`, `` ` ``, `>`, `<`, `&` 和危险模式 `$(`, `${`, `eval `, `exec `
2. **Allowlist (可选启用)**: 通过 `ExecutorConfig.strict_allowlist = true` 限制为预定义命令前缀

### 新增类型

- `ScriptValidationError` - 脚本验证错误枚举
- `ExecutorConfig.strict_allowlist` - 是否启用严格白名单模式

### 测试覆盖 (20 个新测试)

- 安全命令验证
- 危险字符拒绝 (pipe, semicolon, backtick, redirect, background)
- 危险模式拒绝 (command substitution, variable expansion, eval, exec)
- 空脚本拒绝
- Allowlist 模式测试
- 复杂注入场景测试
- Executor 集成测试

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-02 | 创建 ticket (Linus Review P0 BLOCKING) | Master |
| 2026-06-02 | 实现两层防御 + 20 个单元测试，状态 → done | Slaver |
